"""Temporizadores que avisan (por voz si está activada) al terminar."""
from __future__ import annotations

import threading

from tools.base import Contexto, herramienta

_AVISO = {
    "es": "Señor, el temporizador de {etiqueta} ha terminado.",
    "ca": "Senyor, el temporitzador de {etiqueta} ha acabat.",
    "en": "Sir, your {etiqueta} timer is done.",
}

# Temporizadores activos (por si en el futuro quieres listarlos o cancelarlos)
ACTIVOS: list[threading.Timer] = []


def _formato(segundos: int) -> str:
    m, s = divmod(segundos, 60)
    h, m = divmod(m, 60)
    partes = [f"{h} h" if h else "", f"{m} min" if m else "", f"{s} s" if s else ""]
    return " ".join(p for p in partes if p) or "0 s"


@herramienta(
    "temporizador",
    "Pone un temporizador y avisa en voz alta cuando termina.",
    {
        "segundos": {"type": "integer", "description": "Duración total en segundos (5 minutos = 300)"},
        "etiqueta": {"type": "string", "description": "Para qué es, p. ej. pasta"},
    },
    requeridos=["segundos"],
)
def temporizador(ctx: Contexto, segundos: int, etiqueta: str = "") -> str:
    if segundos <= 0 or segundos > 24 * 3600:
        return "Duración no válida: debe estar entre 1 segundo y 24 horas."
    idioma = ctx.idioma  # avisamos en el idioma en que se pidió
    etiqueta = etiqueta.strip() or {"es": "cocina", "ca": "cuina", "en": "kitchen"}.get(idioma, "")
    texto = _AVISO.get(idioma, _AVISO["es"]).format(etiqueta=etiqueta)

    t = threading.Timer(segundos, lambda: ctx.avisar(texto, idioma))
    t.daemon = True  # no impide cerrar Jarvis
    t.start()
    ACTIVOS.append(t)
    return f"Temporizador '{etiqueta}' puesto: {_formato(segundos)}."
