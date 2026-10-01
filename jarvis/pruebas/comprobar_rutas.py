"""Comprueba que las apps de la lista blanca (config.yaml -> apps) existen en este PC.

    python pruebas/comprobar_rutas.py

Para cada app mira, en el mismo orden que tools/apps.py: rutas -> appid -> uri.
Sale con código 1 si alguna app no se podría abrir.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.config import cargar_config  # noqa: E402


def apps_de_la_store() -> set[str]:
    """AppIDs instalados (Get-StartApps). Vacío si no estamos en Windows."""
    if os.name != "nt":
        return set()
    try:
        salida = subprocess.run(
            ["powershell", "-NoProfile", "-Command", "Get-StartApps | ForEach-Object AppID"],
            capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return set()
    return {linea.strip() for linea in salida.splitlines() if linea.strip()}


def protocolo_registrado(uri: str) -> bool:
    """¿Hay algún programa registrado para 'spotify:', 'steam://...'?"""
    if os.name != "nt":
        return False
    import winreg
    esquema = uri.split(":", 1)[0]
    try:
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, esquema) as clave:
            winreg.QueryValueEx(clave, "URL Protocol")
        return True
    except OSError:
        return False


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):  # ✓/✗ en la consola de Windows
        sys.stdout.reconfigure(encoding="utf-8")
    cfg = cargar_config()
    store = None
    faltan = []
    for nombre, datos in cfg["apps"].items():
        datos = datos or {}
        como = None
        for r in datos.get("rutas", []):
            exe = Path(os.path.expandvars(r))
            if exe.exists():
                como = f"ruta {exe}"
                break
        if como is None and datos.get("appid"):
            if store is None:
                store = apps_de_la_store()
            if datos["appid"] in store:
                como = f"app de la Store {datos['appid']}"
        if como is None and datos.get("uri") and protocolo_registrado(datos["uri"]):
            como = f"protocolo {datos['uri']}"

        if como:
            print(f"  ✓ {nombre:<15} {como}")
        else:
            faltan.append(nombre)
            probado = [os.path.expandvars(r) for r in datos.get("rutas", [])]
            probado += [f"appid {datos['appid']}"] if datos.get("appid") else []
            probado += [f"uri {datos['uri']}"] if datos.get("uri") else []
            print(f"  ✗ {nombre:<15} no encontrado. Probado: {'; '.join(probado)}")

    if faltan:
        print(f"\n{len(faltan)} app(s) sin instalar o con otra ruta: {', '.join(faltan)}.")
        print("Corrige sus 'rutas' en config.yaml o bórralas de la lista si no las usas.")
        return 1
    print("\nTodas las apps de la lista blanca están en este PC.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
