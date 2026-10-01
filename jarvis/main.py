"""JARVIS – asistente de voz local.

Uso:
    python main.py                   # modo voz completo ("Hey Jarvis")
    python main.py --hud             # modo voz + ventana con el reactor animado
    python main.py --ptt             # modo voz pulsando Enter en vez de "Hey Jarvis"
    python main.py --text            # modo texto (teclado), sin micro
    python main.py --text --tts      # escribes tú, pero Jarvis contesta en voz alta
    python main.py --debug           # muestra herramientas, tiempos y métricas de Ollama
"""
from __future__ import annotations

import argparse
import logging
import sys
import time

from core import idioma as idiomas
from core.config import cargar_config
from core.llm import Cerebro, ClienteOllama, ErrorOllama
from core.memory import Memoria
from tools import Contexto
from tools.apps import actualizar_descripcion

log = logging.getLogger("jarvis")

SALIR = {"salir", "adiós", "adios", "exit", "quit", "sortir", "adéu"}


def configurar_logs(debug: bool) -> None:
    logging.basicConfig(
        level=logging.DEBUG if debug else logging.WARNING,
        format="  %(asctime)s.%(msecs)03d [%(name)s] %(message)s",
        datefmt="%H:%M:%S",
    )
    # Estas librerías son muy habladoras en DEBUG
    for ruidosa in ("urllib3", "faster_whisper", "PIL", "httpx", "httpcore", "anthropic", "piper"):
        logging.getLogger(ruidosa).setLevel(logging.WARNING)
    if debug:
        logging.getLogger("jarvis").setLevel(logging.DEBUG)


def construir(cfg: dict) -> tuple[Contexto, Cerebro]:
    """Crea las piezas y las conecta: Ollama -> memoria -> herramientas -> cerebro."""
    actualizar_descripcion(cfg)          # la lista blanca real, visible para el LLM
    ollama = ClienteOllama(cfg["llm"])
    memoria = Memoria(cfg, ollama)
    ctx = Contexto(cfg=cfg, memoria=memoria)
    cerebro = Cerebro(cfg, ctx, memoria, ollama)
    return ctx, cerebro


def crear_voz(cfg: dict, on_estado=None):
    """Carga Piper (en segundo plano las voces que no son la principal)."""
    from core.tts import Voz
    voz = Voz(cfg, on_estado=on_estado)
    t0 = time.perf_counter()
    print("Cargando voces de Piper…", flush=True)
    voz.cargar(idioma_primero="es")
    log.debug("Voz principal lista en %.1f s", time.perf_counter() - t0)
    return voz


# ----------------------------------------------------------------------
# Modo texto
# ----------------------------------------------------------------------

