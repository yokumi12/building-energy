#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <building-energy-week08-instance-id>" >&2
  exit 2
fi

instance_id="$1"
region="${AWS_REGION:-ap-northeast-2}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
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

if [ "$state" = "running" ]; then
  aws ec2 stop-instances --region "$region" --instance-ids "$instance_id" --no-cli-pager >/dev/null
  aws ec2 wait instance-stopped --region "$region" --instance-ids "$instance_id"
elif [ "$state" != "stopped" ]; then
  echo "Instance must be running or stopped; current state is '$state'." >&2
  exit 1
fi

aws ec2 start-instances --region "$region" --instance-ids "$instance_id" --no-cli-pager >/dev/null
aws ec2 wait instance-status-ok --region "$region" --instance-ids "$instance_id"

instance_json="$(aws ec2 describe-instances \
  --region "$region" \
  --instance-ids "$instance_id" \
  --output json \
  --no-cli-pager)"
public_ip="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["Reservations"][0]["Instances"][0].get("PublicIpAddress",""))' <<< "$instance_json")"

if [ -z "$public_ip" ]; then
  echo "Instance is running but has no public IPv4 address." >&2
  exit 1
fi

echo "EC2 status checks passed. The boot service is pulling the current branch and rebuilding Compose containers."
distribution="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='building-energy-week08'].Id | [0]" \
  --output text \
  --no-cli-pager)"
if [ "$distribution" != "None" ] && [ -n "$distribution" ]; then
  bash "$script_dir/update_cloudfront_origin.sh" "$instance_id" "$distribution"
  distribution_domain="$(aws cloudfront get-distribution \
    --id "$distribution" \
    --query 'Distribution.DomainName' \
    --output text \
    --no-cli-pager)"
  curl --fail --silent --show-error --retry 30 --retry-all-errors \
    --retry-delay 5 --output /dev/null "https://${distribution_domain}/api/health"
  curl --fail --silent --show-error --retry 30 --retry-all-errors \
    --retry-delay 5 --output /dev/null "https://${distribution_domain}/"
  echo "EC2 status, CloudFront origin update, web, and API checks passed."
  echo "Web (HTTPS): https://${distribution_domain}"
  echo "API health (HTTPS): https://${distribution_domain}/api/health"
else
  echo "No building-energy-week08 CloudFront distribution was found."
  echo "Run scripts/create_cloudfront.sh before exposing the app publicly."
fi
