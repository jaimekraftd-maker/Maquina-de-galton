"""Atajos: órdenes claras que se reconocen con reglas, sin preguntar al LLM.

¿Por qué? Los modelos de 3B a veces "se inventan" que han hecho algo
("he subido el volumen") sin llamar a la herramienta. Para las órdenes
típicas de un asistente es más fiable (y ~2 s más rápido) reconocerlas
aquí con expresiones regulares en español, catalán e inglés.

Si un atajo encaja, Cerebro ejecuta la herramienta y el LLM solo redacta
la confirmación con su personalidad. Si no encaja, decide el LLM como
siempre. Se desactiva con `llm.atajos: false` en config.yaml.

Las reglas son conservadoras a propósito: mejor dejar pasar una orden al
LLM que ejecutar algo que no pediste.
"""
from __future__ import annotations

import re

from core.idioma import normalizar
from tools.apps import buscar_app

# ----------------------------------------------------------------------
# Números escritos con letras (Whisper suele dar cifras, pero por si acaso)
# ----------------------------------------------------------------------
_NUMEROS = {
    # es
    "un": 1, "uno": 1, "una": 1, "dos": 2, "tres": 3, "cuatro": 4, "cinco": 5, "seis": 6,
    "siete": 7, "ocho": 8, "nueve": 9, "diez": 10, "quince": 15, "veinte": 20,
    "treinta": 30, "cuarenta": 40, "cincuenta": 50, "sesenta": 60, "noventa": 90,
    # ca
    "dues": 2, "quatre": 4, "cinc": 5, "sis": 6, "set": 7, "vuit": 8, "nou": 9, "deu": 10,
    "quinze": 15, "vint": 20, "trenta": 30, "quaranta": 40, "cinquanta": 50, "seixanta": 60,
    # en
    "a": 1, "an": 1, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6,
    "seven": 7, "eight": 8, "nine": 9, "ten": 10, "fifteen": 15, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "ninety": 90,
}
_UNIDADES = [
    (r"h(?:ora|our|ores)?s?", 3600),
    (r"min(?:uto|ute|ut)?s?", 60),
    (r"s(?:eg(?:undo|on)?|ec(?:ond)?)?s?", 1),
]


def _duracion(t: str) -> int | None:
    """'1 hora y 30 minutos' -> 5400; 'media hora' -> 1800. None si no hay."""
    total = 0
    media = r"\b(media|mitja) hora\b|\bhalf an hour\b"
    if re.search(media, t):
        total += 1800
        t = re.sub(media, " ", t)  # para que no se cuente otra vez como "hora"
    num = r"\b(\d+(?:[.,]\d+)?|" + "|".join(sorted(_NUMEROS, key=len, reverse=True)) + r")"
    for patron, factor in _UNIDADES:
        for m in re.finditer(num + r"\s*" + patron + r"\b", t):
            valor = m.group(1)
            n = float(valor.replace(",", ".")) if valor[0].isdigit() else _NUMEROS[valor]
            total += int(n * factor)
            if re.match(r"\s*y medio|\s*i mig|\s*and a half", t[m.end():]):
                total += factor // 2
    return total or None


def _original(fragmento: str, texto: str) -> str:
    """Recupera del texto original (con tildes y mayúsculas) el trozo que
    corresponde a `fragmento`, que está normalizado. 'te' -> 'té'."""
    palabras = re.findall(r"[\w'·.-]+", texto)
    norm = [normalizar(p).strip(".") for p in palabras]
    buscadas = fragmento.split()
    for i in range(len(norm) - len(buscadas), -1, -1):  # desde el final
        if norm[i:i + len(buscadas)] == buscadas:
            return " ".join(palabras[i:i + len(buscadas)]).strip(".")
    return fragmento


# ----------------------------------------------------------------------
# Reglas
# ----------------------------------------------------------------------
_RELLENO = re.compile(
    r"^(?:(?:hey|oye|ei|eh|ok|vale|bueno|jarvis)[\s,]+)+"
    r"|[\s,]*(?:por favor|si us plau|please|jarvis)\s*$")

_CANCION = r"(cancion|canco|tema|pista|song|track)"
_ACCIONES_MULTIMEDIA = [
    (r"^(pausa|pausar|pause|play|reanuda|resume|continua|stop)( la musica| the music| music)?$"
     r"|\b(pausa|para|deten|atura|pause|stop|reanuda|resume|continua) (la |the )?(musica|music|canco|cancion|song)\b"
     r"|\bdale al play\b", "play_pausa"),
    (rf"^(siguiente|next|seguent|salta|skip)( {_CANCION})?$"
     rf"|\b(siguiente|next|seguent) {_CANCION}\b|\b(pasa|salta|skip|canvia) (de |la |esta |this )?{_CANCION}\b",
     "siguiente"),
    (rf"^(anterior|previous)( {_CANCION})?$|\b{_CANCION} anterior\b|\bprevious {_CANCION}\b", "anterior"),
    (r"\b(sube|subir|puja|pujar|turn up|raise|increase)\b.*\b(volumen|volum|volume|musica)\b"
     r"|\bvolume up\b|\bmas alto\b|\bmes fort\b|\blouder\b", "volumen_arriba"),
    (r"\b(baja|bajar|baixa|baixar|turn down|lower|decrease)\b.*\b(volumen|volum|volume|musica)\b"
     r"|\bvolume down\b|\bmas bajo\b|\bmes baix\b|\bquieter\b", "volumen_abajo"),
    (r"\b(silencia|silenciar|mute|calla la musica)\b", "silenciar"),
]


