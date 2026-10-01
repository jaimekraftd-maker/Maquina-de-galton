"""Cerebro remoto opcional: Claude (API de Anthropic) para lo difícil.

Solo se usa con `llm.cerebro: hibrido` en config.yaml y la variable de
entorno ANTHROPIC_API_KEY. Dos formas de llegar aquí (ver core/llm.py):

  1. Empiezas la frase con "piensa bien…" / "pensa bé…" / "think hard…".
  2. El modelo local decide que la pregunta le queda grande y llama a la
     herramienta `consultar_experto`.

Las órdenes rápidas (abrir apps, música, hora...) se quedan siempre en local.
Claude aquí no tiene herramientas: solo piensa y contesta con la misma
personalidad de Jarvis, y su respuesta se lee en voz alta frase a frase
en cuanto llega (streaming), igual que la de Ollama.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Callable

log = logging.getLogger("jarvis.claude")

# Añadido al system prompt: le pedimos que empiece a responder enseguida
# (es un asistente de voz) y que no prometa acciones que aquí no puede hacer.
_EXTRA_SYSTEM = """
Ahora mismo te consultan como experto para una pregunta difícil. No tienes herramientas en esta respuesta: si piden una acción en el PC, di que se la pida directamente a Jarvis.
Latency-sensitive voice assistant: begin your visible answer immediately. Aunque pienses a fondo, la respuesta hablada debe ser breve: 2 a 4 frases, sin listas ni markdown."""


class ErrorClaude(RuntimeError):
    pass


class ClienteClaude:
    def __init__(self, cfg: dict):
        c = cfg["claude"]
        self.modelo = c.get("modelo", "claude-opus-5-5")
        self.max_tokens = int(c.get("max_tokens", 4000))
        self.esfuerzo = c.get("esfuerzo", "medium")
        self._cliente = None

    @staticmethod
    def disponible() -> bool:
        return bool(os.environ.get("ANTHROPIC_API_KEY"))

    def _cliente_api(self):
        if self._cliente is None:
            import anthropic  # solo se importa si de verdad se usa Claude
            self._cliente = anthropic.Anthropic()  # lee ANTHROPIC_API_KEY del entorno
        return self._cliente

    def responder(self, system: str, mensajes: list[dict],
                  on_texto: Callable[[str], None]) -> str:
        """Pregunta a Claude en streaming. Llama a on_texto con cada trozo de
        texto según llega y devuelve la respuesta completa."""
        import anthropic

        t0 = time.perf_counter()
        try:
            with self._cliente_api().beta.messages.stream(
                model=self.modelo,
                max_tokens=self.max_tokens,       # incluye el pensamiento (adaptive)
                system=system + _EXTRA_SYSTEM,
                messages=mensajes,
                output_config={"effort": self.esfuerzo},
                # Si los filtros de seguridad rechazaran la pregunta, la API la
                # reintenta sola con el modelo de respaldo recomendado.
                betas=["server-side-fallback-2026-07-01"],
                fallbacks="default",
            ) as stream:
                partes = []
                for texto in stream.text_stream:
                    partes.append(texto)
                    on_texto(texto)
                final = stream.get_final_message()
        except anthropic.AuthenticationError as e:
            raise ErrorClaude("La clave ANTHROPIC_API_KEY no es válida.") from e
        except anthropic.RateLimitError as e:
            raise ErrorClaude("Claude está saturado (límite de uso); prueba en un rato.") from e
        except anthropic.APIStatusError as e:
            raise ErrorClaude(f"Error de la API de Claude ({e.status_code}): {e.message}") from e
        except anthropic.APIConnectionError as e:
            raise ErrorClaude("No hay conexión con la API de Claude.") from e

        if final.stop_reason == "refusal":
            log.info("Claude rechazó la pregunta (%s)", final.stop_details)
        u = final.usage
        log.debug("Claude %s: %d tok entrada, %d tok salida, %.1f s", final.model,
                  u.input_tokens, u.output_tokens, time.perf_counter() - t0)
        return "".join(partes)
