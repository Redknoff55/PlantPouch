#!/bin/sh
set -eu

ENV_FILE="${1:-.env}"
COMPOSE_FILE="${2:-docker-compose.deploy.yml}"

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE"
  exit 1
fi

. "$ENV_FILE"

if [ -z "${POSTGRES_USER:-}" ] || [ -z "${POSTGRES_DB:-}" ] || [ -z "${POSTGRES_PASSWORD:-}" ]; then
  echo "POSTGRES_USER, POSTGRES_PASSWORD, and POSTGRES_DB must be set in $ENV_FILE"
  exit 1
fi

NEW_PASSWORD="${NEW_PASSWORD:-$(LC_ALL=C tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32)}"
TMP_FILE="$(mktemp)"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" exec -T db \
  psql -U "$POSTGRES_USER" -d postgres \
  -c "ALTER USER \"$POSTGRES_USER\" WITH PASSWORD '$NEW_PASSWORD';"

awk -v next_password="$NEW_PASSWORD" '
  BEGIN { updated = 0 }
  /^POSTGRES_PASSWORD=/ {
    print "POSTGRES_PASSWORD=" next_password
    updated = 1
    next
  }
  { print }
  END {
    if (!updated) {
      print "POSTGRES_PASSWORD=" next_password
    }
  }
' "$ENV_FILE" > "$TMP_FILE"

mv "$TMP_FILE" "$ENV_FILE"

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d app db

echo "Database password rotated."
echo "POSTGRES_PASSWORD=$NEW_PASSWORD"
