#!/usr/bin/env bash
# Tareas de cada día (las lanza el watchdog una vez al día). Cada una corre aunque otra falle.
set -uo pipefail
export PATH="$HOME/.local/node/bin:$PATH"
APP="$(cd "$(dirname "$0")/.." && pwd)"
cd "$APP"
exec 7>"$APP/data/.tareas-diarias.lock"; flock -n 7 || exit 0
scripts/respaldo.sh || echo "$(date -Is) ❌ respaldo falló"
npx tsx scripts/alertas.ts || echo "$(date -Is) ❌ alertas fallaron"
scripts/actualizar-nomina-sii.sh || echo "$(date -Is) ❌ nómina falló"
