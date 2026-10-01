"""Memoria persistente de Jarvis en SQLite (data/memoria.db).

Dos tablas:
  recuerdos -> hechos duraderos sobre ti ("mi color favorito es el azul")
  mensajes  -> historial corto de conversación, para seguir entre sesiones

Elección de recuerdos relevantes en cada turno:
  * Si hay pocos (<= memoria.umbral_embeddings) se usan todos.
  * Si hay más, se buscan los más parecidos a tu mensaje con embeddings
    (modelo nomic-embed-text de Ollama) y similitud del coseno.
  * Si ese modelo no está instalado, se usa coincidencia de palabras.

Puedes abrir el .db con cualquier visor de SQLite (p. ej. "DB Browser for
SQLite") para ver o editar lo que recuerda.
"""
from __future__ import annotations

import datetime as dt
import logging
import re
import sqlite3
import threading

import numpy as np

from core.config import ruta
from core.idioma import normalizar

log = logging.getLogger("jarvis.memoria")

_ESQUEMA = """
CREATE TABLE IF NOT EXISTS recuerdos (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    texto     TEXT NOT NULL,
    creado    TEXT NOT NULL,
    embedding BLOB            -- vector float32; NULL si aún no se ha calculado
);
CREATE TABLE IF NOT EXISTS mensajes (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    rol       TEXT NOT NULL,  -- 'user' o 'assistant'
    contenido TEXT NOT NULL,
    creado    TEXT NOT NULL
);
"""

# Palabras vacías que no cuentan para la búsqueda por palabras
_VACIAS = set("""el la los las un una de del que y en es por para con mi me te se lo
    al su sus i els les amb per em et the a an of to and in is my me it on for""".split())


