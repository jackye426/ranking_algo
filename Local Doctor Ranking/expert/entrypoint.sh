#!/bin/sh
set -eu
if [ "$(id -u)" = "0" ]; then
  mkdir -p /data/expert
  chown -R node:node /data/expert
  exec gosu node "$@"
fi
exec "$@"
