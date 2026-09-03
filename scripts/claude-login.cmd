@echo off
rem ONE-TIME LOGIN for the build queue. Double-click this. A PowerShell window
rem opens with Claude Code inside it. Type   /login   then Enter, finish in the
rem browser, come back, type   /exit   then Enter. The window stays open either
rem way, so if something goes wrong the message is still on screen.
start "Claude Code — one-time login" powershell -NoExit -ExecutionPolicy Bypass -Command "Write-Host ''; Write-Host '  When the prompt appears, type  /login  and press Enter. After the browser sign-in, type  /exit  and press Enter.' -ForegroundColor Yellow; Write-Host ''; & \"$env:APPDATA\npm\claude.cmd\""
