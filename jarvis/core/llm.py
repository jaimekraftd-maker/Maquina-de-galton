"""Cliente de Ollama + bucle de herramientas (el "cerebro" de Jarvis).

Flujo de un turno (Cerebro.responder):

  1. Montamos los mensajes: system prompt (+ recuerdos), últimos turnos y
     el mensaje del usuario con la instrucción de idioma al final.
  2. Llamamos a Ollama en modo streaming. Según llega el texto lo partimos
     en frases y se las pasamos a `on_frase` (la voz empieza a hablar
     antes de que el modelo termine: clave para la latencia).
  3. Si el modelo pide herramientas, las ejecutamos (tools.ejecutar) y le
     devolvemos el resultado como mensajes "tool". Repetimos hasta que
     conteste solo con texto o se agoten las rondas.
"""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from dataclasses import dataclass, field
from typing import Callable, Iterator

import requests

from core import atajos, respuestas
from core import idioma as idiomas
from core.personalidad import BLOQUE_HERRAMIENTAS, BLOQUE_RECUERDOS, REGLA_EXPERTO, SYSTEM_PROMPT
from tools import REGISTRO, Contexto, ejecutar, esquemas

log = logging.getLogger("jarvis.llm")


class ErrorOllama(RuntimeError):
    pass


# ======================================================================
# Cliente HTTP de Ollama
# ======================================================================

class ClienteOllama:
    def __init__(self, cfg_llm: dict):
        self.url = cfg_llm.get("url", "http://localhost:11434").rstrip("/")
        self.modelo = cfg_llm.get("modelo", "llama3.2:3b")
        self.opciones = {
            "temperature": cfg_llm.get("temperatura", 0.5),
            "num_ctx": cfg_llm.get("num_ctx", 4096),
        }
        self.keep_alive = cfg_llm.get("keep_alive", "30m")
        self.timeout = cfg_llm.get("timeout_s", 120)
        self.sesion = requests.Session()

    # -- comprobaciones -------------------------------------------------
    def modelos_instalados(self) -> list[str]:
        try:
            r = self.sesion.get(f"{self.url}/api/tags", timeout=5)
            r.raise_for_status()
        except requests.RequestException as e:
            raise ErrorOllama(
                f"No puedo hablar con Ollama en {self.url} ({e}).\n"
                "  ¿Está instalado y abierto? Descárgalo de https://ollama.com o ejecuta:  ollama serve"
            ) from e
        return [m["name"] for m in r.json().get("models", [])]

    def comprobar(self, modelo: str | None = None) -> None:
        """Lanza ErrorOllama con el comando a ejecutar si falta el modelo."""
        modelo = modelo or self.modelo
        instalados = self.modelos_instalados()
        base = modelo if ":" in modelo else modelo + ":latest"
        if base not in instalados and modelo not in instalados:
            raise ErrorOllama(
                f"El modelo '{modelo}' no está descargado en Ollama.\n"
                f"  Ejecuta:  ollama pull {modelo}\n"
                f"  Modelos que sí tienes: {', '.join(instalados) or '(ninguno)'}"
            )

    def tiene_modelo(self, modelo: str) -> bool:
        try:
            self.comprobar(modelo)
            return True
        except ErrorOllama:
            return False

    def plantilla(self) -> str:
        """Plantilla de chat del modelo (cómo convierte mensajes en texto)."""
        r = self.sesion.post(f"{self.url}/api/show", json={"model": self.modelo}, timeout=10)
        return r.json().get("template", "") if r.status_code == 200 else ""

    # -- chat -----------------------------------------------------------
    def chat(self, mensajes: list[dict], herramientas: list[dict] | None = None,
             num_predict: int | None = None) -> Iterator[dict]:
        """Petición a /api/chat en streaming. Devuelve los trozos JSON uno a uno."""
        cuerpo = {
            "model": self.modelo,
            "messages": mensajes,
            "stream": True,
            "keep_alive": self.keep_alive,
            "options": dict(self.opciones),
        }
        if herramientas:
            cuerpo["tools"] = herramientas
        if num_predict is not None:
            cuerpo["options"]["num_predict"] = num_predict
        try:
            with self.sesion.post(f"{self.url}/api/chat", json=cuerpo, stream=True,
                                  timeout=self.timeout) as r:
                if r.status_code != 200:
                    raise ErrorOllama(f"Ollama respondió {r.status_code}: {r.text[:300]}")
                for linea in r.iter_lines():
                    if linea:
                        trozo = json.loads(linea)
                        if "error" in trozo:
                            raise ErrorOllama(trozo["error"])
                        yield trozo
        except requests.RequestException as e:
            raise ErrorOllama(f"Error de conexión con Ollama: {e}") from e

    # -- embeddings (memoria, fase 2) -----------------------------------
    def embed(self, textos: list[str], modelo: str) -> list[list[float]]:
        r = self.sesion.post(f"{self.url}/api/embed",
                             json={"model": modelo, "input": textos, "keep_alive": self.keep_alive},
                             timeout=self.timeout)
        if r.status_code != 200:
            raise ErrorOllama(f"Error de embeddings ({r.status_code}): {r.text[:200]}")
        return r.json()["embeddings"]


