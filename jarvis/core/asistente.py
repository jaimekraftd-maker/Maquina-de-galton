"""Bucle de voz de Jarvis: activación -> escucha -> transcribe -> piensa -> habla.

    ┌─────────────┐ "Hey Jarvis" ┌───────────┐ silencio ┌──────────┐
    │  ESPERANDO  │ ───────────> │ ESCUCHANDO│ ───────> │ PENSANDO │──┐
    └─────────────┘   (pitido)   └───────────┘          └──────────┘  │
           ^                         ^   │ nada en N s                 │ 1ª frase
           │                         │   v                             v
           └──── fin del seguimiento ┴── (vuelve a esperar) <──── HABLANDO
                                     │                                 │
                                     └────── seguimiento (sin palabra) ┘

Mientras Jarvis habla el micro está "silenciado" (descartamos lo que
entra) para que no se escuche a sí mismo. Al terminar, durante
`wakeword.seguimiento_s` segundos puedes seguir hablando sin decir
"Hey Jarvis".
"""
from __future__ import annotations

import logging
import threading
import time

from core import idioma as idiomas
from core.audio import DetectorVoz, grabar_frase
from core.tts import elegir_idioma

log = logging.getLogger("jarvis.voz")

DESPEDIDAS = {"adios", "adios jarvis", "gracias jarvis", "eso es todo", "nada mas", "adeu", "adeu jarvis",
              "res mes", "gracies jarvis", "that's all", "thats all", "thank you jarvis", "goodbye",
              "bye jarvis"}


class Eventos:
    """Lo que el bucle de voz cuenta hacia fuera. Por defecto, a la consola;
    el HUD (fase 7) hereda de aquí para dibujarlo."""

    _ultimo = None

    def estado(self, estado: str) -> None:       # esperando | escuchando | pensando | hablando
        if estado == self._ultimo:
            return
        self._ultimo = estado
        iconos = {"esperando": "💤", "escuchando": "👂", "pensando": "🧠", "hablando": "🗣"}
        print(f"{iconos.get(estado, '·')} {estado}…", flush=True)

    def texto(self, quien: str, texto: str) -> None:  # quien: usuario | jarvis
        print(f"{'Tú' if quien == 'usuario' else 'JARVIS'}: {texto}", flush=True)

    def latencia(self, linea: str) -> None:
        print(f"   ⏱  {linea}", flush=True)