class Memoria:
    def __init__(self, cfg: dict, ollama=None):
        c = cfg["memoria"]
        self.umbral = c.get("umbral_embeddings", 15)
        self.top_k = c.get("top_k", 6)
        self.max_historial = c.get("max_historial_guardado", 200)
        self.modelo_emb = c.get("modelo_embeddings", "nomic-embed-text")
        self.ollama = ollama
        self._usar_emb: bool | None = None  # se decide la primera vez que haga falta

        archivo = ruta(c.get("ruta_db", "data/memoria.db"))
        archivo.parent.mkdir(parents=True, exist_ok=True)
        # check_same_thread=False + candado: los temporizadores viven en otros hilos
        self.db = sqlite3.connect(archivo, check_same_thread=False)
        self.db.executescript(_ESQUEMA)
        self._candado = threading.Lock()

    @staticmethod
    def _ahora() -> str:
        return dt.datetime.now().isoformat(timespec="seconds")

    # ==================================================================
    # Recuerdos
    # ==================================================================
    def recordar(self, texto: str) -> tuple[int, bool]:
        """Guarda un hecho. Devuelve (id, es_nuevo). No duplica hechos iguales."""
        texto = texto.strip().rstrip(".")
        for id_, t in self.listar():
            if normalizar(t) == normalizar(texto):
                return id_, False
        emb = self._embedding(texto, "search_document")
        with self._candado:
            cur = self.db.execute(
                "INSERT INTO recuerdos (texto, creado, embedding) VALUES (?, ?, ?)",
                (texto, self._ahora(), emb.tobytes() if emb is not None else None))
            self.db.commit()
        return cur.lastrowid, True

    def olvidar(self, id_: int) -> str | None:
        """Borra un recuerdo. Devuelve su texto, o None si no existía."""
        fila = self.db.execute("SELECT texto FROM recuerdos WHERE id = ?", (id_,)).fetchone()
        if fila is None:
            return None
        with self._candado:
            self.db.execute("DELETE FROM recuerdos WHERE id = ?", (id_,))
            self.db.commit()
        return fila[0]

    def obtener(self, id_: int) -> str | None:
        fila = self.db.execute("SELECT texto FROM recuerdos WHERE id = ?", (id_,)).fetchone()
        return fila[0] if fila else None

    def listar(self) -> list[tuple[int, str]]:
        return self.db.execute("SELECT id, texto FROM recuerdos ORDER BY id").fetchall()

    def buscar(self, consulta: str, k: int | None = None) -> list[tuple[int, str]]:
        """Los k recuerdos más parecidos a `consulta` (embeddings o palabras)."""
        k = k or self.top_k
        filas = self.db.execute("SELECT id, texto, embedding FROM recuerdos").fetchall()
        if not filas:
            return []
        q = self._embedding(consulta, "search_query") if self._embeddings_disponibles() else None
        if q is not None:
            self._completar_embeddings(filas)
            filas = self.db.execute("SELECT id, texto, embedding FROM recuerdos").fetchall()
            matriz = np.stack([np.frombuffer(e, dtype=np.float32) for _, _, e in filas])
            # Similitud del coseno = producto escalar de vectores normalizados
            sim = matriz @ q / (np.linalg.norm(matriz, axis=1) * np.linalg.norm(q) + 1e-9)
            orden = np.argsort(-sim)[:k]
            log.debug("Recuerdos por embeddings: %s",
                      [(filas[i][1][:30], round(float(sim[i]), 2)) for i in orden])
            return [(filas[i][0], filas[i][1]) for i in sorted(orden, key=lambda i: filas[i][0])]
        # Plan B: palabras en común
        palabras_q = self._palabras(consulta)
        puntuados = [(len(palabras_q & self._palabras(t)), id_, t) for id_, t, _ in filas]
        puntuados = [p for p in sorted(puntuados, reverse=True)[:k] if p[0] > 0]
        return sorted(((id_, t) for _, id_, t in puntuados))

    def recuerdos_relevantes(self, consulta: str) -> list[tuple[int, str]]:
        """Lo que se inyecta en el prompt en cada turno."""
        todos = self.listar()
        if len(todos) <= self.umbral:
            return todos
        return self.buscar(consulta)

    def hay_muchos(self) -> bool:
        """True si ya no se inyectan todos (cambia dónde se ponen en el prompt)."""
        return self.db.execute("SELECT COUNT(*) FROM recuerdos").fetchone()[0] > self.umbral

    # -- embeddings --------------------------------------------------------
    def _embeddings_disponibles(self) -> bool:
        if self._usar_emb is None:
            self._usar_emb = bool(self.ollama and self.ollama.tiene_modelo(self.modelo_emb))
            if not self._usar_emb:
                log.info("Sin '%s' en Ollama: búsqueda de recuerdos por palabras "
                         "(para embeddings: ollama pull %s)", self.modelo_emb, self.modelo_emb)
        return self._usar_emb

    def _embedding(self, texto: str, tarea: str) -> np.ndarray | None:
        """nomic-embed-text espera un prefijo que indica la tarea."""
        if not self._embeddings_disponibles():
            return None
        try:
            vec = self.ollama.embed([f"{tarea}: {texto}"], self.modelo_emb)[0]
            return np.asarray(vec, dtype=np.float32)
        except Exception as e:
            log.warning("No se pudo calcular el embedding: %s", e)
            return None

    def _completar_embeddings(self, filas) -> None:
        """Calcula los embeddings que falten (p. ej. recuerdos de antes de instalar el modelo)."""
        for id_, texto, emb in filas:
            if emb is None:
                v = self._embedding(texto, "search_document")
                if v is not None:
                    with self._candado:
                        self.db.execute("UPDATE recuerdos SET embedding = ? WHERE id = ?",
                                        (v.tobytes(), id_))
                        self.db.commit()

    @staticmethod
    def _palabras(texto: str) -> set[str]:
        return {p for p in re.findall(r"\w+", normalizar(texto)) if p not in _VACIAS and len(p) > 2}

    # ==================================================================
    # Historial de conversación
    # ==================================================================
    def guardar_mensaje(self, rol: str, contenido: str) -> None:
        with self._candado:
            self.db.execute("INSERT INTO mensajes (rol, contenido, creado) VALUES (?, ?, ?)",
                            (rol, contenido, self._ahora()))
            # Solo conservamos los últimos N mensajes
            self.db.execute("DELETE FROM mensajes WHERE id NOT IN "
                            "(SELECT id FROM mensajes ORDER BY id DESC LIMIT ?)", (self.max_historial,))
            self.db.commit()

    def historial(self, n_turnos: int) -> list[dict]:
        """Últimos n turnos como mensajes {'role', 'content'}, del más antiguo al más nuevo."""
        filas = self.db.execute("SELECT rol, contenido FROM mensajes ORDER BY id DESC LIMIT ?",
                                (2 * n_turnos,)).fetchall()
        mensajes = [{"role": r, "content": c} for r, c in reversed(filas)]
        while mensajes and mensajes[0]["role"] != "user":  # que empiece por el usuario
            mensajes.pop(0)
        return mensajes

    def borrar_historial(self) -> None:
        with self._candado:
            self.db.execute("DELETE FROM mensajes")
            self.db.commit()