# ======================================================================
# Texto -> frases habladas
# ======================================================================

_EMOJIS = re.compile("[\U0001F000-\U0001FAFF\U00002600-\U000027BF\U0001F1E6-\U0001F1FF️‍]")


def limpiar_para_voz(texto: str) -> str:
    """Quita markdown/emojis que el modelo cuele, para que Piper no lea '*'."""
    t = _EMOJIS.sub("", texto)
    t = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", t)          # [texto](url) -> texto
    t = re.sub(r"[*_`#>~|]+", "", t)                         # símbolos markdown
    t = re.sub(r"^\s*(?:[-•]|\d+[.)])\s+", "", t, flags=re.M)  # viñetas
    t = re.sub(r"\(\s*(Responde|Respon|Reply) [^)]*\)", "", t)  # eco de nuestra instrucción
    t = re.sub(r"\[(Ahora|Ara|Now): [^\]]*\]", "", t)
    return re.sub(r"\s+", " ", t).strip()


class DivisorFrases:
    """Acumula texto en streaming y suelta frases completas.

    Cortamos tras . ! ? … ; seguidos de espacio, o en un salto de línea.
    La primera frase puede ser corta (para empezar a hablar cuanto antes);
    las siguientes se agrupan hasta un mínimo para que la voz suene natural.
    """
    _FIN = re.compile(r"(?<=[.!?…;])\s+|\n+")

    def __init__(self, minimo: int = 25):
        self.buffer = ""
        self.minimo = minimo
        self.emitidas = 0

    def alimentar(self, delta: str) -> list[str]:
        self.buffer += delta
        frases = []
        while True:
            m = self._FIN.search(self.buffer)
            if not m:
                break
            candidata = self.buffer[:m.start()].strip()
            minimo = 1 if self.emitidas == 0 else self.minimo
            if len(candidata) < minimo:
                # demasiado corta: esperamos al siguiente corte
                siguiente = self._FIN.search(self.buffer, m.end())
                if not siguiente:
                    break
                candidata = self.buffer[:siguiente.start()].strip()
                m = siguiente
            self.buffer = self.buffer[m.end():]
            if limpiar_para_voz(candidata):
                frases.append(limpiar_para_voz(candidata))
                self.emitidas += 1
        return frases

    def vaciar(self) -> list[str]:
        resto, self.buffer = limpiar_para_voz(self.buffer), ""
        return [resto] if resto else []


# ======================================================================
# Llamadas a herramientas escritas como texto (plan B)
# ======================================================================

def extraer_llamadas_en_texto(texto: str) -> list[dict]:
    """Algunos modelos pequeños escriben la llamada como JSON en el texto
    ({"name": "x", "parameters": {...}}) en lugar de usar tool_calls.
    Si es así, la convertimos al formato normal."""
    llamadas, decoder, i = [], json.JSONDecoder(), 0
    texto = re.sub(r"</?tool_call>", "", texto).strip()
    while i < len(texto):
        if texto[i] in "{[":
            try:
                obj, fin = decoder.raw_decode(texto, i)
            except json.JSONDecodeError:
                return []
            for o in (obj if isinstance(obj, list) else [obj]):
                if isinstance(o, dict) and isinstance(o.get("name"), str):
                    args = o.get("parameters", o.get("arguments", {}))
                    if isinstance(args, str):
                        try:
                            args = json.loads(args)
                        except json.JSONDecodeError:
                            args = {}
                    llamadas.append({"function": {"name": o["name"], "arguments": args or {}}})
            i = fin
        elif texto[i] in " \n\t;,":
            i += 1
        else:
            return []  # hay texto normal mezclado: no era una llamada
    return llamadas