class AsistenteVoz:
    def __init__(self, cfg: dict, ctx, cerebro, voz, stt, fuente,
                 activacion: str = "wakeword", eventos: Eventos | None = None):
        self.cfg = cfg
        self.ctx = ctx
        self.cerebro = cerebro
        self.voz = voz
        self.stt = stt
        self.fuente = fuente
        self.activacion = activacion            # "wakeword" o "enter" (pulsar para hablar)
        self.eventos = eventos or Eventos()
        self.vad = DetectorVoz()
        self.wake = None
        if activacion == "wakeword":
            from core.wakeword import DetectorActivacion
            self.wake = DetectorActivacion(cfg)
        self.idioma = "es"
        self._hubo_confirmacion = False
        self._parar = threading.Event()
        # La voz nos avisa cuando empieza a sonar algo
        voz.on_estado = lambda sonando: self.eventos.estado("hablando") if sonando else None
        # Las herramientas hablan y preguntan a través de nosotros
        ctx.avisar = self._avisar
        ctx.confirmar = self._confirmar

    # ------------------------------------------------------------------
    def parar(self) -> None:
        self._parar.set()

    def ejecutar(self) -> None:
        self.fuente.iniciar()
        try:
            self.eventos.estado("esperando")
            while not self._parar.is_set():
                if self.activacion == "enter":
                    input("\n[Enter] para hablar (Ctrl+C para salir) ")
                    self._activado()
                    continue
                bloque = self.fuente.leer(timeout=0.5)
                if bloque is None:
                    continue
                if self.voz.hablando:          # p. ej. el aviso de un temporizador
                    self.wake.reiniciar()
                    continue
                if self.wake.procesar(bloque):
                    self._activado()
        finally:
            self.fuente.detener()

    # ------------------------------------------------------------------
    def _activado(self) -> None:
        """Tras 'Hey Jarvis': pitido y conversación con seguimiento."""
        # No vaciamos el micro tras el pitido: si dices "Hey Jarvis, ¿qué hora
        # es?" de un tirón, lo que va detrás de "Jarvis" ya está en la cola.
        self.voz.pitido()
        espera = self.cfg["audio"].get("espera_inicio_s", 5)
        while not self._parar.is_set():
            self.eventos.estado("escuchando")
            r = grabar_frase(self.fuente, self.vad, self.cfg["audio"], espera_inicio_s=espera)
            if r is None or not self._turno(*r):
                break
            espera = self.cfg["wakeword"].get("seguimiento_s", 6)  # modo seguimiento
        if self.wake:
            self.wake.reiniciar()
        self.eventos.estado("esperando")

    def _turno(self, audio, t_fin_voz: float) -> bool:
        """Un turno completo. Devuelve False si hay que dejar de escuchar."""
        t_vad = time.perf_counter()               # momento en que el VAD dio la frase por acabada
        self.eventos.estado("pensando")
        tr = self.stt.transcribir(audio)
        if not tr.texto:
            log.debug("No he entendido nada")
            return False
        self.eventos.texto("usuario", tr.texto)
        self.idioma = tr.idioma

        if idiomas.normalizar(tr.texto).strip(" .!?¡¿,") in DESPEDIDAS:
            despedida = {"es": "A su servicio, señor.", "ca": "A les seves ordres, senyor.",
                         "en": "At your service, sir."}[tr.idioma if tr.idioma in ("es", "ca", "en") else "es"]
            self._decir_y_esperar(despedida, tr.idioma)
            return False

        frases: list[str] = []

        def on_frase(frase: str) -> None:
            frases.append(frase)
            self.voz.decir(frase, elegir_idioma(frase, tr.idioma))

        self.voz.marcar()
        self._hubo_confirmacion = False
        self.fuente.silenciado = True               # no escucharnos a nosotros mismos
        try:
            res = self.cerebro.responder(tr.texto, tr.idioma, on_frase=on_frase)
            self.eventos.texto("jarvis", res.texto)
            self.voz.esperar()
        finally:
            self.fuente.silenciado = False
            self.fuente.vaciar()

        # --- latencia: de fin de tu voz a inicio de su respuesta ---------------
        if self._hubo_confirmacion:
            pass  # el turno incluyó una pregunta tuya: el desglose no tendría sentido
        elif self.voz.t_primer_audio:
            total = self.voz.t_primer_audio - t_fin_voz
            llm = res.t_primera_frase or 0
            tts = total - (t_vad - t_fin_voz) - tr.segundos - llm
            herramientas = ", ".join(n for n, _, _ in res.herramientas) or "—"
            self.eventos.latencia(
                f"fin de tu voz → su voz: {total * 1000:.0f} ms  "
                f"[silencio {1000 * (t_vad - t_fin_voz):.0f} + STT {tr.segundos * 1000:.0f} + "
                f"LLM {llm * 1000:.0f} + TTS {max(tts, 0) * 1000:.0f}] | "
                f"{tr.idioma} ({tr.prob_idioma:.2f}) | {res.motor} | herramientas: {herramientas}")
        return True

    # ------------------------------------------------------------------
    # Lo que usan las herramientas
    # ------------------------------------------------------------------
    def _decir_y_esperar(self, texto: str, idioma: str) -> None:
        silenciado = self.fuente.silenciado
        self.fuente.silenciado = True
        self.eventos.texto("jarvis", texto)
        self.voz.decir(texto, idioma)
        self.voz.esperar()
        self.fuente.silenciado = silenciado
        self.fuente.vaciar()

    def _avisar(self, texto: str, idioma: str) -> None:
        """Avisos espontáneos (temporizadores). Llegan desde otro hilo."""
        self.eventos.texto("jarvis", f"⏰ {texto}")
        self.voz.decir(texto, idioma)

    def _confirmar(self, pregunta: str, idioma: str) -> bool:
        """Pregunta sí/no por voz. Ante silencio o duda, la respuesta es NO."""
        self._hubo_confirmacion = True
        self.voz.esperar()                     # que termine lo que estuviera diciendo
        self._decir_y_esperar(pregunta, idioma)
        self.voz.pitido(frecuencia=660)
        self.fuente.silenciado = False
        self.fuente.vaciar()
        self.eventos.estado("escuchando")
        r = grabar_frase(self.fuente, self.vad, self.cfg["audio"], espera_inicio_s=6)
        self.fuente.silenciado = True
        if r is None:
            return False
        respuesta = self.stt.transcribir(r[0]).texto
        self.eventos.texto("usuario", respuesta or "(nada)")
        self.eventos.estado("pensando")
        return idiomas.es_afirmativo(respuesta)
