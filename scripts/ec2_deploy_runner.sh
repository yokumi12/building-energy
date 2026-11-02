#!/usr/bin/env bash
set -euo pipefail

app_dir="/home/ubuntu/building-energy"
git_ref="feature/meter-models"

if [ -d "${app_dir}/.git" ]; then
  git -C "$app_dir" fetch origin "$git_ref"
  git -C "$app_dir" switch "$git_ref"
  git -C "$app_dir" pull --ff-only origin "$git_ref"
else
  git clone --branch "$git_ref" --depth 1 \
    https://github.com/yokumi12/building-energy.git "$app_dir"
fi

exec bash "$app_dir/scripts/deploy_app.sh"
