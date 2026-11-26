#!/usr/bin/env bash
set -euo pipefail
# Solo el runner de Actions. Ninguna variable de Supabase ni token llega al proceso.
exec sudo ip netns exec medicion sudo -u "$(id -un)" env -i \
  HOME="$HOME" PATH="$PATH" LANG=C.UTF-8 CI=true \
  NODE_PATH="$RUNNER_TEMP/qa-navegador/node_modules" "$@"
