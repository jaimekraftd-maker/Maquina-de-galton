"""consultar_experto: el modelo local pasa una pregunta difícil a Claude.

Solo se ofrece al modelo en modo híbrido (llm.cerebro: hibrido). Cerebro
intercepta esta llamada para que la respuesta de Claude se lea en voz alta
en streaming; esta función solo se ejecuta si algo va mal.
"""
from __future__ import annotations

from tools.base import Contexto, herramienta


@herramienta(
    "consultar_experto",
    "Pasa a un modelo experto mucho más potente las preguntas difíciles: razonamiento "
    "complejo, matemáticas, programación, explicaciones largas o temas que no dominas. "
    "No la uses para órdenes del PC ni para charlar.",
    {"pregunta": {"type": "string", "description": "La pregunta completa del usuario"}},
    requeridos=["pregunta"],
)
def consultar_experto(ctx: Contexto, pregunta: str) -> str:
    return "El experto no está disponible ahora mismo; responde tú lo mejor que puedas."
