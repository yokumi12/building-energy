#!/usr/bin/env bash
set -euo pipefail

git_ref="feature/meter-models"
app_dir="/home/ubuntu/building-energy"

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl git docker.io docker-compose-v2
systemctl enable --now docker
usermod -aG docker ubuntu

git clone --branch "$git_ref" --depth 1 \
  https://github.com/yokumi12/building-energy.git "$app_dir"
install -m 0755 "$app_dir/scripts/ec2_deploy_runner.sh" \
  /usr/local/bin/building-energy-deploy

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
