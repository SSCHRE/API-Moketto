#!/usr/bin/env sh
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18.3 or newer is required: https://nodejs.org" >&2
  exit 1
fi
exec node "$(dirname "$0")/bin/apimoketto.js" "$@"
