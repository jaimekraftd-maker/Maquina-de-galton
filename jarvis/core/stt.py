"""Voz a texto con faster-whisper (Whisper optimizado con CTranslate2).

- Detección automática de idioma, pero limitada a los que hablas (es/ca/en):
  si Whisper cree que es portugués o gallego, volvemos a transcribir con el
  más probable de los permitidos.
- Filtro de "alucinaciones": con ruido o silencio Whisper a veces se
  inventa frases típicas de subtítulos ("Gracias por ver el vídeo").
"""
from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass

import numpy as np

from core import idioma as idiomas

log = logging.getLogger("jarvis.stt")

_ALUCINACIONES = (
    "gracias por ver", "subtítulos", "amara.org", "suscríbete", "thanks for watching",
    "thank you for watching", "subscribe", "gràcies per veure", "subtítols", "¡gracias!",
)


@dataclass
class Transcripcion:
    texto: str
    idioma: str
    prob_idioma: float
    segundos: float          # lo que tardó en transcribir
    duracion_audio: float


class Transcriptor:
    def __init__(self, cfg: dict):
        from faster_whisper import WhisperModel

        c = cfg["stt"]
        self.permitidos = c.get("idiomas_permitidos", ["es", "ca", "en"])
        self.beam_size = c.get("beam_size", 1)
        self.palabras_clave = c.get("palabras_clave", "Jarvis")
        hilos = c.get("hilos_cpu") or max(1, (os.cpu_count() or 4) // 2)
        t0 = time.perf_counter()
        # La primera vez descarga el modelo de Hugging Face (small ≈ 480 MB)
        self.modelo = WhisperModel(c.get("modelo", "small"), device=c.get("dispositivo", "cpu"),
                                   compute_type=c.get("compute_type", "int8"), cpu_threads=hilos)
        log.debug("Whisper '%s' cargado en %.1f s (%d hilos)", c.get("modelo"), time.perf_counter() - t0, hilos)

    def precalentar(self) -> None:
        self.modelo.transcribe(np.zeros(16000, dtype=np.float32), language="es", beam_size=1)

    def _transcribir(self, audio: np.ndarray, idioma: str | None):
        segmentos, info = self.modelo.transcribe(
            audio,
            language=idioma,
            beam_size=self.beam_size,
            vad_filter=False,                 # ya hemos recortado con nuestro VAD
            condition_on_previous_text=False,
            without_timestamps=True,
            hotwords=self.palabras_clave,     # ayuda a escribir bien nombres propios
        )
        segmentos = list(segmentos)          # aquí es donde realmente trabaja
        return segmentos, info

    def transcribir(self, audio: np.ndarray, idioma_forzado: str | None = None) -> Transcripcion:
        t0 = time.perf_counter()
        segmentos, info = self._transcribir(audio, idioma_forzado)
        idioma = info.language
        prob = info.language_probability

        if idioma not in self.permitidos and not idioma_forzado:
            # Elegimos el permitido más probable y repetimos
            probs = dict(info.all_language_probs or [])
            idioma = max(self.permitidos, key=lambda i: probs.get(i, 0.0))
            prob = probs.get(idioma, 0.0)
            log.debug("Whisper dijo '%s'; repito como '%s'", info.language, idioma)
            segmentos, info = self._transcribir(audio, idioma)

        # Descartamos segmentos que Whisper considera "no habla"
        utiles = [s for s in segmentos if not (s.no_speech_prob > 0.6 and s.avg_logprob < -1.0)]
        texto = " ".join(s.text.strip() for s in utiles).strip()
        if any(a in texto.lower() for a in _ALUCINACIONES) and len(texto) < 60:
            log.debug("Descartada posible alucinación: %r", texto)
            texto = ""
        if prob < 0.6 and idioma in ("es", "ca") and texto and not idioma_forzado:
            # Whisper duda entre español y catalán (le pasa a menudo): pedimos
            # una segunda opinión a nuestro detector de texto ("quina" -> ca).
            segunda = idiomas.detectar(texto, por_defecto=idioma)
            if segunda != idioma:
                log.debug("Whisper dudaba (%s %.2f); por el texto parece %s", idioma, prob, segunda)
                idioma = segunda
        return Transcripcion(texto, idioma, prob, time.perf_counter() - t0, len(audio) / 16000)
