"""Infraestructura de herramientas: registro, contexto y ejecución segura.

Cómo se añade una herramienta nueva (ver cualquier archivo de tools/):

    @herramienta(
        "nombre_funcion",
        "Descripción corta que lee el modelo para decidir cuándo usarla.",
        {"param": {"type": "string", "description": "..."}},
        requeridos=["param"],
    )
    def nombre_funcion(ctx: Contexto, param: str) -> str:
        return "resultado en texto que verá el modelo"

El decorador la mete en REGISTRO; el LLM solo puede llamar a lo que esté ahí.
"""
from __future__ import annotations

import inspect
import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Callable

log = logging.getLogger("jarvis.tools")


@dataclass
class Contexto:
    """Lo que una herramienta necesita del resto de Jarvis.

    Las interfaces (texto, voz, HUD) rellenan `avisar` y `confirmar` con su
    propia forma de hablar/preguntar, así las herramientas no saben si hay
    micrófono o teclado.
    """
    cfg: dict
    memoria: Any = None                      # core.memory.Memoria (fase 2)
    idioma: str = "es"                       # idioma del último mensaje
    # avisar(texto, idioma): decir algo por iniciativa propia (p. ej. temporizador)
    avisar: Callable[[str, str], None] = lambda texto, idioma: print(f"\nJARVIS: {texto}")
    # confirmar(pregunta, idioma) -> bool: pedir un sí/no al usuario
    confirmar: Callable[[str, str], bool] = lambda pregunta, idioma: False
    # Candado para que dos hilos no hablen a la vez (temporizador vs respuesta)
    candado_voz: threading.Lock = field(default_factory=threading.Lock)


@dataclass
class Herramienta:
    nombre: str
    descripcion: str
    parametros: dict
    requeridos: list
    funcion: Callable[..., str]
    # confirmacion(ctx, args) -> pregunta a hacer al usuario (solo las peligrosas)
    confirmacion: Callable[["Contexto", dict], str | None] | None = None

    def esquema(self) -> dict:
        """Formato de herramienta que esperan Ollama y la API de OpenAI."""
        return {
            "type": "function",
            "function": {
                "name": self.nombre,
                "description": self.descripcion,
                "parameters": {
                    "type": "object",
                    "properties": self.parametros,
                    "required": self.requeridos,
                },
            },
        }


REGISTRO: dict[str, Herramienta] = {}


def herramienta(nombre: str, descripcion: str, parametros: dict | None = None,
                requeridos: list | None = None,
                confirmacion: Callable[[Contexto, dict], str | None] | None = None):
    """Decorador que registra una función como herramienta del LLM."""
    def decorar(funcion):
        REGISTRO[nombre] = Herramienta(nombre, descripcion, parametros or {},
                                       requeridos or [], funcion, confirmacion)
        return funcion
    return decorar


def esquemas(nombres: list[str] | None = None) -> list[dict]:
    """Esquemas JSON de las herramientas (todas o las indicadas)."""
    return [h.esquema() for n, h in REGISTRO.items() if nombres is None or n in nombres]


# ------------------------------------------------------------------
# Ejecución
# ------------------------------------------------------------------

_TIPOS = {"integer": int, "number": float, "string": str, "boolean": bool}

_CANCELADO = {
    "es": "El usuario NO ha confirmado. Acción cancelada; díselo brevemente.",
    "ca": "L'usuari NO ho ha confirmat. Acció cancel·lada; digues-li breument.",
    "en": "The user did NOT confirm. Action cancelled; tell them briefly.",
}


def _convertir(valor: Any, tipo_json: str | None) -> Any:
    """Los modelos pequeños a veces mandan "60" en vez de 60: lo corregimos."""
    tipo = _TIPOS.get(tipo_json or "")
    if tipo is None or isinstance(valor, tipo):
        return valor
    try:
        if tipo is bool:
            return str(valor).lower() in ("true", "1", "si", "sí", "yes")
        if tipo is int:
            return int(float(valor))
        return tipo(valor)
    except (TypeError, ValueError):
        return valor


def ejecutar(nombre: str, argumentos: dict | None, ctx: Contexto) -> str:
    """Ejecuta una herramienta del registro y SIEMPRE devuelve texto.

    Aquí está toda la política de seguridad:
      * solo se ejecutan funciones registradas (nada de shell arbitrario),
      * se descartan argumentos que no estén en el esquema,
      * las acciones listadas en config `herramientas.confirmar` piden un sí.
    """
    h = REGISTRO.get(nombre)
    if h is None:
        return f"Error: la herramienta '{nombre}' no existe. Usa solo las disponibles."

    argumentos = argumentos if isinstance(argumentos, dict) else {}
    limpios = {}
    for clave, valor in argumentos.items():
        if clave in h.parametros:
            limpios[clave] = _convertir(valor, h.parametros[clave].get("type"))
        else:
            log.debug("Argumento ignorado en %s: %s=%r", nombre, clave, valor)

    faltan = [r for r in h.requeridos if r not in limpios]
    if faltan:
        return f"Error: faltan argumentos obligatorios: {', '.join(faltan)}."

    # Solo pasamos los parámetros que la función acepta de verdad
    firma = inspect.signature(h.funcion).parameters
    limpios = {k: v for k, v in limpios.items() if k in firma}

    if nombre in ctx.cfg["herramientas"].get("confirmar", []):
        # La herramienta puede devolver None si ESTA variante no es peligrosa
        # (p. ej. cancelar un apagado no necesita confirmación).
        pregunta = (h.confirmacion(ctx, limpios) if h.confirmacion
                    else f"¿Confirmas {nombre} {limpios}?")
        if pregunta and not ctx.confirmar(pregunta, ctx.idioma):
            log.info("Acción %s cancelada por el usuario", nombre)
            return _CANCELADO.get(ctx.idioma, _CANCELADO["es"])

    try:
        resultado = h.funcion(ctx, **limpios)
    except Exception as e:  # una herramienta rota nunca debe tumbar a Jarvis
        log.exception("Fallo en la herramienta %s", nombre)
        return f"Error al ejecutar {nombre}: {e}"
    return str(resultado)
