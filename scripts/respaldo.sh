#!/usr/bin/env bash
# Respaldo diario: base de datos (sin la nómina SII, que se reimporta) + carpeta data/ (certificados, CAF, XML emitidos, libros).
# Guarda en ~/respaldos/facturador/AAAA-MM-DD y conserva 14 días. Uso manual: scripts/respaldo.sh
set -euo pipefail
APP="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${RESPALDO_DIR:-$HOME/respaldos/facturador}/$(date +%F)"
mkdir -p "$DEST"
chmod 700 "$(dirname "$DEST")"
get() { { grep -E "^$1=" "$APP/.env.local" || true; } | tail -1 | cut -d= -f2- | sed -E "s/^['\"]|['\"]$//g"; }
DB_NAME=$(get DB_NAME); DB_USER=$(get DB_USER); DB_SOCKET=$(get DB_SOCKET); DB_HOST=$(get DB_HOST)
# Clave por variable de entorno: no queda visible en la lista de procesos.
export MYSQL_PWD="$(get DB_PASSWORD)"
CONN=(--user="$DB_USER"); [[ -n "$DB_SOCKET" ]] && CONN+=(--socket="$DB_SOCKET") || CONN+=(--host="${DB_HOST:-localhost}")
# --no-defaults: que ~/.my.cnf (otra cuenta) no pise las credenciales de la app.
mariadb-dump --no-defaults "${CONN[@]}" --single-transaction --skip-lock-tables \
  --ignore-table="$DB_NAME.sii_nomina_nombre" --ignore-table="$DB_NAME.sii_nomina_acteco" \
  "$DB_NAME" | gzip -9 >"$DEST/base.sql.gz.tmp"
mv "$DEST/base.sql.gz.tmp" "$DEST/base.sql.gz"
tar -czf "$DEST/data.tar.gz.tmp" -C "$APP" --exclude="data/nomina-sii" data
mv "$DEST/data.tar.gz.tmp" "$DEST/data.tar.gz"
chmod 600 "$DEST"/*
# Verificación mínima: el dump trae la tabla de estado y el tar se puede leer.
zcat "$DEST/base.sql.gz" | grep -q "CREATE TABLE \`app_state\`" || { echo "$(date -Is) respaldo SIN app_state"; exit 1; }
tar -tzf "$DEST/data.tar.gz" >/dev/null
find "$(dirname "$DEST")" -mindepth 1 -maxdepth 1 -type d -mtime +14 -exec rm -rf {} +
echo "$(date -Is) respaldo OK $DEST ($(du -sh "$DEST" | cut -f1))"
