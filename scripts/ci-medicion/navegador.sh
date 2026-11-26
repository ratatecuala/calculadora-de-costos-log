#!/usr/bin/env bash
set -euo pipefail
tmp=$(mktemp -d)
export TMPDIR="$tmp"
python3 -m http.server 5195 --bind 127.0.0.1 --directory dist-medicion >"$tmp/preview.log" 2>&1 &
activo=$!
node_modules/.bin/vite --config vite.medicion.config.ts --host 127.0.0.1 --port 5196 --strictPort >"$tmp/sin-flag.log" 2>&1 &
apagado=$!
trap 'kill "$activo" "$apagado" 2>/dev/null || true; rm -rf -- "$tmp"' EXIT
base=http://127.0.0.1:5195
sin_flag=http://127.0.0.1:5196
for url in "$base" "$sin_flag"; do
  curl --fail --silent --show-error --retry 15 --retry-delay 1 --retry-connrefused "$url/" -o /dev/null
done

node scripts/e2e-medicion.mjs "$base" "$sin_flag" | tee "$tmp/e2e.log"
# El E2E también admite servidores de desarrollo. En CI los dos perfiles deben
# haber recargado la PWA y escrito una carga sin conexión.
test "$(grep -Fc 'sin conexión: recarga y registro OK' "$tmp/e2e.log")" -eq 2
node scripts/ci-medicion/atomicidad.mjs "$base" "$tmp"
