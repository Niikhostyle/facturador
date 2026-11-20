#!/usr/bin/env bash
# Revisa si el SII publicó una nómina de personas jurídicas nueva y, solo si cambió, la descarga e importa.
# Lo lanza el watchdog una vez al día (solo hace HEAD si no hay cambios). Uso manual: scripts/actualizar-nomina-sii.sh
set -euo pipefail
export PATH="$HOME/.local/node/bin:$PATH"
APP="$(cd "$(dirname "$0")/.." && pwd)"
DIR="$APP/data/nomina-sii"
BASE="https://www.sii.cl/estadisticas/nominas"
mkdir -p "$DIR"
exec 8>"$DIR/.lock"; flock -n 8 || exit 0

log() { echo "$(date -Is) $*"; }
cambio=0
for f in PUB_NOMBRES_PJ PUB_NOM_ACTECOS; do
  meta=$(curl -fsSI --max-time 30 "$BASE/$f.zip" | tr -d '\r' | grep -iE '^(last-modified|content-length):' | sort)
  [[ -n "$meta" ]] || { log "sin respuesta del SII para $f"; exit 1; }
  if [[ "$meta" != "$(cat "$DIR/$f.meta" 2>/dev/null)" || ! -f "$DIR/$f.zip" ]]; then
    log "descargando $f (cambió en el SII)"
    curl -fsSL --max-time 900 -o "$DIR/$f.zip.tmp" "$BASE/$f.zip"
    unzip -tq "$DIR/$f.zip.tmp" >/dev/null   # zip corrupto: aborta sin tocar la base
    mv "$DIR/$f.zip.tmp" "$DIR/$f.zip"
    echo "$meta" >"$DIR/$f.meta.pend"
    cambio=1
  fi
done

[[ $cambio == 1 ]] || { log "nómina sin cambios"; exit 0; }
cd "$APP"
npx tsx scripts/import-nomina-sii.ts "$DIR"
# Se marca como importada solo si el import terminó bien (si falla, se reintenta mañana).
for p in "$DIR"/*.meta.pend; do [[ -e "$p" ]] && mv "$p" "${p%.pend}"; done
log "nómina actualizada"
