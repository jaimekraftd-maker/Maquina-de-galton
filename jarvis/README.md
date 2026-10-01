# J.A.R.V.I.S.

Asistente de voz personal al estilo Iron Man que funciona **100 % en local** en Windows:
Ollama como cerebro, Whisper como oído, Piper como voz y openWakeWord para el "Hey Jarvis".
Habla español, catalán e inglés y contesta en el idioma en que le hables.

```
 micro ─► openWakeWord ─► VAD (Silero) ─► Whisper ─► Cerebro ─────────► Piper ─► altavoz
          "Hey Jarvis"    ¿has callado?   texto+idioma  │                frase a frase
                                                        ├─ atajos (reglas, instantáneo)
                                                        ├─ Ollama + herramientas
                                                        ├─ memoria (SQLite)
                                                        └─ Claude (opcional, modo híbrido)
```

---

## Instalación en Windows (paso a paso)

> **Atajo:** `instalar.bat` hace todos los pasos de abajo (instala Python 3.11 y Ollama con winget si faltan, descarga
> los modelos, crea el entorno y las voces), comprueba si Ollama usa la GPU (y ofrece activar Vulkan), revisa que las rutas
> de `apps` en `config.yaml` existan (`pruebas\comprobar_rutas.py`) y prueba las fases 1-7. Las pruebas usan una memoria
> aparte (`data\memoria_prueba.db`). Opciones: `instalar.bat -SinPruebas` o `instalar.bat -SoloPruebas`.

### 1. Programas base

1. **Python 3.11** desde <https://www.python.org/downloads/windows/>. Marca *Add python.exe to PATH*.
   En Windows usa `py -3.11` en vez de `python`; este último suele ser un acceso directo a la Microsoft Store.
2. **Ollama** desde <https://ollama.com/download>. Al instalarlo queda funcionando en segundo plano.
3. Descarga los modelos (unos 2,2 GB en total):

   ```bash
   ollama pull qwen2.5:3b
   ```
   ```bash
   ollama pull nomic-embed-text
   ```

   `qwen2.5:3b` es el recomendado (mejor en catalán y con herramientas). Si prefieres `llama3.2:3b`, también funciona.
   Cambia el modelo en `config.yaml` → `llm.modelo`. `nomic-embed-text` es opcional: sirve para elegir
   los recuerdos relevantes cuando hay muchos; sin él se buscan por palabras.

### 2. Entorno virtual (fuera de OneDrive)

El entorno ocupa más de 1 GB y tiene decenas de miles de archivos. Si lo pones dentro de OneDrive,
se sincronizará constantemente, así que lo creamos en tu carpeta de usuario:

```bash
py -3.11 -m venv %USERPROFILE%\.venvs\jarvis
```
```bash
%USERPROFILE%\.venvs\jarvis\Scripts\python.exe -m pip install -r requirements.txt
```

(Desde PowerShell, cambia `%USERPROFILE%` por `$env:USERPROFILE`.)

### 3. Voces de Piper (unos 150 MB)

Desde la carpeta `jarvis/`:

```bash
%USERPROFILE%\.venvs\jarvis\Scripts\python.exe -m piper.download_voices --download-dir data\voces es_ES-davefx-medium ca_ES-upc_pau-x_low en_GB-alan-medium
```

Whisper `small` (unos 480 MB) y los modelos de openWakeWord se descargan solos la primera vez.

### 4. ¿Usa Ollama la GPU? (RX 6500 XT)

Arranca Jarvis una vez y, en otra terminal, ejecuta:

```bash
ollama ps
```

- Si la columna `PROCESSOR` muestra **GPU**, todo correcto: la RX 6500 XT tiene 4 GB, y un modelo de 3B en Q4 cabe (unos 2,5 GB).
- Si muestra **100% CPU**: la RX 6500 XT (gfx1034) no está en la lista oficial de ROCm. Las versiones recientes de Ollama
  incluyen un motor **Vulkan** que sí funciona con muchas tarjetas AMD. Según la versión puede venir activado o necesitar
  la variable de entorno `OLLAMA_VULKAN=1`: añádela en *Variables de entorno de Windows*, cierra Ollama desde la bandeja
  del sistema, vuelve a abrirlo y comprueba de nuevo con `ollama ps`.
- Si sigue en CPU, funciona igual, pero tarda más. En ese caso, en `config.yaml` puedes cambiar `stt.modelo` a `base` para ganar velocidad.

### 5. Arrancar

```bash
jarvis.bat --text
```

