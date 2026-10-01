"""Abrir webs y búsquedas en el navegador predeterminado."""
from __future__ import annotations

import webbrowser
from urllib.parse import quote_plus, urlparse

from tools.base import Contexto, herramienta


def _url_segura(url: str) -> str | None:
    """Solo http/https. Rechaza file:, javascript:, rutas locales, etc."""
    url = url.strip()
    if "://" not in url:
        url = "https://" + url
    p = urlparse(url)
    if p.scheme not in ("http", "https") or not p.netloc or " " in p.netloc:
        return None
    return url


@herramienta(
    "abrir_web",
    "Abre una página web en el navegador.",
    {"url": {"type": "string", "description": "Dirección web, p. ej. github.com"}},
    requeridos=["url"],
)
def abrir_web(ctx: Contexto, url: str) -> str:
    segura = _url_segura(url)
    if segura is None:
        return f"URL no válida o no permitida: {url}. Solo se admiten http y https."
    webbrowser.open(segura)
    return f"Abierta {segura} en el navegador."


@herramienta(
    "buscar_en_google",
    "Busca algo en Google y abre los resultados en el navegador. "
    "Úsala para noticias, tiempo, precios o cualquier dato actual de internet.",
    {"consulta": {"type": "string", "description": "Qué buscar"}},
    requeridos=["consulta"],
)
def buscar_en_google(ctx: Contexto, consulta: str) -> str:
    webbrowser.open("https://www.google.com/search?q=" + quote_plus(consulta))
    return f"Búsqueda de Google abierta: {consulta}. No puedo leer los resultados; están en pantalla."


@herramienta(
    "buscar_en_youtube",
    "Busca vídeos o música en YouTube y abre los resultados.",
    {"consulta": {"type": "string", "description": "Qué buscar en YouTube"}},
    requeridos=["consulta"],
)
def buscar_en_youtube(ctx: Contexto, consulta: str) -> str:
    webbrowser.open("https://www.youtube.com/results?search_query=" + quote_plus(consulta))
    return f"Búsqueda de YouTube abierta: {consulta}."
