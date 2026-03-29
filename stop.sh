#!/bin/bash

# SMP — Stop all services

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PIDS_FILE="$PROJECT_ROOT/.pids"

if [ ! -f "$PIDS_FILE" ]; then
  echo "No .pids file found — services may not be running."
  exit 1
fi

echo "Stopping SMP services..."
while read pid; do
  if kill "$pid" 2>/dev/null; then
    echo "  Stopped PID $pid ✓"
  else
    echo "  PID $pid not found (already stopped?)"
  fi
done < "$PIDS_FILE"

rm "$PIDS_FILE"
echo "Done."