def modo_texto(cfg: dict, ctx: Contexto, cerebro: Cerebro, voz=None) -> None:
    from core.tts import elegir_idioma

    def avisar(texto: str, idioma: str) -> None:
        print(f"\n⏰ JARVIS: {texto}\nTú: ", end="", flush=True)
        if voz:
            voz.decir(texto, idioma)

    def confirmar(pregunta: str, idioma: str) -> bool:
        print(f"\nJARVIS: {pregunta}")
        if voz:
            voz.esperar()
            voz.decir(pregunta, idioma)
        return idiomas.es_afirmativo(input("Tú (sí/no): "))

    ctx.avisar, ctx.confirmar = avisar, confirmar

    print("JARVIS en modo texto. Escribe 'salir' para terminar.")
    idioma = "es"
    while True:
        try:
            texto = input("\nTú: ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not texto:
            continue
        if texto.lower() in SALIR:
            break
        idioma = idiomas.detectar(texto, por_defecto=idioma)

        def on_frase(frase: str) -> None:
            print(frase, end=" ", flush=True)
            if voz:
                voz.decir(frase, elegir_idioma(frase, idioma))

        print("JARVIS: ", end="", flush=True)
        t0 = time.perf_counter()
        if voz:
            voz.marcar()
        try:
            res = cerebro.responder(texto, idioma, on_frase=on_frase)
        except ErrorOllama as e:
            print(f"\n[error] {e}")
            continue
        print()
        t_audio = None
        if voz:
            voz.esperar()
            t_audio = voz.t_primer_audio - t0 if voz.t_primer_audio else None
        mostrar_latencia(res, t_audio)

    if voz:
        voz.decir("A su servicio, señor.", "es")
        voz.esperar()
    print("\nJARVIS: A su servicio, señor.")


def mostrar_latencia(res, t_audio: float | None = None, t_stt: float | None = None) -> None:
    """Imprime los tiempos del turno.

    t_stt   = de que terminas de hablar a tener el texto (solo modo voz)
    1ª frase = de tener tu texto a tener la primera frase de la respuesta
    audio   = de que terminas (de hablar o de pulsar Enter) a oír a Jarvis
    """
    herramientas = ", ".join(n for n, _, _ in res.herramientas) or "ninguna"
    partes = []
    if t_stt is not None:
        partes.append(f"STT: {t_stt * 1000:.0f} ms")
    partes.append(f"1ª frase: {res.t_primera_frase * 1000:.0f} ms" if res.t_primera_frase else "1ª frase: -")
    if t_audio is not None:
        partes.append(f"🔊 hasta oír la voz: {t_audio * 1000:.0f} ms")
    partes.append(f"total LLM: {res.t_total * 1000:.0f} ms")
    print(f"   ⏱  {' | '.join(partes)} | {res.motor} | idioma: {res.idioma} | herramientas: {herramientas}")


# ----------------------------------------------------------------------

def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):  # tildes y emojis en la consola de Windows
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stdin.reconfigure(encoding="utf-8")

    ap = argparse.ArgumentParser(description="JARVIS, asistente de voz local")
    ap.add_argument("--text", action="store_true", help="modo texto (sin micrófono)")
    ap.add_argument("--tts", action="store_true", help="en modo texto, contestar también en voz alta")
    ap.add_argument("--ptt", action="store_true",
                    help="modo voz sin palabra de activación: pulsa Enter para hablar")
    ap.add_argument("--hud", action="store_true", help="modo voz con la ventana del reactor animado")
    ap.add_argument("--debug", action="store_true", help="muestra detalles internos y tiempos")
    ap.add_argument("--config", default="config.yaml", help="archivo de configuración")
    args = ap.parse_args()

    configurar_logs(args.debug)
    cfg = cargar_config(args.config)
    ctx, cerebro = construir(cfg)

    try:
        cerebro.ollama.comprobar()
        print(f"Cargando {cerebro.ollama.modelo} en Ollama…", flush=True)
        print(f"Modelo listo en {cerebro.precalentar():.1f} s "
              f"(herramientas en modo '{cerebro.modo_herramientas}').")
    except ErrorOllama as e:
        print(f"[error] {e}")
        return 1

    if args.text:
        voz = crear_voz(cfg) if args.tts and cfg["tts"].get("activado", True) else None
        modo_texto(cfg, ctx, cerebro, voz)
        return 0

    activacion = "enter" if args.ptt else "wakeword"
    if args.hud:
        return modo_hud(cfg, ctx, cerebro, activacion)
    return modo_voz(cfg, ctx, cerebro, activacion)


# ----------------------------------------------------------------------
# Modo voz
# ----------------------------------------------------------------------

def preparar_voz(cfg: dict, ctx: Contexto, cerebro: Cerebro, activacion: str, eventos=None):
    """Carga Whisper, Piper, el micro y (si toca) openWakeWord. Devuelve el AsistenteVoz."""
    import threading

    from core.asistente import AsistenteVoz
    from core.audio import Microfono
    from core.stt import Transcriptor

    # Whisper y Piper tardan en cargar: los cargamos a la vez
    print("Cargando Whisper y las voces…", flush=True)
    t0 = time.perf_counter()
    stt_listo: dict = {}

    def cargar_stt():
        stt_listo["stt"] = Transcriptor(cfg)
        stt_listo["stt"].precalentar()

    hilo = threading.Thread(target=cargar_stt, daemon=True)
    hilo.start()
    voz = crear_voz(cfg)
    hilo.join()
    print(f"Voz y oído listos en {time.perf_counter() - t0:.1f} s.")

    fuente = Microfono(cfg["audio"].get("dispositivo_entrada"))
    asistente = AsistenteVoz(cfg, ctx, cerebro, voz, stt_listo["stt"], fuente,
                             activacion=activacion, eventos=eventos)
    if activacion == "wakeword":
        print('Di "Hey Jarvis" para empezar. Ctrl+C para salir.')
    voz.decir("Sistemas en línea. A su servicio, señor.", "es")
    voz.esperar()
    return asistente


def modo_voz(cfg: dict, ctx: Contexto, cerebro: Cerebro, activacion: str) -> int:
    asistente = preparar_voz(cfg, ctx, cerebro, activacion)
    try:
        asistente.ejecutar()
    except KeyboardInterrupt:
        pass
    asistente.voz.decir("Hasta luego, señor.", "es")
    asistente.voz.esperar()
    return 0


def modo_hud(cfg: dict, ctx: Contexto, cerebro: Cerebro, activacion: str) -> int:
    from core.hud import ejecutar_con_hud
    return ejecutar_con_hud(lambda eventos: preparar_voz(cfg, ctx, cerebro, activacion, eventos))


if __name__ == "__main__":
    sys.exit(main())
