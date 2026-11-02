#!/usr/bin/env bash
set -euo pipefail

git_ref="feature/meter-models"
app_dir="/home/ubuntu/building-energy"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git docker.io docker-compose-v2
systemctl enable --now docker
usermod -aG docker ubuntu

cat > /usr/local/bin/building-energy-deploy <<'DEPLOY_SCRIPT'
#!/usr/bin/env bash
set -euo pipefail

app_dir="/home/ubuntu/building-energy"
git_ref="feature/meter-models"
token="$(curl --fail --silent --show-error -X PUT \
  -H 'X-aws-ec2-metadata-token-ttl-seconds: 21600' \
  http://169.254.169.254/latest/api/token)"
public_ip="$(curl --fail --silent --show-error \
  -H "X-aws-ec2-metadata-token: ${token}" \
  http://169.254.169.254/latest/meta-data/public-ipv4)"

if [ -d "${app_dir}/.git" ]; then
  git -C "$app_dir" fetch origin "$git_ref"
  git -C "$app_dir" switch "$git_ref"
  git -C "$app_dir" pull --ff-only origin "$git_ref"
else
  git clone --branch "$git_ref" --depth 1 \
    https://github.com/yokumi12/building-energy.git "$app_dir"
fi

cat > "${app_dir}/.env" <<EOF
NEXT_PUBLIC_API_BASE_URL=http://${public_ip}:8001
CORS_ALLOW_ORIGINS=http://${public_ip}:3001
WEB_PORT=3001
API_PORT=8001
EOF

cd "$app_dir"
docker compose up --build -d
curl --fail --retry 12 --retry-delay 5 http://localhost:8001/health
curl --fail --retry 12 --retry-delay 5 http://localhost:3001/
DEPLOY_SCRIPT
chmod 0755 /usr/local/bin/building-energy-deploy
chown ubuntu:ubuntu /usr/local/bin/building-energy-deploy

cat > /etc/systemd/system/building-energy-deploy.service <<'SERVICE_UNIT'
[Unit]
Description=Deploy building energy containers with Docker Compose
Wants=network-online.target
After=network-online.target docker.service

[Service]
Type=oneshot
User=ubuntu
SupplementaryGroups=docker
ExecStart=/usr/local/bin/building-energy-deploy
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
SERVICE_UNIT

systemctl daemon-reload
systemctl enable --now building-energy-deploy.service