def detectar(texto: str, cfg: dict) -> tuple[str, dict] | None:
    """Devuelve (herramienta, argumentos) si el texto es una orden clara."""
    t = normalizar(texto)
    t = re.sub(r"[¿?¡!,;:\"]", " ", t)
    t = re.sub(r"\s+", " ", t).strip(" .")
    t = _RELLENO.sub("", t).strip(" .")
    if not t or len(t) > 120:
        return None

    # --- hora y fecha ---
    if re.search(r"^(que|quina|dime la|digues l'|what) ?(horas?|time)\b|\bwhat'?s the (time|date)\b"
                 r"|^(que|quin|what) (dia|day|fecha|data)\b.*\b(hoy|avui|today|es|is)\b", t):
        return "hora_y_fecha", {}

    # --- temporizador ---
    if re.search(r"\b(temporizador|temporitzador|timer|alarma|avisame en|avisa'm en|remind me in)\b", t):
        segundos = _duracion(t)
        if segundos:
            m = re.search(r"\b(?:para|per a|per|for)\s+(?:el |la |los |las |l'|els |les |the |my )?"
                          r"([a-z' ]{2,30})$", t)
            etiqueta = _original(m.group(1).strip(), texto) if m and not _duracion(m.group(1)) else ""
            return "temporizador", {"segundos": segundos, "etiqueta": etiqueta}

    # --- energía (siempre pasará por la confirmación) ---
    if re.search(r"\b(cancela|cancel|anula)\b.*\b(apagado|reinicio|shutdown|apagada|restart)\b", t):
        return "energia_pc", {"accion": "cancelar"}
    equipo = r"\b(ordenador|pc|equipo|computer|ordinador|portatil|sistema)\b"
    if re.search(r"^(apaga|apagar|shut down|turn off|apagueu)\b", t) and re.search(equipo, t):
        return "energia_pc", {"accion": "apagar"}
    if re.search(r"^(reinicia|reiniciar|restart|reboot|reinicieu)\b", t) and re.search(equipo, t):
        return "energia_pc", {"accion": "reiniciar"}

    # --- multimedia (solo frases cortas, para no confundir conversación) ---
    if len(t.split()) <= 7:
        for patron, accion in _ACCIONES_MULTIMEDIA:
            if re.search(patron, t):
                return "control_multimedia", {"accion": accion}

    # --- captura e info del sistema ---
    if re.search(r"\b(captura|screenshot|pantallazo)\b", t):
        return "captura_pantalla", {}
    if re.search(r"\b(uso de|estado del|com va el|how much|status of|nivel de)\b.*"
                 r"\b(cpu|ram|memoria|bateria|battery|sistema|system|procesador)\b"
                 r"|^(cpu|ram|bateria|battery)\b|\bque tal (va )?(el|la) (pc|ordenador|bateria)\b"
                 r"|\b(cuanta|quanta|how much) (bateria|battery|ram|memoria)\b", t):
        return "info_sistema", {}

    # --- búsquedas ---
    m = re.match(r"^(?:busca|buscar|cerca|search(?: for)?|googlea|pon|posa|play)\s+(.+?)\s+"
                 r"(?:en|a|on) youtube$", t) or re.match(
        r"^(?:busca|buscar|cerca|search)\s+(?:en|a|on) youtube\s+(.+)$", t)
    if m:
        return "buscar_en_youtube", {"consulta": _original(m.group(1), texto)}
    m = re.match(r"^(?:busca|buscar|cerca|search(?: for)?|googlea|google)\s+(?:en google\s+|a google\s+|on google\s+)?"
                 r"(.+?)(?:\s+(?:en|a|on) google)?$", t)
    if m:
        return "buscar_en_google", {"consulta": _original(m.group(1), texto)}

    # --- memoria (fase 2): guardamos el texto ORIGINAL, con tildes ---
    m = re.match(r"^(?:recuerda|recorda|remember|apunta|anota|guarda)\s+(?:que|that)\s+(.+)$", t)
    if m:
        return "recordar", {"hecho": _original(m.group(1), texto)}
    m = re.match(r"^(?:olvida|oblida|forget)\s+(?:que|lo de|el que|that|about)\s+(.+)$", t)
    if m:
        return "olvidar", {"texto": _original(m.group(1), texto)}
    if re.search(r"^(que|what) (recuerdas|recordes|do you remember|sabes|saps|do you know) "
                 r"(de mi|sobre mi|about me)\b", t):
        return "listar_recuerdos", {}

    # --- abrir programa o web ---
    m = re.match(r"^(?:abre|abrir|obre|obrir|open|lanza|launch|inicia|arranca|executa|ejecuta|start)\s+"
                 r"(?:el |la |l'|un |una |the |app |programa |aplicacion |aplicacio )?(.+)$", t)
    if m:
        objetivo = m.group(1).strip()
        if re.fullmatch(r"[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?", objetivo):
            return "abrir_web", {"url": objetivo}
        if buscar_app(objetivo, cfg.get("apps", {})) or len(objetivo.split()) <= 3:
            # Si no está en la lista blanca, la herramienta lo dirá con educación
            return "abrir_programa", {"nombre": objetivo}
    return None
