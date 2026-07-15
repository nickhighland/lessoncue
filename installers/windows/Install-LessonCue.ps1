#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'
$Source = Join-Path $PSScriptRoot 'payload'
$Target = Join-Path $env:ProgramFiles 'LessonCue'
$Data = Join-Path $env:ProgramData 'LessonCue'

if (-not (Test-Path (Join-Path $Source 'LessonCue.Server.exe'))) {
    throw 'Missing payload\LessonCue.Server.exe. Use a packaged Windows release.'
}

New-Item -ItemType Directory -Force -Path $Target, $Data | Out-Null
'database','media\originals','media\processed','media\thumbnails','media\temporary','branding','backups','logs','config' |
    ForEach-Object { New-Item -ItemType Directory -Force -Path (Join-Path $Data $_) | Out-Null }

$ConfigFile = Join-Path $Data 'config\appsettings.json'
if (-not (Test-Path $ConfigFile)) {
    $OldConfig = Join-Path $Target 'appsettings.json'
    if (Test-Path $OldConfig) {
        Copy-Item $OldConfig $ConfigFile
    } else {
        $PairingPin = Get-Random -Minimum 0 -Maximum 1000000
        @{ LessonCue = @{ PairingPin = $PairingPin.ToString('D6') } } |
            ConvertTo-Json -Depth 3 | Set-Content -Encoding UTF8 $ConfigFile
    }
}
Copy-Item "$Source\*" $Target -Recurse -Force

$Binary = '"{0}"' -f (Join-Path $Target 'LessonCue.Server.exe')
if (Get-Service LessonCue -ErrorAction SilentlyContinue) { Stop-Service LessonCue; sc.exe delete LessonCue | Out-Null }
New-Service -Name LessonCue -BinaryPathName $Binary -DisplayName 'LessonCue Server' -StartupType Automatic
[Environment]::SetEnvironmentVariable('LESSONCUE_DATA_PATH', $Data, 'Machine')
[Environment]::SetEnvironmentVariable('LESSONCUE_HTTP_PORT', '8080', 'Machine')
New-NetFirewallRule -DisplayName 'LessonCue Server' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -ErrorAction SilentlyContinue | Out-Null
Start-Service LessonCue
Write-Host 'LessonCue is installed. Open http://localhost:8080'
