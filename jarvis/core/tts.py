"""Voz de salida con Piper: una voz por idioma, en una tubería de dos hilos.

    decir(frase) ──> [cola de texto] ──hilo síntesis──> [cola de audio] ──hilo reproducción──> altavoz

Mientras suena la frase 1 ya se está sintetizando la 2, así que no hay
huecos entre frases. Como el LLM nos pasa frases en cuanto las escribe, la
voz arranca antes de que el modelo termine de generar la respuesta.
"""
from __future__ import annotations

import logging
import queue
import re
import threading
import time
from typing import Callable

import numpy as np
import sounddevice as sd

from core import idioma as idiomas
from core.config import ruta

log = logging.getLogger("jarvis.tts")

_FIN = object()  # marca interna en las colas


# ----------------------------------------------------------------------
# Texto -> algo que Piper lea bien
# ----------------------------------------------------------------------

def _hora_en_palabras(m: re.Match, idioma: str) -> str:
    h, mi = int(m.group(1)), int(m.group(2))
    if idioma == "en":
        return f"{h} o'clock" if mi == 0 else (f"{h} oh {mi}" if mi < 10 else f"{h} {mi}")
    if idioma == "ca":
        return f"{h} en punt" if mi == 0 else f"{h} i {mi}"
    return f"{h} en punto" if mi == 0 else f"{h} y {mi}"


_UNIDADES = {
    "es": {"GB": "gigas", "MB": "megas", "km": "kilómetros", "ºC": "grados", "°C": "grados"},
    "ca": {"GB": "gigues", "MB": "megues", "km": "quilòmetres", "ºC": "graus", "°C": "graus"},
    "en": {"GB": "gigabytes", "MB": "megabytes", "km": "kilometres", "ºC": "degrees", "°C": "degrees"},
}


def normalizar_para_voz(texto: str, idioma: str) -> str:
    t = re.sub(r"\b([01]?\d|2[0-3]):([0-5]\d)\b", lambda m: _hora_en_palabras(m, idioma), texto)
    if idioma in ("es", "ca"):
        # 15.7 -> 15 coma 7 (pero no 1.000, que es un millar)
        t = re.sub(r"(\d)\.(\d{1,2})\b", r"\1 coma \2", t)
    for unidad, palabra in _UNIDADES.get(idioma, {}).items():
        t = re.sub(rf"(?<=\d)\s*{re.escape(unidad)}\b", f" {palabra}", t)
    return t


# ----------------------------------------------------------------------
# Voz
# ----------------------------------------------------------------------

