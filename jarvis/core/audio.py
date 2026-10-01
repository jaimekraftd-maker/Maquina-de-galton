"""Entrada de audio: micrófono, detector de voz (VAD) y grabación de frases.

Todo el audio de entrada va a 16 kHz, mono, int16, en bloques de 1280
muestras (80 ms), que es justo lo que piden openWakeWord y Whisper.

    Microfono ──bloques de 80 ms──> wakeword (fase 5) / grabar_frase()
                                                 │
                                       DetectorVoz (Silero VAD)
"""
from __future__ import annotations

import collections
import logging
import queue
import time

import numpy as np

log = logging.getLogger("jarvis.audio")

SR = 16000          # muestras por segundo
BLOQUE = 1280       # 80 ms
MS_BLOQUE = 80


def nivel_rms(bloque_int16: np.ndarray) -> float:
    """Volumen aproximado de un bloque, escalado a 0..1 (voz normal ≈ 0.3-0.7)."""
    rms = float(np.sqrt(np.mean((bloque_int16.astype(np.float32) / 32768.0) ** 2)))
    return min(1.0, rms * 8)


class Microfono:
    """Captura continua del micrófono a una cola, con sounddevice."""

    def __init__(self, dispositivo=None):
        self.dispositivo = dispositivo
        self._cola: queue.Queue[np.ndarray] = queue.Queue(maxsize=200)  # ~16 s
        self._stream = None
        self.silenciado = False  # mientras Jarvis habla no queremos oírnos a nosotros mismos
        self.nivel = 0.0         # volumen del último bloque, 0..1 (lo dibuja el HUD)

    def iniciar(self) -> None:
        import sounddevice as sd

        def callback(indata, frames, tiempo, estado):
            if estado:
                log.debug("Estado del micro: %s", estado)
            self.nivel = nivel_rms(indata[:, 0])
            if self.silenciado:
                return
            try:
                self._cola.put_nowait(indata[:, 0].copy())
            except queue.Full:  # nadie está leyendo: tiramos lo más viejo
                try:
                    self._cola.get_nowait()
                except queue.Empty:
                    pass

        self._stream = sd.InputStream(samplerate=SR, channels=1, dtype="int16",
                                      blocksize=BLOQUE, device=self.dispositivo, callback=callback)
        self._stream.start()

    def detener(self) -> None:
        if self._stream is not None:
            self._stream.stop()
            self._stream.close()
            self._stream = None

    def leer(self, timeout: float = 0.5) -> np.ndarray | None:
        try:
            return self._cola.get(timeout=timeout)
        except queue.Empty:
            return None

    def vaciar(self) -> None:
        """Descarta lo acumulado (p. ej. el eco de la propia voz de Jarvis)."""
        while not self._cola.empty():
            try:
                self._cola.get_nowait()
            except queue.Empty:
                break


class FuenteSimulada:
    """Hace de micrófono a partir de un audio ya grabado (para pruebas sin hablar).

    Entrega bloques de 80 ms al ritmo real, como un micro de verdad, y
    después silencio. Así se pueden medir latencias de forma reproducible.
    """

    def __init__(self, audio_int16: np.ndarray | None = None, ruido: float = 30.0):
        self.silenciado = False
        self.nivel = 0.0
        self.ruido = ruido
        self._pendiente = np.zeros(0, dtype=np.int16)
        self._siguiente = time.perf_counter()
        if audio_int16 is not None:
            self.poner(audio_int16)

    def poner(self, audio_int16: np.ndarray, silencio_antes_s: float = 0.5) -> None:
        silencio = np.zeros(int(SR * silencio_antes_s), dtype=np.int16)
        self._pendiente = np.concatenate([self._pendiente, silencio, audio_int16.astype(np.int16)])

    def iniciar(self) -> None:
        self._siguiente = time.perf_counter()

    def detener(self) -> None:
        pass

    def vaciar(self) -> None:
        pass

    def leer(self, timeout: float = 0.5) -> np.ndarray:
        espera = self._siguiente - time.perf_counter()
        if espera > 0:
            time.sleep(espera)
        self._siguiente = max(self._siguiente, time.perf_counter()) + BLOQUE / SR
        if self.silenciado:  # Jarvis está hablando: el "usuario" espera su turno
            return np.zeros(BLOQUE, dtype=np.int16)
        if len(self._pendiente) >= BLOQUE:
            bloque, self._pendiente = self._pendiente[:BLOQUE], self._pendiente[BLOQUE:]
        else:
            bloque = np.zeros(BLOQUE, dtype=np.int16)
            bloque[:len(self._pendiente)] = self._pendiente
            self._pendiente = np.zeros(0, dtype=np.int16)
        # Un poco de ruido de fondo, como en una habitación real
        ruido = np.random.normal(0, self.ruido, BLOQUE)
        bloque = np.clip(bloque + ruido, -32768, 32767).astype(np.int16)
        self.nivel = nivel_rms(bloque)
        return bloque


