#!/usr/bin/env bash
set -euo pipefail

app_dir="/home/ubuntu/building-energy"

cat > "${app_dir}/.env" <<EOF
NEXT_PUBLIC_API_BASE_URL=/api
CORS_ALLOW_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
WEB_PORT=3001
API_PORT=8001
EOF

cd "$app_dir"
docker compose --parallel 1 build
docker compose up -d
curl --fail --silent --show-error --retry 12 --retry-all-errors \
  --retry-delay 5 --output /dev/null http://localhost:8001/health
curl --fail --silent --show-error --retry 12 --retry-all-errors \
  --retry-delay 5 --output /dev/null http://localhost:3001/