| Comando | Qué hace |
|---|---|
| `jarvis.bat` | Modo voz: di **"Hey Jarvis"**, espera el pitido y habla |
| `jarvis.bat --hud` | Modo voz con la ventana del reactor animado (arrástrala; doble clic o Esc para cerrar) |
| `jarvis.bat --ptt` | Modo voz pulsando Enter en lugar de decir "Hey Jarvis" |
| `jarvis.bat --text` | Modo texto, sin micro |
| `jarvis.bat --text --tts` | Escribes tú y Jarvis contesta en voz alta |
| `--debug` (con cualquiera) | Muestra herramientas, tiempos de Ollama, de Whisper y de Piper |

Tras una respuesta tienes **6 segundos** para seguir hablando sin repetir "Hey Jarvis".
Para cortar antes, di "gracias Jarvis" o "adiós".

---

## Cómo probar cada fase

| Fase | Prueba | Qué deberías ver |
|---|---|---|
| 1. Texto + herramientas | `jarvis.bat --text --debug`, luego escribe "¿qué hora es?", "abre la calculadora" o "abre photoshop" | La hora real, que se abre la calculadora y que Photoshop se rechaza porque no está en la lista blanca |
| 2. Memoria | "Recuerda que mi color favorito es el azul", sal con `salir`, vuelve a entrar y pregunta "¿cuál es mi color favorito?" | Lo recuerda. "Olvida lo de mi color" pide confirmación |
| 3. Voz de salida | `jarvis.bat --text --tts`, escribe en es/ca/en | Cambia de voz según el idioma |
| 4. Voz de entrada | `python pruebas\prueba_stt.py`: un usuario sintético habla y Whisper transcribe. Con micro: `jarvis.bat --ptt` | Texto e idioma detectados, con tiempos |
| 5. Hey Jarvis | `python pruebas\prueba_voz.py`: guion completo sin micro (activación, seguimiento, confirmación de apagado con "no"). Con micro: `jarvis.bat` | Las latencias de cada turno |
| 6. Híbrido | Pon `llm.cerebro: hibrido`, define `ANTHROPIC_API_KEY` y di "piensa bien, ¿por qué el cielo es azul?" | `--debug` muestra "Consultando a claude-opus-5-5" |
| 7. HUD | `python pruebas\prueba_hud.py` (sin micro), o `jarvis.bat --hud` | El reactor cambia de color y de ritmo |

Ejecuta las pruebas con el Python del entorno (`%USERPROFILE%\.venvs\jarvis\Scripts\python.exe`) desde la carpeta `jarvis/`.

---

## Latencia (fin de tu voz → inicio de su respuesta)

Medida en el portátil de desarrollo (Intel Core 5 120U, sin GPU, **con batería**, `llama3.2:3b` y Whisper `small`).
En el PC gaming debería ir bastante más rápido, sobre todo si Ollama usa la GPU.

| Tipo de petición | Ejemplo | Tiempo |
|---|---|---|
| Orden con atajo, modo texto | "¿qué hora es?", "abre spotify" | **≈ 0,3 s** hasta oír la voz |
| Pregunta al LLM, modo texto | "capital de Australia" | 1,5–5 s |
| Cualquier cosa, modo voz | — | **≈ 6,8–8,4 s** = silencio 0,7 + **Whisper ≈ 4 s** + LLM 1,7–2,3 + Piper 0,2–0,4 |

El cuello de botella en CPU es Whisper. Opciones: `stt.modelo: base` (≈ 3 s, pero confunde más el catalán con el español)
o `stt.silencio_fin_ms` más bajo (corta antes, pero puede cortarte si haces pausas).

Con `--debug` cada turno imprime el desglose: `[silencio + STT + LLM + TTS]`.

---

## Estructura

```
jarvis/
  main.py              arranque y argumentos (--text, --tts, --ptt, --hud, --debug)
  config.yaml          modelo, voces, umbrales, lista blanca de programas
  jarvis.bat           lanzador
  core/
    llm.py             cliente Ollama + bucle de herramientas + enrutado a Claude
    personalidad.py    system prompt
    atajos.py          órdenes claras reconocidas con reglas (es/ca/en)
    respuestas.py      confirmaciones instantáneas para atajos sencillos
    memory.py          SQLite: recuerdos (+ embeddings) e historial
    idioma.py          detección es/ca/en en texto, "sí/no", fecha actual
    audio.py           micrófono, VAD Silero, grabar hasta que calles
    stt.py             faster-whisper
    tts.py             Piper: una voz por idioma, sintetiza y reproduce en paralelo
    wakeword.py        openWakeWord "hey_jarvis"
    asistente.py       bucle de voz (estados, seguimiento, confirmaciones por voz)
    claude.py          modo híbrido (opcional)
    hud.py             ventana PySide6 con el reactor (opcional)
  tools/               una herramienta por tema; base.py tiene el registro y la seguridad
  pruebas/             pruebas sin micro (usuario sintético con voces de Piper)
  data/                memoria.db, voces, capturas
```

