#Requires -RunAsAdministrator
$ErrorActionPreference = 'Stop'

if (Get-Service LessonCue -ErrorAction SilentlyContinue) {
    Stop-Service LessonCue -ErrorAction SilentlyContinue
    sc.exe delete LessonCue | Out-Null
}
Remove-NetFirewallRule -DisplayName 'LessonCue Server' -ErrorAction SilentlyContinue
Remove-Item (Join-Path $env:ProgramFiles 'LessonCue') -Recurse -Force -ErrorAction SilentlyContinue
Write-Host "LessonCue was removed. Media and configuration remain in $env:ProgramData\LessonCue."
