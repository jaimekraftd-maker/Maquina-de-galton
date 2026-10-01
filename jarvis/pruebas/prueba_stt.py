"""Prueba de la fase 4 sin micrófono: Piper dice frases -> VAD -> Whisper.

    python pruebas/prueba_stt.py            # con el modelo de config.yaml
    python pruebas/prueba_stt.py base       # con otro modelo de Whisper

Mide lo que tarda cada parte con audio "hablado" al ritmo real.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.audio import SR, DetectorVoz, FuenteSimulada, grabar_frase  # noqa: E402
from core.config import cargar_config  # noqa: E402
from core.stt import Transcriptor  # noqa: E402

FRASES = [
    ("es", "Jarvis, ¿qué hora es?"),
    ("es", "Abre Spotify y pon algo de música tranquila."),
    ("ca", "Quina temperatura farà demà a Barcelona?"),
    ("ca", "Recorda que el meu gos es diu Toby."),
    ("en", "What is the capital of Australia?"),
    ("en", "Set a timer for five minutes, please."),
]


def sintetizar(voces, idioma: str, texto: str) -> np.ndarray:
    """Texto -> audio int16 a 16 kHz con Piper."""
    voz = voces[idioma]
    trozos = list(voz.synthesize(texto))
    audio = np.concatenate([c.audio_float_array for c in trozos])
    sr = trozos[0].sample_rate
    if sr != SR:  # remuestreo sencillo (suficiente para una prueba)
        x = np.linspace(0, len(audio), int(len(audio) * SR / sr), endpoint=False)
        audio = np.interp(x, np.arange(len(audio)), audio)
    return (audio * 32767 * 0.8).astype(np.int16)


def main() -> None:
    from piper import PiperVoice

    cfg = cargar_config()
    if len(sys.argv) > 1:
        cfg["stt"]["modelo"] = sys.argv[1]
    voces = {i: PiperVoice.load(f"data/voces/{n}.onnx") for i, n in cfg["tts"]["voces"].items()}

    t0 = time.perf_counter()
    stt = Transcriptor(cfg)
    stt.precalentar()
    print(f"Whisper '{cfg['stt']['modelo']}' listo en {time.perf_counter() - t0:.1f} s\n")
    vad = DetectorVoz()

    aciertos_idioma = 0
    for idioma, frase in FRASES:
        fuente = FuenteSimulada(sintetizar(voces, idioma, frase))
        fuente.iniciar()
        r = grabar_frase(fuente, vad, cfg["audio"], espera_inicio_s=3)
        if r is None:
            print(f"✗ VAD no detectó voz en: {frase}")
            continue
        audio, t_fin_voz = r
        t_detectado = time.perf_counter()           # el VAD ya ha decidido que callaste
        tr = stt.transcribir(audio)
        aciertos_idioma += tr.idioma == idioma
        print(f"[{idioma}->{tr.idioma} {tr.prob_idioma:.2f}] {tr.texto!r}")
        print(f"    audio {tr.duracion_audio:.1f} s | espera de silencio {1000 * (t_detectado - t_fin_voz):.0f} ms"
              f" | Whisper {tr.segundos * 1000:.0f} ms")
    print(f"\nIdioma correcto en {aciertos_idioma}/{len(FRASES)}")


if __name__ == "__main__":
    main()
