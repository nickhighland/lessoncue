#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$Source = Join-Path $PSScriptRoot 'payload'
$Target = Join-Path $env:ProgramFiles 'LessonCue'
$Data = Join-Path $env:ProgramData 'LessonCue'
$ServiceAccount = 'NT AUTHORITY\LOCAL SERVICE'
$MediaFirewallGroup = 'LessonCue restricted media workers'

if (-not (Test-Path (Join-Path $Source 'LessonCue.Server.exe'))) {
    throw 'Missing payload\LessonCue.Server.exe. Use a packaged Windows release.'
}

if (Get-Service LessonCue -ErrorAction SilentlyContinue) {
    Stop-Service LessonCue -ErrorAction SilentlyContinue
    sc.exe delete LessonCue | Out-Null
    for ($attempt = 0; $attempt -lt 30 -and (Get-Service LessonCue -ErrorAction SilentlyContinue); $attempt++) {
        Start-Sleep -Milliseconds 250
    }
    if (Get-Service LessonCue -ErrorAction SilentlyContinue) {
        throw 'The existing LessonCue service could not be removed. Restart Windows and run the installer again.'
    }
}

New-Item -ItemType Directory -Force -Path $Target, $Data | Out-Null
'database','media\originals','media\versions','media\processed','media\thumbnails','media\temporary','branding','backups','logs','config' |
    ForEach-Object { New-Item -ItemType Directory -Force -Path (Join-Path $Data $_) | Out-Null }

$ConfigFile = Join-Path $Data 'config\appsettings.json'
if (-not (Test-Path $ConfigFile)) {
    $OldConfig = Join-Path $Target 'appsettings.json'
    if (Test-Path $OldConfig) {
        Copy-Item $OldConfig $ConfigFile
    } else {
        @{ LessonCue = @{} } |
            ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $ConfigFile
    }
}
Copy-Item "$Source\*" $Target -Recurse -Force

# Use a private FFmpeg/FFprobe copy for untrusted uploads. Windows Firewall can
# then deny network access to media parsers without blocking the separate
# system FFmpeg process used for an explicitly configured live-stream relay.
$Ffmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
$Ffprobe = Get-Command ffprobe.exe -ErrorAction SilentlyContinue
if (-not $Ffmpeg -or -not $Ffprobe) {
    throw 'Install FFmpeg and FFprobe system-wide, then run the LessonCue installer again.'
}
$MediaTools = Join-Path $Target 'media-worker-tools'
New-Item -ItemType Directory -Force -Path $MediaTools | Out-Null
Copy-Item (Join-Path (Split-Path $Ffmpeg.Source) '*') $MediaTools -Recurse -Force
$RestrictedFfmpeg = Join-Path $MediaTools 'ffmpeg.exe'
$RestrictedFfprobe = Join-Path $MediaTools 'ffprobe.exe'
if (-not (Test-Path $RestrictedFfmpeg) -or -not (Test-Path $RestrictedFfprobe)) {
    throw 'LessonCue could not create its restricted FFmpeg worker copy.'
}

$Binary = '"{0}"' -f (Join-Path $Target 'LessonCue.Server.exe')
[Environment]::SetEnvironmentVariable('LESSONCUE_DATA_PATH', $Data, 'Machine')
[Environment]::SetEnvironmentVariable('LESSONCUE_HTTP_PORT', '80', 'Machine')
[Environment]::SetEnvironmentVariable('LESSONCUE_MEDIA_FFMPEG_PATH', $RestrictedFfmpeg, 'Machine')
[Environment]::SetEnvironmentVariable('LESSONCUE_MEDIA_FFPROBE_PATH', $RestrictedFfprobe, 'Machine')

# Uploaded media is parsed by FFmpeg, LibreOffice, and Poppler. The service must
# never run those converters as LocalSystem. LocalService can read the
# application but can modify only LessonCue's persistent data directory.
& icacls.exe $Target /inheritance:r /grant:r `
    '*S-1-5-18:(OI)(CI)(F)' `
    '*S-1-5-32-544:(OI)(CI)(F)' `
    '*S-1-5-19:(OI)(CI)(RX)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not secure the LessonCue application directory.' }
& icacls.exe $Data /inheritance:r /grant:r `
    '*S-1-5-18:(OI)(CI)(F)' `
    '*S-1-5-32-544:(OI)(CI)(F)' `
    '*S-1-5-19:(OI)(CI)(M)' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not secure the LessonCue data directory.' }

& sc.exe create LessonCue "binPath= $Binary" 'start= auto' "obj= $ServiceAccount" 'DisplayName= LessonCue Server' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not create the restricted LessonCue service.' }
& sc.exe description LessonCue 'Self-hosted LessonCue server' | Out-Null
& sc.exe failure LessonCue 'reset= 86400' 'actions= restart/5000/restart/15000/none/0' | Out-Null

Remove-NetFirewallRule -DisplayName 'LessonCue Server' -ErrorAction SilentlyContinue
Remove-NetFirewallRule -Group $MediaFirewallGroup -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName 'LessonCue Server' -Direction Inbound -Action Allow -Protocol TCP `
    -LocalPort 80 -Profile Domain,Private | Out-Null
New-NetFirewallRule -DisplayName 'LessonCue media worker - FFmpeg' -Group $MediaFirewallGroup `
    -Direction Outbound -Action Block -Program $RestrictedFfmpeg -Profile Any | Out-Null
New-NetFirewallRule -DisplayName 'LessonCue media worker - FFprobe' -Group $MediaFirewallGroup `
    -Direction Outbound -Action Block -Program $RestrictedFfprobe -Profile Any | Out-Null

$OptionalOfflineTools = @(
    "$env:ProgramFiles\LibreOffice\program\soffice.exe",
    "$env:ProgramFiles\LibreOffice\program\soffice.bin",
    $env:LESSONCUE_PDFTOPPM_PATH,
    (Get-Command pdftoppm.exe -ErrorAction SilentlyContinue).Source,
    (Get-Command pdfinfo.exe -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$RuleNumber = 0
foreach ($Tool in $OptionalOfflineTools) {
    $RuleNumber++
    New-NetFirewallRule -DisplayName "LessonCue media worker - converter $RuleNumber" `
        -Group $MediaFirewallGroup -Direction Outbound -Action Block `
        -Program $Tool -Profile Any | Out-Null
}
Start-Service LessonCue
$Ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    try {
        $response = Invoke-WebRequest 'http://127.0.0.1/health/ready' -UseBasicParsing -TimeoutSec 2
        if ($response.StatusCode -eq 200) {
            $Ready = $true
            break
        }
    } catch {
        Start-Sleep -Seconds 2
    }
}
if (-not $Ready) {
    throw 'LessonCue was installed but did not become ready. Check the Windows Application event log and the LessonCue service.'
}
Write-Host 'LessonCue is installed. Open http://localhost'
if (-not (Test-Path "$env:ProgramFiles\LibreOffice\program\soffice.exe")) {
    Write-Warning 'Install LibreOffice to convert PowerPoint, OpenDocument, and Word files locally.'
}
if (-not $env:LESSONCUE_PDFTOPPM_PATH -and -not (Get-Command pdftoppm.exe -ErrorAction SilentlyContinue)) {
    Write-Warning 'Install Poppler pdftoppm and set LESSONCUE_PDFTOPPM_PATH to enable local PDF/slide rendering.'
}
