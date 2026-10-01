"""Prueba del modo voz completo SIN micrófono.

Un "usuario sintético" (voces de Piper) dice un guion por un micrófono
simulado, al ritmo real: palabra de activación, órdenes, seguimientos sin
"Hey Jarvis", una confirmación de apagado (a la que dice que NO) y una
despedida. Jarvis responde por los altavoces de verdad, y se miden las
latencias igual que en uso real.

    python pruebas/prueba_voz.py

Por seguridad, aquí el comando de apagado está desactivado aunque se dijera "sí".
"""
from __future__ import annotations

import sys
import threading
import time
from pathlib import Path

import numpy as np

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(RAIZ / "pruebas"))

import tools.sistema  # noqa: E402
from core.asistente import AsistenteVoz  # noqa: E402
from core.audio import SR, FuenteSimulada  # noqa: E402
from core.config import cargar_config  # noqa: E402
from core.stt import Transcriptor  # noqa: E402
from core.tts import Voz  # noqa: E402
from main import configurar_logs, construir  # noqa: E402
from prueba_stt import sintetizar  # noqa: E402

# (idioma de la voz sintética, frase, silencio previo en segundos)
GUION = [
    ("en", "Hey Jarvis.", 1.0),
    ("es", "¿Qué hora es?", 0.3),
    ("en", "What's the capital of Australia?", 1.0),     # seguimiento, sin "Hey Jarvis"
    ("ca", "Quina hora és?", 1.0),                        # seguimiento
    ("en", "Hey Jarvis.", 9.0),                           # >6 s: se acabó el seguimiento
    ("es", "Apaga el ordenador.", 0.3),
    ("es", "No, mejor no.", 1.0),                         # respuesta a la confirmación
    ("es", "Gracias Jarvis.", 1.0),                       # despedida
]


def main() -> None:
    import os
    os.chdir(RAIZ)
    configurar_logs("--debug" in sys.argv)
    # Seguridad: en esta prueba nunca se apaga nada de verdad
    tools.sistema.subprocess.run = lambda *a, **k: print(f"   (simulado, no se ejecuta: {a[0]})")

    cfg = cargar_config()
    ctx, cerebro = construir(cfg)
    cerebro.precalentar()
    voz = Voz(cfg)
    voz.cargar("es")
    stt = Transcriptor(cfg)
    stt.precalentar()

    # El "usuario" usa las mismas voces de Piper
    voces = {i: voz._voz_para(i) for i in cfg["tts"]["voces"]}
    fuente = FuenteSimulada()
    for idioma, frase, pausa in GUION:
        fuente.poner(sintetizar(voces, idioma, frase), silencio_antes_s=pausa)

    asistente = AsistenteVoz(cfg, ctx, cerebro, voz, stt, fuente)

    def vigilar():  # cuando el guion se acaba y Jarvis está ocioso, paramos
        while len(fuente._pendiente) > 0 or voz.hablando:
            time.sleep(0.5)
        time.sleep(8)
        asistente.parar()

    threading.Thread(target=vigilar, daemon=True).start()
    print(f"\n=== Guion de {sum(len(sintetizar(voces, i, f)) / SR + p for i, f, p in GUION):.0f} s ===\n")
    asistente.ejecutar()


if __name__ == "__main__":
    main()
