#!/usr/bin/env bash
set -euo pipefail

app_dir="/home/ubuntu/building-energy"
token="$(curl --fail --silent --show-error -X PUT \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600' \
  http://169.254.169.254/latest/api/token)"
public_ip="$(curl --fail --silent --show-error \
  -H "X-aws-ec2-metadata-token: ${token}" \
  http://169.254.169.254/latest/meta-data/public-ipv4)"

cat > "${app_dir}/.env" <<EOF
NEXT_PUBLIC_API_BASE_URL=http://${public_ip}:8001
CORS_ALLOW_ORIGINS=http://${public_ip}:3001
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