class DetectorVoz:
    """Probabilidad de que haya voz en un bloque, con el Silero VAD que trae
    faster-whisper (modelo ONNX diminuto, ~1 ms por bloque en CPU)."""

    VENTANA = 512  # Silero trabaja en ventanas de 512 muestras (32 ms)

    def __init__(self):
        from faster_whisper.vad import get_vad_model
        self._modelo = get_vad_model()
        self._resto = np.zeros(0, dtype=np.float32)
        self._contexto = np.zeros(self.VENTANA, dtype=np.float32)

    def reiniciar(self) -> None:
        self._resto = np.zeros(0, dtype=np.float32)
        self._contexto = np.zeros(self.VENTANA, dtype=np.float32)

    def prob(self, bloque_int16: np.ndarray) -> float:
        """Máxima probabilidad de voz en las ventanas completas de este bloque."""
        audio = np.concatenate([self._resto, bloque_int16.astype(np.float32) / 32768.0])
        n = (len(audio) // self.VENTANA) * self.VENTANA
        if n == 0:
            self._resto = audio
            return 0.0
        ventanas, self._resto = audio[:n], audio[n:]
        # Le pasamos también la ventana anterior como contexto y descartamos su salida
        salida = self._modelo(np.concatenate([self._contexto, ventanas]))
        self._contexto = ventanas[-self.VENTANA:]
        probs = np.asarray(salida).reshape(-1)[1:]
        return float(probs.max()) if probs.size else 0.0


def grabar_frase(fuente, vad: DetectorVoz, cfg_audio: dict, espera_inicio_s: float | None = None,
                 bloques_previos: list[np.ndarray] | None = None,
                 on_inicio=None) -> tuple[np.ndarray, float] | None:
    """Graba desde que empiezas a hablar hasta que te callas.

    Devuelve (audio float32 a 16 kHz, instante en que dejaste de hablar) o
    None si no has empezado a hablar en `espera_inicio_s` segundos.

    - Para dar por empezada la frase pedimos 2 bloques seguidos con voz
      (160 ms), así un golpe o un clic no cuentan.
    - Guardamos ~400 ms de "pre-roll" para no comernos la primera sílaba.
    - La frase termina tras `silencio_fin_ms` de silencio seguido.
    - Si en total hubo menos de 250 ms de voz (un "…vis" residual, una tos),
      se descarta y seguimos esperando.
    """
    umbral = cfg_audio.get("vad_umbral", 0.5)
    silencio_fin = cfg_audio.get("silencio_fin_ms", 700)
    max_s = cfg_audio.get("max_grabacion_s", 15)
    espera = cfg_audio.get("espera_inicio_s", 5) if espera_inicio_s is None else espera_inicio_s

    vad.reiniciar()
    previo = collections.deque(bloques_previos or [], maxlen=5)
    bloques: list[np.ndarray] = []
    hablando, seguidos, silencio_ms, voz_ms = False, 0, 0, 0
    t_limite = time.perf_counter() + espera
    t_fin_voz = time.perf_counter()

    while True:
        bloque = fuente.leer(timeout=0.5)
        ahora = time.perf_counter()
        if bloque is None:
            if not hablando and ahora > t_limite:
                return None
            continue
        p = vad.prob(bloque)

        if not hablando:
            previo.append(bloque)
            seguidos = seguidos + 1 if p >= umbral else 0
            if seguidos >= 2:
                hablando, voz_ms = True, 2 * MS_BLOQUE
                bloques = list(previo)
                t_fin_voz = ahora
                log.debug("🎙  Empiezas a hablar")
                if on_inicio:
                    on_inicio()
            elif ahora > t_limite:
                return None
            continue

        bloques.append(bloque)
        if p >= umbral - 0.15:      # histéresis: cuesta menos seguir que empezar
            silencio_ms = 0
            voz_ms += MS_BLOQUE
            t_fin_voz = ahora
        else:
            silencio_ms += MS_BLOQUE
        if silencio_ms >= silencio_fin and voz_ms < 250:
            log.debug("Ruido corto descartado (%d ms de voz)", voz_ms)
            hablando, seguidos, silencio_ms = False, 0, 0
            previo.clear()
            continue
        if silencio_ms >= silencio_fin or len(bloques) * MS_BLOQUE >= max_s * 1000:
            break

    # Recortamos casi todo el silencio final (Whisper no lo necesita)
    sobran = max(0, silencio_ms // MS_BLOQUE - 2)
    if sobran:
        bloques = bloques[:-sobran]
    audio = np.concatenate(bloques).astype(np.float32) / 32768.0
    log.debug("🎙  Frase de %.1f s grabada", len(audio) / SR)
    return audio, t_fin_voz