class Voz:
    def __init__(self, cfg: dict, on_estado: Callable[[bool], None] | None = None):
        c = cfg["tts"]
        self.carpeta = ruta(c.get("carpeta_voces", "data/voces"))
        self.nombres = c.get("voces", {})
        self.length_scale = float(c.get("velocidad", 1.0))
        self.hilos = int(c.get("hilos_cpu", 2))
        self.dispositivo = cfg["audio"].get("dispositivo_salida")
        self.on_estado = on_estado            # avisa al HUD de hablando sí/no

        self._voces: dict[str, object] = {}   # idioma -> PiperVoice
        self._listas: dict[str, threading.Event] = {i: threading.Event() for i in self.nombres}
        self._textos: queue.Queue = queue.Queue()
        self._audios: queue.Queue = queue.Queue()
        self._pendientes = 0                  # frases encargadas aún sin terminar de sonar
        self._cv = threading.Condition()
        self._generacion = 0                  # se incrementa en callar() para descartar lo viejo
        self.t_primer_audio: float | None = None  # perf_counter del primer sonido tras marcar()
        self._sonando: tuple | None = None    # (audio, sr, inicio) de lo que suena ahora

        threading.Thread(target=self._bucle_sintesis, daemon=True, name="tts-sintesis").start()
        threading.Thread(target=self._bucle_reproduccion, daemon=True, name="tts-audio").start()

    # -- carga de voces --------------------------------------------------
    def cargar(self, idioma_primero: str = "es", esperar: bool = True) -> None:
        """Carga las voces en hilos aparte. Espera solo a la del idioma principal."""
        for i in sorted(self.nombres, key=lambda x: x != idioma_primero):
            threading.Thread(target=self._cargar_voz, args=(i,), daemon=True).start()
        if esperar and idioma_primero in self._listas:
            self._listas[idioma_primero].wait()

    def _cargar_voz(self, idioma: str) -> None:
        from piper import PiperVoice  # import pesado: solo si hay voz

        archivo = self.carpeta / f"{self.nombres[idioma]}.onnx"
        if not archivo.exists():
            log.error("Falta la voz %s. Descárgala con:  python -m piper.download_voices "
                      "--download-dir data/voces %s", archivo.name, self.nombres[idioma])
            self._listas[idioma].set()
            return
        t0 = time.perf_counter()
        voz = self._abrir_piper(PiperVoice, archivo)
        list(voz.synthesize("Hola."))  # la 1ª síntesis es lenta (onnxruntime se calienta)
        self._voces[idioma] = voz
        self._listas[idioma].set()
        log.debug("Voz %s lista en %.1f s", self.nombres[idioma], time.perf_counter() - t0)

    def _abrir_piper(self, PiperVoice, archivo):
        """Como PiperVoice.load, pero limitando los hilos de CPU de onnxruntime.

        Por defecto Piper usa todos los núcleos y, como sintetiza mientras
        Ollama aún genera la respuesta, se pelean por la CPU (en un portátil
        la generación del LLM bajaba de 11 a 5 tokens/s). Con 2 hilos Piper
        sigue yendo de sobra en tiempo real.
        """
        import json

        import onnxruntime
        from piper.config import PiperConfig

        opciones = onnxruntime.SessionOptions()
        opciones.intra_op_num_threads = self.hilos
        opciones.inter_op_num_threads = 1
        with open(f"{archivo}.json", encoding="utf-8") as f:
            config = PiperConfig.from_dict(json.load(f))
        sesion = onnxruntime.InferenceSession(str(archivo), sess_options=opciones,
                                              providers=["CPUExecutionProvider"])
        return PiperVoice(config=config, session=sesion)

    def _voz_para(self, idioma: str):
        if idioma not in self._listas:
            idioma = "es"
        self._listas[idioma].wait(timeout=30)
        return self._voces.get(idioma) or next(iter(self._voces.values()), None)

    # -- API pública -------------------------------------------------------
    def decir(self, frase: str, idioma: str = "es") -> None:
        """Encola una frase. Vuelve enseguida; suena en cuanto le toque."""
        if not frase.strip():
            return
        with self._cv:
            self._pendientes += 1
        self._textos.put((self._generacion, frase, idioma))

    def esperar(self, timeout: float | None = None) -> None:
        """Bloquea hasta que se haya dicho todo lo encolado."""
        with self._cv:
            self._cv.wait_for(lambda: self._pendientes == 0, timeout=timeout)

    @property
    def hablando(self) -> bool:
        return self._pendientes > 0

    def nivel(self) -> float:
        """Volumen de lo que está sonando AHORA (0..1), para animar el HUD."""
        sonando = self._sonando
        if sonando is None:
            return 0.0
        audio, sr, inicio = sonando
        i = int((time.perf_counter() - inicio) * sr)
        trozo = audio[max(0, i - sr // 40): i + sr // 40]  # ventana de 50 ms
        if trozo.size == 0:
            return 0.0
        return min(1.0, float(np.sqrt(np.mean(trozo ** 2))) * 6)

    def callar(self) -> None:
        """Corta lo que esté sonando y descarta lo pendiente."""
        self._generacion += 1
        sd.stop()

    def marcar(self) -> None:
        """Pone a cero el cronómetro de 'primer audio' (para medir latencia)."""
        self.t_primer_audio = None

    def pitido(self, frecuencia: float = 880, duracion: float = 0.12, volumen: float = 0.3) -> None:
        """Pitido corto (se usa al oír 'Hey Jarvis'). Bloquea lo que dura."""
        sr = 22050
        t = np.linspace(0, duracion, int(sr * duracion), endpoint=False)
        onda = np.sin(2 * np.pi * frecuencia * t) * volumen
        onda *= np.minimum(1, np.minimum(t, duracion - t) / 0.01)  # sin chasquidos
        sd.play(onda.astype(np.float32), sr, device=self.dispositivo)
        sd.wait()

    # -- hilos ---------------------------------------------------------------
    def _terminada(self) -> None:
        with self._cv:
            self._pendientes -= 1
            if self._pendientes == 0:
                self._cv.notify_all()
                if self.on_estado:
                    self.on_estado(False)

    def _bucle_sintesis(self) -> None:
        from piper.config import SynthesisConfig
        while True:
            gen, frase, idioma = self._textos.get()
            if gen != self._generacion:
                self._terminada()
                continue
            voz = self._voz_para(idioma)
            if voz is None:
                log.warning("No hay ninguna voz cargada; no puedo decir: %s", frase)
                self._terminada()
                continue
            t0 = time.perf_counter()
            texto = normalizar_para_voz(frase, idioma)
            trozos = list(voz.synthesize(texto, SynthesisConfig(length_scale=self.length_scale)))
            if not trozos:
                self._terminada()
                continue
            audio = np.concatenate([c.audio_float_array for c in trozos]).astype(np.float32)
            log.debug("TTS %s: %.0f ms -> %.1f s de audio: %s", idioma,
                      (time.perf_counter() - t0) * 1000, len(audio) / trozos[0].sample_rate, texto)
            self._audios.put((gen, audio, trozos[0].sample_rate))

    def _bucle_reproduccion(self) -> None:
        while True:
            gen, audio, sr = self._audios.get()
            if gen == self._generacion:
                if self.t_primer_audio is None:
                    self.t_primer_audio = time.perf_counter()
                if self.on_estado:
                    self.on_estado(True)
                # Un poquito de silencio al final para que no se coman las frases
                audio = np.concatenate([audio, np.zeros(int(sr * 0.12), dtype=np.float32)])
                self._sonando = (audio, sr, time.perf_counter())
                sd.play(audio, sr, device=self.dispositivo)
                sd.wait()
                self._sonando = None
            self._terminada()


def elegir_idioma(frase: str, idioma_usuario: str) -> str:
    """Voz para una frase: la del usuario salvo que la frase sea claramente de otro idioma
    (p. ej. el modelo contesta en español a una pregunta en inglés)."""
    return idiomas.detectar(frase, por_defecto=idioma_usuario)
