@echo off
rem THE WATCH SYNC — keeps Obsidian and the Idea Bank in step, every 5 minutes.
rem Double-click this, or put a shortcut to it in
rem   %APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup
rem so it starts with Windows. Close the window to stop it.
cd /d "C:\Users\lee\Documents\sa-film-camera"
title Survive — Obsidian sync (watch)
bun scripts/obsidian-sync.ts --watch --organize --draft
