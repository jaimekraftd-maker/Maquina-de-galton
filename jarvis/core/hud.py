"""HUD: ventanita con un reactor animado que muestra el estado de Jarvis.

    python main.py --hud

  * El color y el giro del reactor dependen del estado:
      iniciando (gris) · esperando (azul tenue) · escuchando (cian, late con tu voz)
      pensando (ámbar, gira rápido) · hablando (blanco-cian, late con su voz)
  * Debajo, lo último que has dicho, lo que ha contestado y la latencia.
  * Se arrastra con el ratón; doble clic o Esc para cerrar.

Cómo encaja con el resto: Qt tiene que vivir en el hilo principal, así que
el bucle de voz corre en un hilo aparte y nos habla a través de señales de
Qt (`Puente`), que son la forma segura de cruzar hilos en Qt.
"""
from __future__ import annotations

import math
import threading
import time
from typing import Callable

from PySide6.QtCore import QObject, QPointF, QRectF, Qt, QTimer, Signal
from PySide6.QtGui import QColor, QFont, QPainter, QPen, QRadialGradient
from PySide6.QtWidgets import QApplication, QLabel, QVBoxLayout, QWidget

from core.asistente import Eventos

# Color (R, G, B) y velocidad de giro (grados por fotograma) de cada estado
ESTILO = {
    "iniciando": ((120, 125, 140), 0.4),
    "esperando": ((30, 150, 210), 0.5),
    "escuchando": ((70, 235, 255), 1.5),
    "pensando": ((255, 170, 40), 5.0),
    "hablando": ((170, 245, 255), 1.2),
    "error": ((255, 70, 70), 0.2),
}


class Puente(QObject):
    """Señales para pasar eventos del hilo de voz al hilo de la ventana."""
    estado = Signal(str)
    texto = Signal(str, str)
    latencia = Signal(str)
    cerrar = Signal()


class EventosHUD(Eventos):
    """Eventos que se imprimen en consola (como siempre) y además van al HUD."""

    def __init__(self, puente: Puente):
        self.puente = puente

    def estado(self, estado: str) -> None:
        super().estado(estado)
        self.puente.estado.emit(estado)

    def texto(self, quien: str, texto: str) -> None:
        super().texto(quien, texto)
        self.puente.texto.emit(quien, texto)

    def latencia(self, linea: str) -> None:
        super().latencia(linea)
        self.puente.latencia.emit(linea)


