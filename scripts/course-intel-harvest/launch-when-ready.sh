#!/usr/bin/env bash
# Unattended launcher: wait for the nationwide harvest (national.log) to finish,
# then launch the SEC-preflight → follow-behind catch-up worker. Single instance.
cd /c/Users/lee/Documents/sa-course-intel-harvest || exit 1
set -a; . ./.env; set +a
D=scripts/course-intel-harvest
echo "[launcher $(date '+%H:%M:%S')] waiting for national run to complete..." >> "$D/launcher.log"
# wait for the current nationwide sweep to print its summary
until grep -q "HARVEST SUMMARY" "$D/national.log" 2>/dev/null; do sleep 30; done
# single-instance guard: a lock file means the worker was already launched
if [ -f "$D/.catchup.lock" ]; then
  echo "[launcher $(date '+%H:%M:%S')] .catchup.lock present; not launching a second worker." >> "$D/launcher.log"
  exit 0
fi
touch "$D/.catchup.lock"
echo "[launcher $(date '+%H:%M:%S')] national run complete; launching follow-behind." >> "$D/launcher.log"
sleep 15  # let the national run's final status/report writes settle
node "$D/follow-behind.mjs" --execute \
  --budget-usd 90 --max-serp 6000 --concurrency 2 \
  --max-runtime-min 540 --poll-sec 180 >> "$D/catchup.log" 2>&1
rm -f "$D/.catchup.lock"
echo "[launcher $(date '+%H:%M:%S')] follow-behind exited." >> "$D/launcher.log"
