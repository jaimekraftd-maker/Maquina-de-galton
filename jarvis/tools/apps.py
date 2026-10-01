"""abrir_programa: abre SOLO aplicaciones de la lista blanca de config.yaml.

Nunca se pasa texto del modelo a una shell: el nombre que pide el LLM se
compara con la lista blanca y, si coincide, se lanza la ruta/URI que TÚ
escribiste en config.yaml.
"""
from __future__ import annotations

import difflib
import os
import subprocess
from pathlib import Path

from core.idioma import normalizar
from tools.base import Contexto, herramienta

# Flags de Windows para que la app no quede "colgada" de la consola de Jarvis
_DESACOPLADO = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(
    subprocess, "CREATE_NEW_PROCESS_GROUP", 0)


def _indice_nombres(apps: dict) -> dict[str, str]:
    """{nombre o alias normalizado: clave de la app}"""
    indice = {}
    for clave, datos in apps.items():
        indice[normalizar(clave)] = clave
        for alias in (datos or {}).get("alias", []):
            indice[normalizar(alias)] = clave
    return indice


def buscar_app(nombre: str, apps: dict) -> str | None:
    """Devuelve la clave de la app permitida que mejor encaja con `nombre`."""
    indice = _indice_nombres(apps)
    n = normalizar(nombre)
    for prefijo in ("el ", "la ", "the ", "app ", "programa "):
        if n.startswith(prefijo):
            n = n[len(prefijo):]
    if n in indice:
        return indice[n]
    parecidos = difflib.get_close_matches(n, indice.keys(), n=1, cutoff=0.75)
    return indice[parecidos[0]] if parecidos else None


def _lanzar(datos: dict) -> bool:
    """Intenta rutas -> appid -> uri. Devuelve True si algo se lanzó."""
    for r in datos.get("rutas", []):
        exe = Path(os.path.expandvars(r))
        if exe.exists():
            subprocess.Popen([str(exe), *datos.get("args", [])],
                             creationflags=_DESACOPLADO, close_fds=True)
            return True
    if datos.get("appid"):
        # Apps de la Microsoft Store: se abren a través del "AppsFolder"
        subprocess.Popen(["explorer.exe", f"shell:AppsFolder\\{datos['appid']}"],
                         creationflags=_DESACOPLADO, close_fds=True)
        return True
    if datos.get("uri"):
        os.startfile(datos["uri"])  # protocolo registrado, p. ej. spotify:
        return True
    return False


def _descripcion(ctx_apps: list[str]) -> str:
    return ("Abre un programa del PC. Solo se permiten estos: " + ", ".join(ctx_apps) + ".")


@herramienta(
    "abrir_programa",
    "Abre un programa del PC que esté en la lista de programas permitidos.",
    {"nombre": {"type": "string", "description": "Nombre del programa, p. ej. spotify"}},
    requeridos=["nombre"],
)
def abrir_programa(ctx: Contexto, nombre: str) -> str:
    apps = ctx.cfg.get("apps", {})
    clave = buscar_app(nombre, apps)
    if clave is None:
        return (f"'{nombre}' no está en la lista de programas permitidos. "
                f"Permitidos: {', '.join(apps)}.")
    if _lanzar(apps[clave] or {}):
        return f"Abriendo {clave}."
    return f"{clave} está permitido pero no lo encuentro instalado en las rutas configuradas."


def actualizar_descripcion(cfg: dict) -> None:
    """Pone la lista blanca real en la descripción que ve el modelo."""
    from tools.base import REGISTRO
    REGISTRO["abrir_programa"].descripcion = _descripcion(list(cfg.get("apps", {})))
