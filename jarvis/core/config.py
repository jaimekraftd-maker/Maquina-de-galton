"""Carga de config.yaml y rutas del proyecto.

La configuración se maneja como un dict normal para que sea fácil de seguir:
    cfg["llm"]["modelo"]
Las rutas relativas del YAML se resuelven respecto a la carpeta de jarvis/.
"""
from __future__ import annotations

import os
from pathlib import Path

import yaml

# Carpeta raíz del proyecto (la que contiene main.py)
BASE_DIR = Path(__file__).resolve().parent.parent


def ruta(relativa: str | os.PathLike) -> Path:
    """Convierte una ruta del config (relativa a jarvis/) en absoluta."""
    p = Path(os.path.expandvars(str(relativa)))
    return p if p.is_absolute() else BASE_DIR / p


def cargar_config(archivo: str | os.PathLike = "config.yaml") -> dict:
    with open(ruta(archivo), encoding="utf-8") as f:
        cfg = yaml.safe_load(f) or {}
    # Aseguramos que existan las secciones para no llenar el código de .get()
    for seccion in ("usuario", "llm", "claude", "memoria", "tts", "stt",
                    "audio", "wakeword", "herramientas", "apps"):
        cfg.setdefault(seccion, {})
    return cfg
