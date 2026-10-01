"""Prueba visual del HUD sin micrófono ni modelos: recorre los estados con
volumen simulado y guarda una captura de cada uno en data/capturas_hud/.

    python pruebas/prueba_hud.py
"""
from __future__ import annotations

import math
import sys
import time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))

from PySide6.QtCore import QTimer  # noqa: E402
from PySide6.QtWidgets import QApplication  # noqa: E402

from core.hud import Puente, VentanaHUD  # noqa: E402

GUION = [
    ("iniciando", None, None),
    ("esperando", None, None),
    ("escuchando", "usuario", "¿Qué tiempo hará mañana en Barcelona?"),
    ("pensando", None, None),
    ("hablando", "jarvis", "No tengo acceso a datos en tiempo real, señor. ¿Le abro una búsqueda en Google?"),
]


def main() -> None:
    app = QApplication([])
    puente = Puente()
    ventana = VentanaHUD(puente)
    t0 = time.perf_counter()
    ventana.reactor.leer_nivel = lambda: 0.5 + 0.5 * math.sin((time.perf_counter() - t0) * 9)
    ventana.show()
    salida = RAIZ / "data" / "capturas_hud"
    salida.mkdir(parents=True, exist_ok=True)
    paso = {"i": 0}

    def siguiente():
        if paso["i"] > 0:  # captura del estado anterior, ya animado un rato
            estado = GUION[paso["i"] - 1][0]
            ventana.grab().save(str(salida / f"{paso['i']}_{estado}.png"))
        if paso["i"] == len(GUION):
            puente.latencia.emit("fin de tu voz → su voz: 1850 ms | demo")
            app.quit()
            return
        estado, quien, texto = GUION[paso["i"]]
        puente.estado.emit(estado)
        if texto:
            puente.texto.emit(quien, texto)
        paso["i"] += 1

    temporizador = QTimer()
    temporizador.timeout.connect(siguiente)
    temporizador.start(1200)
    app.exec()
    print(f"Capturas en {salida}")


if __name__ == "__main__":
    main()
