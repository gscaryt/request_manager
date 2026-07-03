#!/bin/bash
# Double-click to start Template Request Manager. Closes? just run it again.
cd "$(dirname "$0")"
lsof -ti tcp:4173 | xargs kill 2>/dev/null  # stop a previous instance so the port is free
python3 server.py &
sleep 1
open "http://localhost:4173"
wait
