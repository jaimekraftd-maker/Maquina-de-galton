"""Herramientas de memoria: recordar, olvidar y listar recuerdos."""
from __future__ import annotations

from tools.base import Contexto, herramienta


def _resolver(ctx: Contexto, id: int | None, texto: str | None) -> tuple[int, str] | None:
    """Encuentra el recuerdo por id o, si no, por parecido con `texto`."""
    if id is not None:
        t = ctx.memoria.obtener(int(id))
        if t is not None:
            return int(id), t
    if texto:
        encontrados = ctx.memoria.buscar(texto, k=1)
        if encontrados:
            return encontrados[0]
    return None


@herramienta(
    "recordar",
    "Guarda un hecho duradero sobre el usuario para recordarlo en el futuro.",
    {"hecho": {"type": "string", "description": "El hecho, en una frase, p. ej. 'Su color favorito es el azul'"}},
    requeridos=["hecho"],
)
def recordar(ctx: Contexto, hecho: str) -> str:
    id_, nuevo = ctx.memoria.recordar(hecho)
    return f"Guardado como recuerdo {id_}: {hecho}" if nuevo else f"Guardado (ya lo sabía, recuerdo {id_})."


def _pregunta_olvidar(ctx: Contexto, args: dict) -> str | None:
    r = _resolver(ctx, args.get("id"), args.get("texto"))
    if r is None:
        return None  # no hay nada que borrar: no molestamos con la pregunta
    return {"es": f"¿Seguro que quiere que olvide que {r[1]}?",
            "ca": f"Segur que vol que oblidi que {r[1]}?",
            "en": f"Are you sure you want me to forget that {r[1]}?"}.get(ctx.idioma)


@herramienta(
    "olvidar",
    "Borra un recuerdo guardado, por su número de id o describiendo qué olvidar.",
    {"id": {"type": "integer", "description": "Número del recuerdo"},
     "texto": {"type": "string", "description": "Descripción del recuerdo si no sabes el id"}},
    confirmacion=_pregunta_olvidar,
)
def olvidar(ctx: Contexto, id: int | None = None, texto: str | None = None) -> str:
    r = _resolver(ctx, id, texto)
    if r is None:
        # Damos la lista para que el modelo pueda reintentar con el id correcto
        lista = " | ".join(f"[{i}] {t}" for i, t in ctx.memoria.listar()) or "(vacía)"
        return (f"NO se ha borrado nada: no encuentro un recuerdo que encaje con '{texto or id}'. "
                f"Si alguno de estos es el que quiere olvidar, llama a olvidar con su id: {lista}")
    ctx.memoria.olvidar(r[0])
    return f"Recuerdo {r[0]} borrado: {r[1]}"


@herramienta("listar_recuerdos", "Lista todo lo que recuerdas sobre el usuario.")
def listar_recuerdos(ctx: Contexto) -> str:
    recuerdos = ctx.memoria.listar()
    if not recuerdos:
        return "No hay ningún recuerdo guardado todavía."
    return "Recuerdos: " + " | ".join(f"[{i}] {t}" for i, t in recuerdos)
