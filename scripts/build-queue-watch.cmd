@echo off
rem THE BUILD QUEUE — the laptop-in-a-closet worker. Builds armed ideas from
rem the Idea Bank one at a time on their own branches, pushes the branch
rem (never main), waits for the Vercel preview, and writes the testing
rem checklist back. Double-click, or put a shortcut in Startup. Close to stop.
cd /d "%~dp0.."
title Survive — build queue
bun scripts/build-queue.ts --watch
