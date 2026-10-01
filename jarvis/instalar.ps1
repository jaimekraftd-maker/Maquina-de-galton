# ============================================================
#  Instalador de JARVIS para Windows (sigue el README paso a paso)
#
#  Uso (desde la carpeta jarvis\):
#     instalar.bat                  instala todo y prueba las fases
#     instalar.bat -SinPruebas      solo instala y comprueba GPU y rutas
#     instalar.bat -SoloPruebas     no instala nada, solo prueba
#
#  Se puede repetir sin miedo: lo que ya está hecho se salta.
# ============================================================
param(
    [switch]$SinPruebas,
    [switch]$SoloPruebas
)

$ErrorActionPreference = 'Continue'
Set-Location $PSScriptRoot
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
$OutputEncoding = New-Object System.Text.UTF8Encoding $false
$env:PYTHONIOENCODING = 'utf-8'

$Modelo      = 'qwen2.5:3b'
$ModeloEmbed = 'nomic-embed-text'
$Voces       = 'es_ES-davefx-medium', 'ca_ES-upc_pau-x_low', 'en_GB-alan-medium'
$Venv        = Join-Path $env:USERPROFILE '.venvs\jarvis'
$Py          = Join-Path $Venv 'Scripts\python.exe'
$UrlOllama   = 'http://localhost:11434'
$Resultados  = [ordered]@{}

function Paso($texto)  { Write-Host "`n=== $texto ===" -ForegroundColor Cyan }
function Bien($texto)  { Write-Host "  OK  $texto" -ForegroundColor Green }
function Aviso($texto) { Write-Host "  !!  $texto" -ForegroundColor Yellow }
function Fallo($texto) { Write-Host "  XX  $texto" -ForegroundColor Red }

function Actualizar-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' +
                [Environment]::GetEnvironmentVariable('Path', 'User')
}

function Tiene-Python311 {
    if (-not (Get-Command py -ErrorAction SilentlyContinue)) { return $false }
    & py -3.11 --version *> $null
    return $LASTEXITCODE -eq 0
}

function Ollama-Responde {
    try { Invoke-RestMethod "$UrlOllama/api/tags" -TimeoutSec 3 | Out-Null; return $true }
    catch { return $false }
}

function Esperar-Ollama([int]$segundos = 40) {
    for ($i = 0; $i -lt $segundos; $i++) {
        if (Ollama-Responde) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Arrancar-Ollama {
    $app = Join-Path $env:LOCALAPPDATA 'Programs\Ollama\ollama app.exe'
    if (Test-Path $app) { Start-Process $app } else { Start-Process ollama -ArgumentList 'serve' -WindowStyle Hidden }
}

function Reiniciar-Ollama {
    Get-Process 'ollama app', 'ollama' -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Seconds 2
    Arrancar-Ollama
    Esperar-Ollama | Out-Null
}

# Carga el modelo en Ollama y devuelve el % que está en la GPU (0 = todo CPU)
function Porcentaje-GPU {
    $cuerpo = @{ model = $Modelo; prompt = ''; keep_alive = '10m' } | ConvertTo-Json
    try { Invoke-RestMethod "$UrlOllama/api/generate" -Method Post -Body $cuerpo -ContentType 'application/json' -TimeoutSec 180 | Out-Null }
    catch { Fallo "No he podido cargar $Modelo en Ollama: $_"; return -1 }
    & ollama ps | Out-Host
    $m = (Invoke-RestMethod "$UrlOllama/api/ps").models | Where-Object { $_.name -eq $Modelo } | Select-Object -First 1
    if (-not $m -or -not $m.size) { return 0 }
    return [math]::Round(100 * $m.size_vram / $m.size)
}

# Copia de config.yaml para las pruebas: memoria aparte para no ensuciar la tuya
function Config-Prueba([string]$cerebro = 'local') {
    $texto = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'config.yaml'))
    $texto = $texto -replace 'ruta_db: data/memoria\.db', 'ruta_db: data/memoria_prueba.db'
    $texto = $texto -replace '(?m)^(\s*)cerebro: local', "`$1cerebro: $cerebro"
    $archivo = Join-Path $PSScriptRoot 'config_prueba.yaml'
    [IO.File]::WriteAllText($archivo, $texto, (New-Object System.Text.UTF8Encoding $false))
    return 'config_prueba.yaml'
}

# Escribe las líneas en el modo texto de Jarvis, como si las tecleases tú
function Hablar-Texto([string[]]$lineas, [string[]]$extra = @(), [string]$config = 'config_prueba.yaml') {
    ($lineas + 'salir') | & $Py main.py --text @extra --config $config | Tee-Object -Variable capturado | Out-Host
    return @{ codigo = $LASTEXITCODE; texto = ($capturado -join "`n") }
}

