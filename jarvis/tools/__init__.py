"""Paquete de herramientas. Importar los módulos los registra en REGISTRO."""
from tools import apps, experto, memoria, multimedia, sistema, temporizador, web  # noqa: F401
from tools.base import REGISTRO, Contexto, ejecutar, esquemas  # noqa: F401
