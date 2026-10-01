"""Respuestas rápidas: confirmaciones con plantilla para órdenes simples.

Cuando un atajo (core/atajos.py) ejecuta una orden sencilla con éxito
("abre spotify", "pausa", "temporizador de 5 minutos"), no hace falta
esperar 2-4 s a que el LLM redacte "Hecho, señor": usamos una frase de
plantilla en el idioma correcto, con algo de variedad. Para todo lo que
necesite redactar con contenido (info del sistema, errores...) devolvemos
None y contesta el LLM.

Se activa/desactiva con `llm.respuestas_rapidas` en config.yaml.
"""
from __future__ import annotations

import datetime as dt
import random

_FRASES = {
    "abrir_programa": {
        "es": ["Abriendo {x}, señor.", "Enseguida. {X} en marcha.", "{X}, a sus órdenes."],
        "ca": ["Obrint {x}, senyor.", "De seguida. {X} en marxa.", "{X}, a les seves ordres."],
        "en": ["Opening {x}, sir.", "Right away. {X} is on its way.", "{X}, at your service."],
    },
    "abrir_web": {
        "es": ["Abriendo {x} en el navegador, señor."],
        "ca": ["Obrint {x} al navegador, senyor."],
        "en": ["Opening {x} in the browser, sir."],
    },
    "buscar_en_google": {
        "es": ["Le he abierto la búsqueda en Google, señor."],
        "ca": ["Li he obert la cerca a Google, senyor."],
        "en": ["I've opened the Google search for you, sir."],
    },
    "buscar_en_youtube": {
        "es": ["Aquí tiene YouTube, señor."],
        "ca": ["Aquí té YouTube, senyor."],
        "en": ["YouTube is up, sir."],
    },
    "captura_pantalla": {
        "es": ["Captura guardada, señor."],
        "ca": ["Captura desada, senyor."],
        "en": ["Screenshot saved, sir."],
    },
    "temporizador": {
        "es": ["Temporizador de {x} en marcha, señor.", "Hecho. Le aviso en {x}."],
        "ca": ["Temporitzador de {x} en marxa, senyor.", "Fet. L'aviso d'aquí a {x}."],
        "en": ["Timer set for {x}, sir.", "Done. I'll let you know in {x}."],
    },
    "recordar": {
        "es": ["Anotado, señor.", "Lo recordaré, señor."],
        "ca": ["Anotat, senyor.", "Ho recordaré, senyor."],
        "en": ["Noted, sir.", "I'll remember that, sir."],
    },
}

_MULTIMEDIA = {
    "es": {"play_pausa": "Hecho, señor.", "siguiente": "Siguiente pista.", "anterior": "Pista anterior.",
           "volumen_arriba": "Subiendo el volumen.", "volumen_abajo": "Bajando el volumen.",
           "silenciar": "Silencio, señor."},
    "ca": {"play_pausa": "Fet, senyor.", "siguiente": "Següent pista.", "anterior": "Pista anterior.",
           "volumen_arriba": "Pujant el volum.", "volumen_abajo": "Abaixant el volum.",
           "silenciar": "Silenci, senyor."},
    "en": {"play_pausa": "Done, sir.", "siguiente": "Next track.", "anterior": "Previous track.",
           "volumen_arriba": "Turning it up.", "volumen_abajo": "Turning it down.",
           "silenciar": "Muted, sir."},
}

# Cómo empieza el resultado de cada herramienta cuando ha ido bien
_EXITO = {
    "abrir_programa": "Abriendo", "abrir_web": "Abierta", "buscar_en_google": "Búsqueda",
    "buscar_en_youtube": "Búsqueda", "captura_pantalla": "Captura guardada",
    "temporizador": "Temporizador", "control_multimedia": "Hecho", "recordar": "Guardado",
    "hora_y_fecha": "",
}

_UNIDADES = {"es": ("hora", "horas", "minuto", "minutos", "segundo", "segundos", "y"),
             "ca": ("hora", "hores", "minut", "minuts", "segon", "segons", "i"),
             "en": ("hour", "hours", "minute", "minutes", "second", "seconds", "and")}


def duracion_en_palabras(segundos: int, idioma: str) -> str:
    """300 -> '5 minutos' / '5 minuts' / '5 minutes'."""
    u = _UNIDADES.get(idioma, _UNIDADES["es"])
    h, resto = divmod(int(segundos), 3600)
    m, s = divmod(resto, 60)
    partes = []
    for valor, sing, plur in ((h, u[0], u[1]), (m, u[2], u[3]), (s, u[4], u[5])):
        if valor:
            partes.append(f"{valor} {sing if valor == 1 else plur}")
    if len(partes) > 1:
        return ", ".join(partes[:-1]) + f" {u[6]} " + partes[-1]
    return partes[0] if partes else "0"


def _hora(texto_usuario: str, idioma: str) -> str:
    from tools.sistema import hora_y_fecha  # evita import circular
    from tools.base import Contexto
    ahora = dt.datetime.now()
    pide_fecha = any(p in texto_usuario.lower() for p in ("día", "dia", "day", "fecha", "data", "date"))
    if pide_fecha:
        fecha = hora_y_fecha(Contexto(cfg={}, idioma=idioma)).split(".")[0]
        return {"es": f"Hoy es {fecha}, señor.", "ca": f"Avui és {fecha}, senyor.",
                "en": f"Today is {fecha}, sir."}.get(idioma, fecha)
    hhmm = f"{ahora:%H:%M}"
    if idioma == "ca":
        return f"Són les {hhmm}, senyor."
    if idioma == "en":
        return f"It's {hhmm}, sir."
    return f"{'Es la' if ahora.hour == 1 else 'Son las'} {hhmm}, señor."


def rapida(nombre: str, args: dict, resultado: str, idioma: str, texto_usuario: str) -> str | None:
    """Frase de confirmación lista para decir, o None si debe redactarla el LLM."""
    exito = _EXITO.get(nombre)
    if exito is None or not resultado.startswith(exito):
        return None  # herramienta compleja o algo falló: que lo explique el LLM
    idioma = idioma if idioma in ("es", "ca", "en") else "es"
    if nombre == "hora_y_fecha":
        return _hora(texto_usuario, idioma)
    if nombre == "control_multimedia":
        return _MULTIMEDIA[idioma].get(args.get("accion", ""), _MULTIMEDIA[idioma]["play_pausa"])
    x = ""
    if nombre == "abrir_programa":
        x = resultado.removeprefix("Abriendo ").rstrip(".")
    elif nombre == "abrir_web":
        x = args.get("url", "").removeprefix("https://").removeprefix("www.")
    elif nombre == "temporizador":
        x = duracion_en_palabras(args.get("segundos", 0), idioma)
    frase = random.choice(_FRASES[nombre][idioma])
    return frase.format(x=x, X=x[:1].upper() + x[1:])