# ======================================================================
# Cerebro: orquesta un turno completo
# ======================================================================

@dataclass
class Respuesta:
    texto: str = ""
    idioma: str = "es"
    t_primera_frase: float | None = None   # s desde que llega tu mensaje hasta la 1ª frase
    t_total: float = 0.0
    herramientas: list = field(default_factory=list)  # [(nombre, args, resultado)]
    motor: str = "ollama"


class Cerebro:
    """Orquesta un turno: prompt -> Ollama -> herramientas -> respuesta.

    Dos formas de ofrecer herramientas al modelo (config llm.modo_herramientas):

      nativo  -> se pasan en el campo `tools` de la API y la plantilla del
                 modelo decide dónde meterlas. Ideal en qwen2.5, que las pone
                 en el system prompt (Ollama las cachea).
      prompt  -> las describimos nosotros en el system prompt y el modelo
                 contesta con una línea JSON. Necesario en llama3.x, cuya
                 plantilla reinyecta TODAS las herramientas en cada mensaje
                 (en CPU eso son ~15 s extra por turno) y además le empuja a
                 llamar a alguna siempre.
      auto    -> mira la plantilla del modelo y elige.
    """

    # Herramientas que, si fallan al usarse por atajo, dejan al LLM reintentar
    # (p. ej. "olvida lo de mi perro" cuando el recuerdo está en catalán).
    REINTENTABLES = {"olvidar"}

    def __init__(self, cfg: dict, ctx: Contexto, memoria=None, ollama: ClienteOllama | None = None):
        self.cfg = cfg
        self.ctx = ctx
        self.memoria = memoria
        self.ollama = ollama or ClienteOllama(cfg["llm"])
        self.max_rondas = cfg["llm"].get("max_rondas_herramientas", 4)
        self.n_turnos = cfg["memoria"].get("turnos_historial", 6)
        self.herramientas_activas: list[str] = [
            n for n in REGISTRO
            if memoria is not None or n not in ("recordar", "olvidar", "listar_recuerdos")]
        # Modo híbrido (fase 6): Claude para lo difícil, Ollama para lo demás
        self.claude = None
        if cfg["llm"].get("cerebro", "local") == "hibrido":
            from core.claude import ClienteClaude
            if ClienteClaude.disponible():
                self.claude = ClienteClaude(cfg)
            else:
                log.warning("cerebro: hibrido, pero no hay ANTHROPIC_API_KEY: todo irá en local.")
        if self.claude is None:
            self.herramientas_activas.remove("consultar_experto")
        self.prefijos_pensar = [idiomas.normalizar(p) for p in cfg["claude"].get("prefijos_pensar", [])]
        self.modo_herramientas = cfg["llm"].get("modo_herramientas", "auto")
        self.usar_atajos = cfg["llm"].get("atajos", True)
        self.usar_respuestas_rapidas = cfg["llm"].get("respuestas_rapidas", True)
        # Conversación reciente tal y como se envió a Ollama, agrupada por
        # turnos: [mensaje usuario, (llamadas y resultados)..., respuesta].
        # Incluir las llamadas a herramientas enseña al modelo, con ejemplos
        # reales, cómo se usan. Ver _guardar_turno.
        self._turnos: list[list[dict]] = []
        if memoria is not None:
            previos = memoria.historial(self.n_turnos)
            self._turnos = [previos[i:i + 2] for i in range(0, len(previos) - 1, 2)]

    def _ventana(self) -> list[dict]:
        return [m for turno in self._turnos for m in turno]

    # -- modo de herramientas ---------------------------------------------
    def decidir_modo_herramientas(self) -> str:
        if self.modo_herramientas == "auto":
            t = self.ollama.plantilla()
            pos_tools = max(t.find("range $.Tools"), t.find("range .Tools"))
            pos_mensajes = t.find(".Messages")
            # Si las herramientas se pintan DESPUÉS de empezar los mensajes,
            # van dentro del mensaje del usuario y no se pueden cachear.
            self.modo_herramientas = ("prompt" if pos_tools == -1 or pos_tools > pos_mensajes
                                      else "nativo")
        log.debug("Modo de herramientas: %s", self.modo_herramientas)
        return self.modo_herramientas

    def _tools_api(self) -> list[dict] | None:
        return esquemas(self.herramientas_activas) if self.modo_herramientas == "nativo" else None

    def _bloque_herramientas(self) -> str:
        if self.modo_herramientas != "prompt":
            return ""
        lineas = []
        for nombre in self.herramientas_activas:
            h = REGISTRO[nombre]
            params = []
            for p, esquema in h.parametros.items():
                opcional = "" if p in h.requeridos else "?"
                tipo = "|".join(esquema["enum"]) if "enum" in esquema else esquema.get("type", "")
                params.append(f"{p}{opcional}: {tipo}")
            lineas.append(f"- {nombre}({', '.join(params)}): {h.descripcion}")
        return BLOQUE_HERRAMIENTAS.format(lista="\n".join(lineas))

    # -- construcción del prompt ------------------------------------------
    def _bloque_recuerdos(self, consulta: str) -> str:
        if self.memoria is None:
            return ""
        recuerdos = self.memoria.recuerdos_relevantes(consulta)
        if not recuerdos:
            return ""
        nombre = self.cfg["usuario"].get("nombre", "señor")
        lineas = "\n".join(f'[{i}] {nombre}: "{t}"' for i, t in recuerdos)
        return BLOQUE_RECUERDOS.format(nombre=nombre, lineas=lineas)

    def _system(self) -> str:
        """System prompt. Con pocos recuerdos los metemos aquí todos: casi
        nunca cambian, así que Ollama puede reutilizar su caché. Con muchos,
        los relevantes cambian en cada mensaje y van en el mensaje del
        usuario (ver responder) para no invalidar la caché del system."""
        nombre = self.cfg["usuario"].get("nombre", "señor")
        recuerdos = ""
        if self.memoria is not None and not self.memoria.hay_muchos():
            recuerdos = self._bloque_recuerdos("")
        herramientas = self._bloque_herramientas()
        if self.claude is not None:
            herramientas += REGLA_EXPERTO.format()
        return SYSTEM_PROMPT.format(nombre=nombre, herramientas=herramientas, recuerdos=recuerdos)

    def _guardar_turno(self, turno: list[dict], usuario: str, jarvis: str) -> None:
        """Guarda el turno en disco (solo texto) y en la ventana (completo).

        Ventana por bloques: en vez de quedarnos siempre con los últimos N
        turnos exactos (lo que cambiaría el principio del historial en CADA
        turno y obligaría a Ollama a recalcularlo entero), dejamos crecer la
        ventana hasta 2N y entonces la recortamos a N de golpe. Así el
        prefijo es estable y la caché de Ollama se aprovecha casi siempre.
        """
        if self.memoria is not None:
            self.memoria.guardar_mensaje("user", usuario)
            self.memoria.guardar_mensaje("assistant", jarvis)
        self._turnos.append(turno + [{"role": "assistant", "content": jarvis}])
        if len(self._turnos) > 2 * self.n_turnos:
            self._turnos = self._turnos[-self.n_turnos:]

    def olvidar_conversacion(self) -> None:
        self._turnos = []

    # -- arranque -----------------------------------------------------------
    def precalentar(self) -> float:
        """Carga el modelo en RAM y deja calculado el principio del prompt
        (system + historial) para que el primer turno real sea rápido."""
        self.decidir_modo_herramientas()
        t0 = time.perf_counter()
        mensajes = [{"role": "system", "content": self._system()}, *self._ventana(),
                    {"role": "user", "content": "."}]
        for _ in self.ollama.chat(mensajes, self._tools_api(), num_predict=1):
            pass
        return time.perf_counter() - t0

    # -- un turno -------------------------------------------------------------
    def responder(self, texto: str, idioma: str,
                  on_frase: Callable[[str], None] | None = None) -> Respuesta:
        t0 = time.perf_counter()
        self.ctx.idioma = idioma
        res = Respuesta(idioma=idioma)
        textos_dichos: list[str] = []

        def emitir(frase: str) -> None:
            if res.t_primera_frase is None:
                res.t_primera_frase = time.perf_counter() - t0
            textos_dichos.append(frase)
            if on_frase:
                on_frase(frase)

        # Fecha y hora reales al FINAL del mensaje (no rompe la caché del
        # principio). Sin esto, un modelo pequeño se inventa la hora.
        instruccion = f"{idiomas.INSTRUCCION.get(idioma, '')} [{idiomas.ahora_texto(idioma)}]"
        # `turno` son los mensajes nuevos de este turno (se guardan en la ventana)
        turno = [{"role": "user", "content": f"{texto}\n{instruccion}"}]
        system = {"role": "system", "content": self._system()}
        previos = self._ventana()
        # Con muchos recuerdos, los relevantes para ESTE mensaje van delante
        # del texto del usuario (solo en la petición; no se guardan en la ventana)
        usuario_enviado = turno[0]
        if self.memoria is not None and self.memoria.hay_muchos():
            bloque = self._bloque_recuerdos(texto).strip()
            if bloque:
                usuario_enviado = {"role": "user", "content": f"{bloque}\n\n{turno[0]['content']}"}

        contestado_por_claude = False

        def ejecutar_llamadas(contenido: str, llamadas: list[dict]) -> None:
            nonlocal contestado_por_claude
            turno.append({"role": "assistant", "content": contenido, "tool_calls": llamadas})
            for ll in llamadas:
                nombre = ll["function"]["name"]
                args = ll["function"].get("arguments") or {}
                log.info("🔧 %s(%s)", nombre, json.dumps(args, ensure_ascii=False))
                if nombre == "consultar_experto" and self.claude is not None:
                    # El modelo local pide ayuda: Claude contesta directamente en voz alta
                    respuesta = self._preguntar_claude(args.get("pregunta") or texto, idioma,
                                                       instruccion, emitir, res)
                    contestado_por_claude = respuesta is not None
                    resultado = respuesta or "El experto no está disponible; responde tú."
                else:
                    resultado = ejecutar(nombre, args, self.ctx)
                log.info("   → %s", resultado)
                res.herramientas.append((nombre, args, resultado))
                # Repetimos la instrucción de idioma: los resultados vienen en
                # español y sin esto el modelo tiende a contestar en español.
                turno.append({"role": "tool", "content": f"{resultado}\n{instruccion}",
                              "tool_name": nombre})

        # 0) Modo híbrido: "piensa bien…" va directo a Claude
        primera_ronda = 0
        if self.claude is not None and self._pide_pensar(texto):
            if self._preguntar_claude(texto, idioma, instruccion, emitir, res) is not None:
                primera_ronda = self.max_rondas + 1  # contestado: no hace falta Ollama

        # 1) ¿Es una orden clara? Ejecutamos ya y el LLM solo redacta.
        atajo = (atajos.detectar(texto, self.cfg)
                 if self.usar_atajos and primera_ronda == 0 else None)
        if atajo and atajo[0] in self.herramientas_activas:
            log.debug("Atajo: %s %s", *atajo)
            ejecutar_llamadas("", [{"function": {"name": atajo[0], "arguments": atajo[1]}}])
            primera_ronda = self.max_rondas  # sin más herramientas: solo contestar
            nombre, args, resultado = res.herramientas[-1]
            frase = (respuestas.rapida(nombre, args, resultado, idioma, texto)
                     if self.usar_respuestas_rapidas else None)
            if frase:
                emitir(frase)
                primera_ronda = self.max_rondas + 1  # ni siquiera llamamos al LLM
            elif nombre in self.REINTENTABLES and resultado.startswith("NO "):
                primera_ronda = self.max_rondas - 1  # el LLM puede corregir con otra llamada

        # 2) Bucle normal LLM <-> herramientas
        llamadas_llm = 0
        for ronda in range(primera_ronda, self.max_rondas + 1):
            # En la última ronda no se admiten herramientas: obligamos a contestar
            permitir = ronda < self.max_rondas
            peticion = [system, *previos, usuario_enviado, *turno[1:]]
            contenido, llamadas = self._una_llamada(peticion, permitir, emitir)
            llamadas_llm += 1
            if not llamadas:
                break
            ejecutar_llamadas(contenido, llamadas)
            if contestado_por_claude:
                break

        res.texto = " ".join(textos_dichos).strip()
        if not res.texto:  # el modelo no dijo nada tras las herramientas
            res.texto = {"es": "Hecho, señor.", "ca": "Fet, senyor.", "en": "Done, sir."}.get(idioma, "Hecho.")
            emitir(res.texto)
        self._guardar_turno(turno, texto, res.texto)
        res.t_total = time.perf_counter() - t0
        if llamadas_llm == 0 or self._system() != system["content"]:
            # La caché de Ollama ya no coincide con la conversación: o este
            # turno se resolvió sin LLM (atajo + respuesta rápida) o cambió la
            # memoria y con ella el system prompt. La recalculamos en segundo
            # plano mientras Jarvis habla y tú piensas, en vez de hacerte
            # esperar en el siguiente turno.
            threading.Thread(target=self._precalentar_silencioso, daemon=True).start()
        return res

    # -- modo híbrido -------------------------------------------------------------
    def _pide_pensar(self, texto: str) -> bool:
        t = idiomas.normalizar(texto).lstrip("¿¡ ,")
        for prefijo in ("jarvis ", "jarvis, ", "hey jarvis "):
            t = t.removeprefix(prefijo)
        return any(t.startswith(p) for p in self.prefijos_pensar)

    def _preguntar_claude(self, pregunta: str, idioma: str, instruccion: str,
                          emitir: Callable[[str], None], res: Respuesta) -> str | None:
        """Pregunta a Claude y va diciendo su respuesta frase a frase.
        Devuelve el texto, o None si falló (y entonces sigue el modelo local)."""
        from core.claude import ErrorClaude

        nombre = self.cfg["usuario"].get("nombre", "señor")
        system = SYSTEM_PROMPT.format(nombre=nombre, herramientas="",
                                      recuerdos=self._bloque_recuerdos(pregunta))
        historial = self.memoria.historial(self.n_turnos) if self.memoria is not None else []
        mensajes = [*historial, {"role": "user", "content": f"{pregunta}\n{instruccion}"}]
        divisor = DivisorFrases()
        log.info("☁  Consultando a %s", self.claude.modelo)
        try:
            respuesta = self.claude.responder(
                system, mensajes, lambda trozo: [emitir(f) for f in divisor.alimentar(trozo)])
        except ErrorClaude as e:
            log.warning("Claude no disponible: %s", e)
            emitir({"es": "No consigo contactar con el experto, señor. Lo intento yo.",
                    "ca": "No aconsegueixo contactar amb l'expert, senyor. Ho intento jo.",
                    "en": "I can't reach the expert, sir. I'll try myself."}.get(idioma, ""))
            return None
        for frase in divisor.vaciar():
            emitir(frase)
        res.motor = "claude"
        return respuesta

    def _precalentar_silencioso(self) -> None:
        try:
            log.debug("Recalentando caché en segundo plano (%.1f s)", self.precalentar())
        except Exception as e:
            log.debug("No se pudo recalentar: %s", e)

    def _una_llamada(self, mensajes: list[dict], permitir_herramientas: bool,
                     emitir: Callable[[str], None]) -> tuple[str, list[dict]]:
        """Una petición a Ollama. Devuelve (texto completo, llamadas a herramientas)."""
        divisor = DivisorFrases()
        contenido, llamadas = "", []
        parece_json: bool | None = None  # ¿el texto empieza como una llamada JSON?
        tools = self._tools_api() if permitir_herramientas else None
        for trozo in self.ollama.chat(mensajes, tools):
            msg = trozo.get("message", {})
            llamadas.extend(msg.get("tool_calls") or [])
            delta = msg.get("content", "")
            if delta:
                contenido += delta
                if parece_json is None and contenido.strip():
                    parece_json = contenido.lstrip()[0] in "{[<"
                if parece_json is False:
                    for frase in divisor.alimentar(delta):
                        emitir(frase)
            if trozo.get("done"):
                self._log_metricas(trozo)

        if parece_json and not llamadas:
            # Lo retuvimos por si era una llamada escrita como JSON (modo prompt)
            extraidas = extraer_llamadas_en_texto(contenido)
            if extraidas:
                if permitir_herramientas:
                    return contenido, extraidas
                log.debug("Llamada ignorada en la última ronda: %s", contenido)
                return contenido, []  # nunca leemos JSON en voz alta
            for frase in divisor.alimentar(contenido):  # era texto normal
                emitir(frase)
        for frase in divisor.vaciar():
            emitir(frase)
        return contenido, llamadas

    @staticmethod
    def _log_metricas(t: dict) -> None:
        ns = 1e9
        pe, pd = t.get("prompt_eval_count", 0), t.get("prompt_eval_duration", 0) / ns
        ec, ed = t.get("eval_count", 0), t.get("eval_duration", 0) / ns
        log.debug("Ollama: prompt %d tok en %.2fs | genera %d tok en %.2fs (%.1f tok/s) | carga %.2fs",
                  pe, pd, ec, ed, ec / ed if ed else 0, t.get("load_duration", 0) / ns)
