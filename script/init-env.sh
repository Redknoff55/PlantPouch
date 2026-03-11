#!/bin/sh
set -eu

ENV_FILE="${1:-.env}"

if [ -f "$ENV_FILE" ]; then
  echo "$ENV_FILE already exists."
  exit 1
fi

PASSWORD="$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)"

cat >"$ENV_FILE" <<EOF
APP_PORT=5000
POSTGRES_USER=plantpouch
POSTGRES_PASSWORD=$PASSWORD
POSTGRES_DB=plantpouch
EOF

echo "Created $ENV_FILE"
echo "POSTGRES_PASSWORD=$PASSWORD"
