# Static server for 田埂退潮之后 map — http://127.0.0.1:8780/  (no Python needed)
param([int]$Port = 8780, [string]$Root = $PSScriptRoot)
$mime = @{ '.html'='text/html; charset=utf-8'; '.js'='application/javascript; charset=utf-8'; '.css'='text/css; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.webp'='image/webp'; '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.svg'='image/svg+xml'; '.mp4'='video/mp4'; '.woff2'='font/woff2'; '.woff'='font/woff'; '.ttf'='font/ttf'; '.otf'='font/otf'; '.ico'='image/x-icon'; '.md'='text/plain; charset=utf-8' }
$l = New-Object System.Net.HttpListener; $l.Prefixes.Add("http://127.0.0.1:$Port/"); $l.Start()
Write-Host "Serving $Root at http://127.0.0.1:$Port/  (Ctrl+C to stop)"
try { while ($l.IsListening) {
  $c = $l.GetContext(); $p = [Uri]::UnescapeDataString($c.Request.Url.AbsolutePath)
  if ($p.EndsWith('/')) { $p += 'index.html' }
  $f = Join-Path $Root ($p.TrimStart('/') -replace '/', '\')
  $full = [IO.Path]::GetFullPath($f)
  if ($full.StartsWith([IO.Path]::GetFullPath($Root)) -and (Test-Path $full -PathType Leaf)) {
    $ext = [IO.Path]::GetExtension($full).ToLower(); $ct = $mime[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
    $b = [IO.File]::ReadAllBytes($full); $c.Response.ContentType = $ct; $c.Response.Headers.Add('Cache-Control','no-cache')
    $c.Response.ContentLength64 = $b.Length; $c.Response.OutputStream.Write($b, 0, $b.Length)
  } else { $c.Response.StatusCode = 404 }
  $c.Response.Close() } } finally { $l.Stop() }