### Añadir una herramienta

Crea `tools/mi_herramienta.py`:

```python
from tools.base import Contexto, herramienta

@herramienta(
    "nombre_corto",
    "Descripción que lee el modelo para decidir cuándo usarla.",
    {"ciudad": {"type": "string", "description": "Ciudad"}},
    requeridos=["ciudad"],
)
def nombre_corto(ctx: Contexto, ciudad: str) -> str:
    return f"Resultado en texto para el modelo sobre {ciudad}"
```

Después impórtala en `tools/__init__.py`. Si es peligrosa, añade su nombre a `herramientas.confirmar` en `config.yaml`
y pasa `confirmacion=funcion_que_devuelve_la_pregunta`. Si quieres que una orden concreta sea instantánea,
añade una regla en `core/atajos.py`.

---

## Decisiones de diseño (por qué está hecho así)

- **Herramientas "por prompt" con llama3.2.** La plantilla de llama3.2 mete todas las herramientas en *cada* mensaje (~1200 tokens).
  En CPU eso suponía unos 20 s por turno, y además le empujaba a usar herramientas para todo (a "hola" respondía mirando la hora).
  Con `modo_herramientas: auto`, Jarvis mira la plantilla del modelo: si las herramientas van en el system prompt (qwen2.5), usa
  el tool calling nativo de Ollama; si no, las describe él mismo en el system prompt, que Ollama sí cachea.
  Resultado: de unos 21 s a 1,5–3 s.
- **Caché de Ollama.** Ollama reutiliza el cálculo del principio de la conversación si no cambia. Por eso la fecha y la instrucción
  de idioma van al final del mensaje, el historial se recorta por bloques y, cuando algo invalida la caché (un recuerdo nuevo o un
  turno resuelto sin LLM), se recalcula en segundo plano mientras Jarvis habla.
- **Atajos + respuestas rápidas.** Los modelos de 3B a veces dicen "he subido el volumen" sin hacerlo. Las órdenes claras se
  reconocen con reglas, se ejecutan de verdad y se confirman con una frase de mayordomo al instante. Se desactivan en `config.yaml`.
- **Streaming de frases.** Piper empieza a hablar en cuanto el LLM termina la primera frase, y sintetiza la siguiente mientras suena la anterior.
- **Seguridad.** No hay ninguna herramienta de shell. Los programas solo se abren desde la lista blanca, con rutas escritas por ti.
  Las webs solo pueden ser http/https. Apagar, reiniciar y olvidar piden un "sí" explícito (por voz o por teclado);
  ante silencio o duda, la respuesta es "no". El apagado lleva 30 s de margen ("cancela el apagado").

## Limitaciones conocidas

- **"Hey Jarvis" hay que pronunciarlo a la inglesa** ("yárvis"). Con la jota española el modelo preentrenado no lo detecta (0,03 frente a 1,00 en las pruebas).
  Si te molesta, openWakeWord permite entrenar un modelo propio: <https://github.com/dscripka/openWakeWord#training-new-models>.
- Whisper a veces confunde catalán y español en frases cortas. Cuando duda, Jarvis usa su propio detector de texto como desempate.
- Un modelo de 3B tiene un límite: a veces mezcla idiomas o se equivoca con los recuerdos. qwen2.5:3b lo hace mejor que llama3.2:3b, y el modo híbrido cubre lo difícil.
- Mientras habla, Jarvis no te escucha (no se le puede interrumpir).

## Modo híbrido (opcional)

1. Consigue una clave en <https://platform.claude.com> y defínela como variable de entorno de Windows `ANTHROPIC_API_KEY`.
2. En `config.yaml`: `llm.cerebro: hibrido`.
3. Empieza la frase con **"piensa bien…"** ("pensa bé…", "think hard…") o haz una pregunta difícil:
   el modelo local la delega con la herramienta `consultar_experto`.

Usa `claude-opus-5-5` con esfuerzo `medium` (configurable en `claude.esfuerzo`) y el respaldo automático del servidor
(`fallbacks: "default"`) por si una petición fuese rechazada. Las órdenes rápidas nunca salen de tu PC.
Cada consulta tiene coste. Si no hay conexión o falla la clave, Jarvis avisa y responde en local.
