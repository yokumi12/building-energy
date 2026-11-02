#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <building-energy-week08-instance-id>" >&2
  exit 2
fi

instance_id="$1"
region="${AWS_REGION:-ap-northeast-2}"
instance_json="$(aws ec2 describe-instances \
  --region "$region" \
  --instance-ids "$instance_id" \
  --output json \
  --no-cli-pager)"
instance_name="$(python3 -c 'import json,sys; i=json.load(sys.stdin)["Reservations"][0]["Instances"][0]; print(next((t["Value"] for t in i.get("Tags",[]) if t["Key"]=="Name"), ""))' <<< "$instance_json")"
state="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["Reservations"][0]["Instances"][0]["State"]["Name"])' <<< "$instance_json")"

if [ "$instance_name" != "building-energy-week08" ]; then
  echo "Refusing to touch instance '$instance_id': expected Name=building-energy-week08, found '$instance_name'." >&2
  exit 1
fi

if [ "$state" = "stopped" ]; then
  echo "Instance is already stopped. EBS storage remains and may still incur charges."
  exit 0
fi

if [ "$state" != "running" ]; then
  echo "Instance must be running or stopped; current state is '$state'." >&2
  exit 1
fi

aws ec2 stop-instances --region "$region" --instance-ids "$instance_id" --no-cli-pager >/dev/null
aws ec2 wait instance-stopped --region "$region" --instance-ids "$instance_id"
echo "EC2 instance stopped. EBS storage remains and may still incur charges."
