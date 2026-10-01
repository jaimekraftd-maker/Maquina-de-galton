"""Palabra de activación "Hey Jarvis" con openWakeWord.

openWakeWord analiza bloques de 80 ms y devuelve una puntuación 0-1 para
cada palabra clave. Usamos el modelo preentrenado `hey_jarvis` en formato
ONNX (en Windows no hay tflite). Consume muy poca CPU (~1-2 %).
"""
from __future__ import annotations

import logging
import time

import numpy as np

log = logging.getLogger("jarvis.wakeword")


class DetectorActivacion:
    def __init__(self, cfg: dict):
        import openwakeword
        from openwakeword.model import Model

        c = cfg["wakeword"]
        self.nombre = c.get("modelo", "hey_jarvis")
        self.umbral = float(c.get("umbral", 0.5))
        # Descarga (solo la primera vez) los modelos base + el de "hey jarvis"
        openwakeword.utils.download_models(model_names=[self.nombre])
        self.modelo = Model(wakeword_models=[self.nombre], inference_framework="onnx")
        self._ultima = 0.0
        self.puntuacion = 0.0  # última puntuación (útil para depurar el umbral)

    def procesar(self, bloque_int16: np.ndarray) -> bool:
        """True si en este bloque se ha detectado la palabra de activación."""
        pred = self.modelo.predict(bloque_int16)
        self.puntuacion = max(pred.values()) if pred else 0.0
        if self.puntuacion >= self.umbral and time.perf_counter() - self._ultima > 1.5:
            self._ultima = time.perf_counter()
            log.debug("Palabra de activación detectada (%.2f)", self.puntuacion)
            return True
        return False

    def reiniciar(self) -> None:
        """Olvida el audio acumulado (tras hablar Jarvis, para no auto-activarse)."""
        self.modelo.reset()
        self._ultima = 0.0
