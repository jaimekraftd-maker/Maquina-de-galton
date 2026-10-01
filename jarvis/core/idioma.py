"""Detección ligera de idioma (español / catalán / inglés) sin dependencias.

En modo voz el idioma lo da Whisper; en modo texto usamos esta heurística:
contamos palabras muy frecuentes y rasgos ortográficos propios de cada idioma.
No es perfecta, pero para frases de un asistente acierta casi siempre.
"""
from __future__ import annotations

import re
import unicodedata

IDIOMAS = ("es", "ca", "en")

NOMBRES = {"es": "español", "ca": "català", "en": "English"}

# Instrucción que se añade al final del mensaje del usuario, escrita en su
# propio idioma (los modelos pequeños la obedecen mucho mejor así).
INSTRUCCION = {
    "es": "(Responde en español.)",
    "ca": "(Respon en català, no en castellà.)",
    "en": "(Reply in English.)",
}

_PALABRAS = {
    "es": set("""el la los las de del que y en un una es por para con no se lo
        mi me te qué cómo cuál cuándo dónde quién hoy hora muy pero más está
        estás son hay quiero puedes abre abrir pon dime haz hazme busca gracias
        favor buenos buenas tengo yo tú usted algo eso esto ahora bien sí señor
        recuerda olvida apaga sube baja siguiente""".split()),
    "ca": set("""el la els les de del que i en un una és per amb no es ho
        em et què com quin quina quan on qui avui hora molt però més està
        estàs són hi ha vull pots obre obrir posa digues fes busca gràcies
        plau bon bona dia tinc jo tu vostè alguna això ara bé sí senyor
        recorda oblida apaga puja baixa següent anterior meu meva""".split()),
    "en": set("""the a an of to and in is are what how when where who which
        today time very but more can could you your please open play search
        thanks thank hello hi good morning have i my me it this that now
        yes sir remember forget turn up down next previous set timer""".split()),
}

# Rasgos ortográficos casi exclusivos de cada idioma (peso extra)
_RASGOS = {
    "ca": [r"l·l", r"\bny", r"ny\b", r"[àèò]", r"\bés\b", r"ç", r"\bels\b", r"\bamb\b",
           r"\bperò\b", r"\bavui\b", r"\bsi us plau\b", r"\bd'acord\b", r"\bquè\b"],
    "es": [r"ñ", r"¿", r"¡", r"\bqué\b", r"\bhoy\b", r"\bestá\b", r"ción\b", r"\bpor favor\b"],
    "en": [r"\bthe\b", r"\bwhat's\b", r"\bi'm\b", r"\bdon't\b", r"\bplease\b", r"ing\b"],
}


def _sin_acentos(texto: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", texto)
                   if unicodedata.category(c) != "Mn")


def detectar(texto: str, por_defecto: str = "es") -> str:
    """Devuelve 'es', 'ca' o 'en'. Si no hay pistas claras, `por_defecto`."""
    t = texto.lower()
    palabras = re.findall(r"[\wàèéíòóúïüç·']+", t)
    puntos = {i: 0.0 for i in IDIOMAS}
    for p in palabras:
        for i in IDIOMAS:
            if p in _PALABRAS[i]:
                puntos[i] += 1
    for i, patrones in _RASGOS.items():
        for pat in patrones:
            puntos[i] += 1.5 * len(re.findall(pat, t))
    mejor = max(puntos, key=puntos.get)
    if puntos[mejor] == 0:
        return por_defecto
    # Empate entre es/ca (muchas palabras compartidas): mantenemos el anterior
    empatados = [i for i in IDIOMAS if puntos[i] == puntos[mejor]]
    if len(empatados) > 1:
        return por_defecto if por_defecto in empatados else empatados[0]
    return mejor


_SI = {"si", "sí", "claro", "vale", "confirmo", "confirmado", "adelante", "hazlo", "correcto",
       "endavant", "d'acord", "fes-ho", "confirma", "yes", "yeah", "yep", "sure", "confirm",
       "affirmative", "afirmativo", "ok", "okay", "dale", "exacto", "segur", "seguro", "go"}
_NO = {"no", "nope", "cancela", "cancelar", "cancel", "para", "espera", "negativo", "mejor no",
       "millor no", "deixa-ho", "dejalo", "déjalo", "stop", "wait"}


def es_afirmativo(respuesta: str) -> bool:
    """¿La respuesta a una confirmación es un 'sí' claro? Ante la duda, NO."""
    palabras = re.findall(r"[\wàèéíòóúïüç'-]+", respuesta.lower())
    if any(p in _NO for p in palabras) or "mejor no" in respuesta.lower():
        return False
    return any(p in _SI or normalizar(p) in _SI for p in palabras)


def normalizar(texto: str) -> str:
    """Minúsculas y sin acentos, útil para comparar nombres."""
    return _sin_acentos(texto.lower()).strip()


_DIAS = {"es": "lunes martes miércoles jueves viernes sábado domingo",
         "ca": "dilluns dimarts dimecres dijous divendres dissabte diumenge",
         "en": "Monday Tuesday Wednesday Thursday Friday Saturday Sunday"}
_AHORA = {"es": "Ahora", "ca": "Ara", "en": "Now"}


def ahora_texto(idioma: str) -> str:
    """'Ahora: jueves 01/10/2026 18:35' en el idioma indicado."""
    import datetime as dt
    i = idioma if idioma in _DIAS else "es"
    ahora = dt.datetime.now()
    return f"{_AHORA[i]}: {_DIAS[i].split()[ahora.weekday()]} {ahora:%d/%m/%Y %H:%M}"