if (-not $SoloPruebas) {
    # --------------------------------------------------------
    Paso '1. Programas base (Python 3.11 y Ollama)'
    # --------------------------------------------------------
    if (-not (Tiene-Python311)) {
        Aviso 'Python 3.11 no está. Lo instalo con winget…'
        winget install -e --id Python.Python.3.11 --accept-package-agreements --accept-source-agreements
        Actualizar-Path
        if (-not (Tiene-Python311)) { Fallo 'Instala Python 3.11 a mano (https://www.python.org/downloads/windows/) y vuelve a ejecutar.'; exit 1 }
    }
    Bien 'Python 3.11'

    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        Aviso 'Ollama no está. Lo instalo con winget…'
        winget install -e --id Ollama.Ollama --accept-package-agreements --accept-source-agreements
        Actualizar-Path
        if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) { Fallo 'Instala Ollama a mano (https://ollama.com/download) y vuelve a ejecutar.'; exit 1 }
    }
    if (-not (Ollama-Responde)) { Arrancar-Ollama }
    if (-not (Esperar-Ollama)) { Fallo "Ollama no responde en $UrlOllama. Ábrelo desde el menú Inicio y repite."; exit 1 }
    & ollama --version | Out-Host
    Bien 'Ollama en marcha'

    foreach ($m in $Modelo, $ModeloEmbed) {
        Write-Host "  Descargando $m…"
        & ollama pull $m
        if ($LASTEXITCODE -ne 0) { Fallo "No se pudo descargar $m"; exit 1 }
    }
    Bien "Modelos $Modelo y $ModeloEmbed"

    # --------------------------------------------------------
    Paso '2. Entorno virtual (fuera de OneDrive)'
    # --------------------------------------------------------
    if (-not (Test-Path $Py)) {
        New-Item -ItemType Directory -Force (Split-Path $Venv) | Out-Null
        & py -3.11 -m venv $Venv
    }
    & $Py -m pip install --upgrade pip --quiet
    & $Py -m pip install -r requirements.txt
    if ($LASTEXITCODE -ne 0) { Fallo 'Falló pip install -r requirements.txt'; exit 1 }
    Bien "Entorno en $Venv"

    # --------------------------------------------------------
    Paso '3. Voces de Piper'
    # --------------------------------------------------------
    $faltan = $Voces | Where-Object { -not (Test-Path "data\voces\$_.onnx") }
    if ($faltan) {
        & $Py -m piper.download_voices --download-dir data\voces @faltan
        if ($LASTEXITCODE -ne 0) { Fallo 'No se pudieron descargar las voces'; exit 1 }
    }
    Bien "Voces: $($Voces -join ', ')"
}

if (-not (Test-Path $Py)) { Fallo "No existe $Py. Ejecuta primero la instalación (sin -SoloPruebas)."; exit 1 }
if (-not (Ollama-Responde)) { Arrancar-Ollama; Esperar-Ollama | Out-Null }

# ------------------------------------------------------------
Paso '4. ¿Usa Ollama la GPU? (RX 6500 XT)'
# ------------------------------------------------------------
$gpu = Porcentaje-GPU
if ($gpu -eq 0 -and [Environment]::GetEnvironmentVariable('OLLAMA_VULKAN', 'User') -ne '1') {
    Aviso 'Ollama está en 100% CPU. La RX 6500 XT (gfx1034) no está en ROCm, pero suele ir con Vulkan.'
    $r = Read-Host '  ¿Activo OLLAMA_VULKAN=1 y reinicio Ollama? (s/n)'
    if ($r -match '^s') {
        [Environment]::SetEnvironmentVariable('OLLAMA_VULKAN', '1', 'User')
        $env:OLLAMA_VULKAN = '1'
        Reiniciar-Ollama
        $gpu = Porcentaje-GPU
    }
}
if ($gpu -ge 100)   { Bien 'El modelo está entero en la GPU.'; $Resultados['GPU'] = "100% GPU" }
elseif ($gpu -gt 0) { Aviso "Solo el $gpu% está en la GPU (el resto en CPU). Va, pero más lento."; $Resultados['GPU'] = "$gpu% GPU" }
elseif ($gpu -eq 0) {
    Aviso 'Sigue en CPU. Funciona igual, pero más lento. Para ganar velocidad pon stt.modelo: base en config.yaml.'
    $Resultados['GPU'] = '100% CPU'
} else { $Resultados['GPU'] = 'error' }

