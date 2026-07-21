# DETONA CONCURSOS - servidor local (PC e celular na mesma Wi-Fi)
param(
  [switch]$Rede
)

$port = 8765
$dir = $PSScriptRoot

function Test-PortFree([int]$p) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, $p)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}

if (-not (Test-PortFree $port)) {
  for ($try = 8766; $try -le 8790; $try++) {
    if (Test-PortFree $try) { $port = $try; break }
  }
}

# IP local da rede (para celular)
$ip = $null
try {
  $ip = (Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -First 1 -ExpandProperty IPAddress)
} catch {}
if (-not $ip) {
  try {
    $ip = (Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null -and $_.NetAdapter.Status -eq 'Up' } |
      Select-Object -First 1).IPv4Address.IPAddress
  } catch {}
}

Write-Host ""
Write-Host "  DETONA CONCURSOS - PC/AL 2026" -ForegroundColor Yellow
Write-Host "  --------------------------------" -ForegroundColor DarkGray
Write-Host "  No PC:     http://localhost:$port/" -ForegroundColor Cyan
if ($ip) {
  Write-Host "  No CELULAR (mesma Wi-Fi):" -ForegroundColor Green
  Write-Host "             http://${ip}:$port/" -ForegroundColor Green
} else {
  Write-Host "  No celular: descubra o IP do PC (ipconfig) e use http://SEU-IP:$port/" -ForegroundColor DarkYellow
}
Write-Host "  Mantenha esta janela aberta. Ctrl+C para parar." -ForegroundColor DarkGray
Write-Host ""

$prefixes = @("http://localhost:$port/")
if ($Rede) {
  $prefixes = @("http://+:$port/")
}

$listener = New-Object System.Net.HttpListener
foreach ($p in $prefixes) { $listener.Prefixes.Add($p) }

try {
  $listener.Start()
} catch {
  Write-Host "  Aviso: sem permissao de rede. Tentando so localhost..." -ForegroundColor DarkYellow
  try { $listener.Stop() } catch {}
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://localhost:$port/")
  try {
    $listener.Start()
    Write-Host "  OK em localhost. Para celular, rode como Admin: SERVIR-CELULAR.bat" -ForegroundColor Yellow
  } catch {
    Write-Host "  ERRO ao iniciar servidor: $_" -ForegroundColor Red
    pause
    exit 1
  }
}

Start-Process "http://localhost:$port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.ico'  = 'image/x-icon'
  '.woff2'= 'font/woff2'
  '.webp' = 'image/webp'
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    $path = [Uri]::UnescapeDataString($req.Url.LocalPath.TrimStart('/'))
    if ([string]::IsNullOrEmpty($path)) { $path = 'index.html' }
    $full = [IO.Path]::GetFullPath((Join-Path $dir $path))
    $rootFull = [IO.Path]::GetFullPath($dir)
    if (-not $full.StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) {
      $res.StatusCode = 403
      $res.Close()
      continue
    }
    if (-not (Test-Path $full -PathType Leaf)) {
      $res.StatusCode = 404
      $buf = [Text.Encoding]::UTF8.GetBytes('404')
      $res.ContentLength64 = $buf.Length
      $res.OutputStream.Write($buf, 0, $buf.Length)
      $res.Close()
      continue
    }
    $ext = [IO.Path]::GetExtension($full).ToLower()
    $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $bytes = [IO.File]::ReadAllBytes($full)
    $res.ContentLength64 = $bytes.Length
    $res.Headers.Add('Cache-Control', 'no-cache')
    $res.Headers.Add('Access-Control-Allow-Origin', '*')
    $res.OutputStream.Write($bytes, 0, $bytes.Length)
    $res.Close()
  }
} finally {
  try { $listener.Stop() } catch {}
}
