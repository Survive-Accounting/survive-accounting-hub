@echo off
rem ONE-TIME LOGIN for the build queue. Double-click this. When Claude Code
rem opens in this window, type   /login   and press Enter, finish in the
rem browser, then type   /exit   and press Enter. That's it.
title Claude Code — one-time login for the build queue
echo.
echo   When the prompt appears below, type  /login  and press Enter.
echo   Finish the sign-in in your browser, come back here, type  /exit  and press Enter.
echo.
"%APPDATA%\npm\claude.cmd"
echo.
echo   Done. You can close this window and double-click build-queue-watch.cmd.
pause