# ------------------------------------------------------------
Paso '5. Rutas de las apps de config.yaml'
# ------------------------------------------------------------
& $Py pruebas\comprobar_rutas.py
$Resultados['Rutas apps'] = if ($LASTEXITCODE -eq 0) { 'OK' } else { 'faltan apps (ver arriba)' }

if ($SinPruebas) { $Resultados | Format-Table -AutoSize; exit 0 }

# ------------------------------------------------------------
Paso 'Fase 1. Texto + herramientas'
# ------------------------------------------------------------
$cfg = Config-Prueba
Remove-Item data\memoria_prueba.db -ErrorAction SilentlyContinue
$r = Hablar-Texto @('¿qué hora es?', 'abre la calculadora', 'abre photoshop') @('--debug') $cfg
$hora = $r.texto -match '\d{1,2}:\d{2}'
$Resultados['1 Texto + herramientas'] = if ($r.codigo -eq 0 -and $hora) { 'OK (mira que se abrió la calculadora y Photoshop se rechazó)' } else { "REVISAR (código $($r.codigo))" }

# ------------------------------------------------------------
Paso 'Fase 2. Memoria (en data\memoria_prueba.db, no toca la tuya)'
# ------------------------------------------------------------
$r1 = Hablar-Texto @('Recuerda que mi color favorito es el azul') @() $cfg
$r2 = Hablar-Texto @('¿cuál es mi color favorito?', 'Olvida lo de mi color', 'no') @() $cfg
$Resultados['2 Memoria'] = if ($r2.texto -match 'azul') { 'OK (lo recuerda tras reiniciar)' } else { 'REVISAR: no ha dicho "azul"' }

# ------------------------------------------------------------
Paso 'Fase 3. Voz de salida (sube el volumen)'
# ------------------------------------------------------------
$r = Hablar-Texto @('Hola, ¿cómo estás?', 'Bon dia, com estàs?', 'Hello, how are you?') @('--tts') $cfg
$Resultados['3 Voz de salida'] = if ($r.codigo -eq 0) { 'OK (¿cambió la voz en cada idioma?)' } else { "FALLO (código $($r.codigo))" }

# ------------------------------------------------------------
Paso 'Fase 4. Voz de entrada (Whisper, sin micro)'
# ------------------------------------------------------------
& $Py pruebas\prueba_stt.py
$Resultados['4 Voz de entrada'] = if ($LASTEXITCODE -eq 0) { 'OK (mira "Idioma correcto en N/6")' } else { "FALLO (código $LASTEXITCODE)" }

# ------------------------------------------------------------
Paso 'Fase 5. Hey Jarvis (guion completo sin micro)'
# ------------------------------------------------------------
& $Py pruebas\prueba_voz.py
$Resultados['5 Hey Jarvis'] = if ($LASTEXITCODE -eq 0) { 'OK (mira las latencias)' } else { "FALLO (código $LASTEXITCODE)" }

# ------------------------------------------------------------
Paso 'Fase 6. Híbrido con Claude (opcional)'
# ------------------------------------------------------------
if ($env:ANTHROPIC_API_KEY -or [Environment]::GetEnvironmentVariable('ANTHROPIC_API_KEY', 'User')) {
    $cfgH = Config-Prueba 'hibrido'
    $r = Hablar-Texto @('piensa bien, ¿por qué el cielo es azul?') @('--debug') $cfgH
    $Resultados['6 Híbrido'] = if ($r.codigo -eq 0) { 'OK (busca "Consultando a claude" arriba)' } else { "FALLO (código $($r.codigo))" }
} else {
    Aviso 'No hay ANTHROPIC_API_KEY: me salto el modo híbrido (es opcional).'
    $Resultados['6 Híbrido'] = 'saltada (sin ANTHROPIC_API_KEY)'
}

# ------------------------------------------------------------
Paso 'Fase 7. HUD'
# ------------------------------------------------------------
& $Py pruebas\prueba_hud.py
$Resultados['7 HUD'] = if ($LASTEXITCODE -eq 0) { 'OK (capturas en data\capturas_hud)' } else { "FALLO (código $LASTEXITCODE)" }

Remove-Item config_prueba.yaml, data\memoria_prueba.db -ErrorAction SilentlyContinue

Paso 'Resumen'
$Resultados.GetEnumerator() | ForEach-Object { '{0,-24} {1}' -f $_.Key, $_.Value }
Write-Host "`nListo. Para usarlo: jarvis.bat --text  (o jarvis.bat para el modo voz)" -ForegroundColor Cyan