class Reactor(QWidget):
    """El reactor arc animado (todo dibujado con QPainter, sin imágenes)."""

    def __init__(self):
        super().__init__()
        self.setMinimumSize(300, 300)
        self.estado = "iniciando"
        self.color = list(ESTILO["iniciando"][0])   # color actual (se acerca al objetivo)
        self.fase = 0.0
        self.nivel = 0.0                            # volumen suavizado 0..1
        self.leer_nivel: Callable[[], float] = lambda: 0.0
        self._t0 = time.perf_counter()
        temporizador = QTimer(self)
        temporizador.timeout.connect(self._fotograma)
        temporizador.start(16)                      # ~60 fps

    def poner_estado(self, estado: str) -> None:
        self.estado = estado if estado in ESTILO else "esperando"

    def _fotograma(self) -> None:
        objetivo, velocidad = ESTILO[self.estado]
        # Transición suave de color y de nivel (filtro paso bajo)
        self.color = [c + (o - c) * 0.08 for c, o in zip(self.color, objetivo)]
        bruto = self.leer_nivel() if self.estado in ("escuchando", "hablando") else 0.0
        self.nivel += (bruto - self.nivel) * (0.35 if bruto > self.nivel else 0.08)
        self.fase = (self.fase + velocidad * (1 + self.nivel)) % 360
        self.update()

    def paintEvent(self, _evento) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        w, h = self.width(), self.height()
        c = QPointF(w / 2, h / 2)
        R = min(w, h) / 2 - 12
        r, g, b = (int(x) for x in self.color)
        t = time.perf_counter() - self._t0
        respiracion = 0.5 + 0.5 * math.sin(t * (1.2 if self.estado == "esperando" else 3.0))

        # Halo exterior
        halo = QRadialGradient(c, R)
        halo.setColorAt(0.55, QColor(r, g, b, int(40 + 50 * self.nivel)))
        halo.setColorAt(1.0, QColor(r, g, b, 0))
        p.setPen(Qt.NoPen)
        p.setBrush(halo)
        p.drawEllipse(c, R, R)

        # Anillo fino exterior
        p.setBrush(Qt.NoBrush)
        p.setPen(QPen(QColor(r, g, b, 150), 1.5))
        p.drawEllipse(c, R * 0.92, R * 0.92)

        # Anillo segmentado que gira (10 segmentos)
        radio = R * 0.80
        caja = QRectF(c.x() - radio, c.y() - radio, 2 * radio, 2 * radio)
        p.setPen(QPen(QColor(r, g, b, 220), R * 0.07, Qt.SolidLine, Qt.FlatCap))
        for i in range(10):
            inicio = self.fase + i * 36
            p.drawArc(caja, int(inicio * 16), int(24 * 16))

        # Anillo interior que gira al revés, con huecos
        radio = R * 0.62
        caja = QRectF(c.x() - radio, c.y() - radio, 2 * radio, 2 * radio)
        p.setPen(QPen(QColor(r, g, b, 160), R * 0.025, Qt.SolidLine, Qt.FlatCap))
        for i in range(3):
            p.drawArc(caja, int((-self.fase * 1.6 + i * 120) * 16), int(90 * 16))

        # Marcas radiales (como las bobinas del reactor)
        p.setPen(QPen(QColor(r, g, b, 120), 2))
        for i in range(24):
            ang = math.radians(i * 15 + self.fase * 0.25)
            a, b2 = R * 0.66, R * 0.72
            p.drawLine(QPointF(c.x() + a * math.cos(ang), c.y() + a * math.sin(ang)),
                       QPointF(c.x() + b2 * math.cos(ang), c.y() + b2 * math.sin(ang)))

        # Núcleo: late con la voz (tuya al escuchar, suya al hablar)
        nucleo = R * (0.32 + 0.06 * respiracion * (self.estado != "iniciando") + 0.14 * self.nivel)
        grad = QRadialGradient(c, nucleo)
        grad.setColorAt(0.0, QColor(255, 255, 255, 255))
        grad.setColorAt(0.35, QColor(r, g, b, 235))
        grad.setColorAt(1.0, QColor(r, g, b, 0))
        p.setPen(Qt.NoPen)
        p.setBrush(grad)
        p.drawEllipse(c, nucleo, nucleo)
        p.end()


