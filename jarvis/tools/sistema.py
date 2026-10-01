"""Herramientas de sistema: hora, info del equipo, capturas y energía."""
from __future__ import annotations

import datetime as dt
import subprocess

import psutil

from core.config import ruta
from tools.base import Contexto, herramienta

_DIAS = {
    "es": ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"],
    "ca": ["dilluns", "dimarts", "dimecres", "dijous", "divendres", "dissabte", "diumenge"],
    "en": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
}
_MESES = {
    "es": ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
           "septiembre", "octubre", "noviembre", "diciembre"],
    "ca": ["de gener", "de febrer", "de març", "d'abril", "de maig", "de juny", "de juliol",
           "d'agost", "de setembre", "d'octubre", "de novembre", "de desembre"],
    "en": ["January", "February", "March", "April", "May", "June", "July", "August",
           "September", "October", "November", "December"],
}


@herramienta("hora_y_fecha", "Devuelve la hora y la fecha actuales del PC.")
def hora_y_fecha(ctx: Contexto) -> str:
    ahora = dt.datetime.now()
    i = ctx.idioma if ctx.idioma in _DIAS else "es"
    dia, mes = _DIAS[i][ahora.weekday()], _MESES[i][ahora.month - 1]
    if i == "en":
        fecha = f"{dia}, {mes} {ahora.day}, {ahora.year}"
    elif i == "ca":
        fecha = f"{dia}, {ahora.day} {mes} de {ahora.year}"
    else:
        fecha = f"{dia}, {ahora.day} de {mes} de {ahora.year}"
    return f"{fecha}. Hora: {ahora:%H:%M}."


@herramienta("info_sistema", "Uso de CPU, memoria RAM y estado de la batería del PC.")
def info_sistema(ctx: Contexto) -> str:
    cpu = psutil.cpu_percent(interval=0.5)
    ram = psutil.virtual_memory()
    partes = [f"CPU al {cpu:.0f}%",
              f"RAM al {ram.percent:.0f}% ({ram.used / 2**30:.1f} de {ram.total / 2**30:.1f} GB)"]
    bat = psutil.sensors_battery()
    if bat is None:
        partes.append("sin batería (equipo de sobremesa)")
    else:
        estado = "cargando" if bat.power_plugged else "descargando"
        partes.append(f"batería al {bat.percent:.0f}% ({estado})")
    return ", ".join(partes) + "."


@herramienta("captura_pantalla", "Hace una captura de toda la pantalla y la guarda en una carpeta.")
def captura_pantalla(ctx: Contexto) -> str:
    from PIL import ImageGrab  # import aquí: solo se carga si se usa

    carpeta = ruta(ctx.cfg["herramientas"].get("carpeta_capturas", "data/capturas"))
    carpeta.mkdir(parents=True, exist_ok=True)
    archivo = carpeta / f"captura_{dt.datetime.now():%Y%m%d_%H%M%S}.png"
    ImageGrab.grab(all_screens=True).save(archivo)
    return f"Captura guardada en {archivo}"


# --- Apagar / reiniciar ------------------------------------------------
# Siempre con 30 s de margen para poder cancelar ("cancela el apagado").

_ENERGIA = {
    "apagar": ["shutdown", "/s", "/t", "30"],
    "reiniciar": ["shutdown", "/r", "/t", "30"],
    "cancelar": ["shutdown", "/a"],
}


def _pregunta_energia(ctx: Contexto, args: dict) -> str | None:
    accion, idioma = args.get("accion", ""), ctx.idioma
    if accion == "cancelar":
        return None  # cancelar un apagado es inofensivo: sin confirmación
    textos = {
        "es": {"apagar": "¿Seguro que quiere que apague el equipo, señor?",
               "reiniciar": "¿Seguro que quiere que reinicie el equipo, señor?"},
        "ca": {"apagar": "Segur que vol que apagui l'ordinador, senyor?",
               "reiniciar": "Segur que vol que reiniciï l'ordinador, senyor?"},
        "en": {"apagar": "Are you sure you want me to shut down the computer, sir?",
               "reiniciar": "Are you sure you want me to restart the computer, sir?"},
    }
    return textos.get(idioma, textos["es"]).get(accion, f"¿Confirma: {accion}?")


@herramienta(
    "energia_pc",
    "Apaga o reinicia el PC (con 30 segundos de margen) o cancela un apagado pendiente. "
    "Pide confirmación al usuario automáticamente.",
    {"accion": {"type": "string", "enum": ["apagar", "reiniciar", "cancelar"],
                "description": "apagar, reiniciar o cancelar"}},
    requeridos=["accion"],
    confirmacion=_pregunta_energia,
)
def energia_pc(ctx: Contexto, accion: str) -> str:
    comando = _ENERGIA.get(accion)
    if comando is None:
        return "Acción no válida. Usa apagar, reiniciar o cancelar."
    subprocess.run(comando, check=False, capture_output=True)
    if accion == "cancelar":
        return "Apagado o reinicio cancelado."
    return f"Hecho: el equipo se va a {accion} en 30 segundos. Se puede cancelar."
