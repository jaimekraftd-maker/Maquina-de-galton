"""Control multimedia pulsando las teclas multimedia virtuales de Windows.

Funciona con cualquier reproductor que respete esas teclas (Spotify,
YouTube en el navegador, etc.). Usa la API de Windows vía ctypes, sin
dependencias extra.
"""
from __future__ import annotations

import ctypes
import time

from tools.base import Contexto, herramienta

# Códigos de tecla virtual (https://learn.microsoft.com/windows/win32/inputdev/virtual-key-codes)
_TECLAS = {
    "play_pausa": 0xB3,
    "siguiente": 0xB0,
    "anterior": 0xB1,
    "volumen_arriba": 0xAF,
    "volumen_abajo": 0xAE,
    "silenciar": 0xAD,
}
_KEYUP = 0x0002


def _pulsar(vk: int) -> None:
    user32 = ctypes.windll.user32
    user32.keybd_event(vk, 0, 0, 0)
    user32.keybd_event(vk, 0, _KEYUP, 0)


@herramienta(
    "control_multimedia",
    "Controla la música o el vídeo que suena: pausar o reanudar, siguiente, anterior, "
    "subir o bajar volumen, silenciar.",
    {
        "accion": {"type": "string", "enum": list(_TECLAS),
                   "description": "play_pausa, siguiente, anterior, volumen_arriba, volumen_abajo o silenciar"},
        "pasos": {"type": "integer",
                  "description": "Solo para volumen: cuántos pasos de 2% (por defecto 5)"},
    },
    requeridos=["accion"],
)
def control_multimedia(ctx: Contexto, accion: str, pasos: int = 5) -> str:
    vk = _TECLAS.get(accion)
    if vk is None:
        return f"Acción desconocida: {accion}. Opciones: {', '.join(_TECLAS)}."
    repeticiones = max(1, min(int(pasos), 25)) if accion.startswith("volumen") else 1
    for _ in range(repeticiones):
        _pulsar(vk)
        time.sleep(0.02)
    return f"Hecho: {accion}" + (f" x{repeticiones}" if repeticiones > 1 else "") + "."