class VentanaHUD(QWidget):
    def __init__(self, puente: Puente):
        super().__init__()
        self.setWindowTitle("J.A.R.V.I.S.")
        self.setWindowFlags(Qt.FramelessWindowHint | Qt.WindowStaysOnTopHint | Qt.Tool)
        self.setAttribute(Qt.WA_TranslucentBackground)
        self.resize(360, 520)
        self._arrastre = None

        self.reactor = Reactor()
        self.lbl_estado = self._etiqueta(13, "#7fdcff", negrita=True)
        self.lbl_usuario = self._etiqueta(11, "#9aa7b4")
        self.lbl_jarvis = self._etiqueta(12, "#e6fbff")
        self.lbl_latencia = self._etiqueta(9, "#5d7080")

        caja = QVBoxLayout(self)
        caja.setContentsMargins(18, 14, 18, 16)
        caja.addWidget(self.reactor, stretch=1)
        for lbl in (self.lbl_estado, self.lbl_usuario, self.lbl_jarvis, self.lbl_latencia):
            caja.addWidget(lbl)

        puente.estado.connect(self._estado)
        puente.texto.connect(self._texto)
        puente.latencia.connect(lambda linea: self.lbl_latencia.setText(linea.split("|")[0].strip()))
        puente.cerrar.connect(self.close)
        self._estado("iniciando")

    @staticmethod
    def _etiqueta(tam: int, color: str, negrita: bool = False) -> QLabel:
        lbl = QLabel("")
        lbl.setWordWrap(True)
        lbl.setAlignment(Qt.AlignCenter)
        fuente = QFont("Segoe UI", tam)
        fuente.setBold(negrita)
        if negrita:
            fuente.setLetterSpacing(QFont.AbsoluteSpacing, 4)
        lbl.setFont(fuente)
        lbl.setStyleSheet(f"color: {color}; background: transparent;")
        return lbl

    def _estado(self, estado: str) -> None:
        self.reactor.poner_estado(estado)
        self.lbl_estado.setText(estado.upper())
        r, g, b = ESTILO.get(estado, ESTILO["esperando"])[0]
        self.lbl_estado.setStyleSheet(f"color: rgb({r},{g},{b}); background: transparent;")

    def _texto(self, quien: str, texto: str) -> None:
        if quien == "usuario":
            self.lbl_usuario.setText(f"« {texto} »")
            self.lbl_jarvis.setText("")
        else:
            self.lbl_jarvis.setText(texto)

    def conectar_niveles(self, fuente, voz) -> None:
        """Le dice al reactor de dónde leer el volumen (micro o altavoz)."""
        self.reactor.leer_nivel = lambda: (voz.nivel() if self.reactor.estado == "hablando"
                                           else getattr(fuente, "nivel", 0.0))

    # -- fondo redondeado y arrastrar con el ratón ---------------------------
    def paintEvent(self, _evento) -> None:
        p = QPainter(self)
        p.setRenderHint(QPainter.Antialiasing)
        p.setPen(QPen(QColor(60, 180, 230, 90), 1))
        p.setBrush(QColor(6, 14, 22, 225))
        p.drawRoundedRect(self.rect().adjusted(1, 1, -1, -1), 22, 22)
        p.end()

    def mousePressEvent(self, e) -> None:
        if e.button() == Qt.LeftButton:
            self._arrastre = e.globalPosition().toPoint() - self.frameGeometry().topLeft()

    def mouseMoveEvent(self, e) -> None:
        if self._arrastre is not None and e.buttons() & Qt.LeftButton:
            self.move(e.globalPosition().toPoint() - self._arrastre)

    def mouseReleaseEvent(self, _e) -> None:
        self._arrastre = None

    def mouseDoubleClickEvent(self, _e) -> None:
        self.close()

    def keyPressEvent(self, e) -> None:
        if e.key() == Qt.Key_Escape:
            self.close()


def ejecutar_con_hud(preparar: Callable[[Eventos], object]) -> int:
    """Abre el HUD y arranca el asistente de voz en un hilo aparte.

    `preparar(eventos)` debe cargar todo y devolver un AsistenteVoz listo.
    """
    app = QApplication.instance() or QApplication([])
    puente = Puente()
    eventos = EventosHUD(puente)
    ventana = VentanaHUD(puente)
    ventana.show()
    estado: dict = {}

    def trabajador() -> None:
        eventos.estado("iniciando")
        try:
            asistente = preparar(eventos)
        except Exception as e:  # que el HUD muestre el error en vez de cerrarse sin más
            eventos.estado("error")
            eventos.texto("jarvis", f"Error al arrancar: {e}")
            return
        estado["asistente"] = asistente
        ventana.conectar_niveles(asistente.fuente, asistente.voz)
        asistente.ejecutar()
        puente.cerrar.emit()

    threading.Thread(target=trabajador, daemon=True, name="voz").start()
    app.exec()
    if "asistente" in estado:
        estado["asistente"].parar()
    return 0
