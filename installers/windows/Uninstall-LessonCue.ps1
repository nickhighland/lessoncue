#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

if (Get-Service LessonCue -ErrorAction SilentlyContinue) {
    Stop-Service LessonCue -ErrorAction SilentlyContinue
    sc.exe delete LessonCue | Out-Null
}
Remove-NetFirewallRule -DisplayName 'LessonCue Server' -ErrorAction SilentlyContinue
Remove-NetFirewallRule -Group 'LessonCue restricted media workers' -ErrorAction SilentlyContinue
[Environment]::SetEnvironmentVariable('LESSONCUE_MEDIA_FFMPEG_PATH', $null, 'Machine')
[Environment]::SetEnvironmentVariable('LESSONCUE_MEDIA_FFPROBE_PATH', $null, 'Machine')
Remove-Item (Join-Path $env:ProgramFiles 'LessonCue') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "LessonCue was removed. Media and configuration remain in $env:ProgramData\LessonCue."
