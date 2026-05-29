#!/bin/sh
set -e

if [ -d "/backend/data" ]; then
    chown -R appuser:appuser /backend/data
fi

exec gosu appuser "$@"