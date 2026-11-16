#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <building-energy-week08-instance-id> <cloudfront-distribution-id>" >&2
  exit 2
fi

for command in aws jq python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command '$command' is not installed." >&2
    exit 1
  fi
done

instance_id="$1"
distribution_id="$2"
region="${AWS_REGION:-ap-northeast-2}"
instance_json="$(aws ec2 describe-instances \
  --region "$region" \
  --instance-ids "$instance_id" \
  --output json \
  --no-cli-pager)"
read -r instance_name instance_state origin_ip origin_dns <<< "$(python3 -c '
import json, sys
instance = json.load(sys.stdin)["Reservations"][0]["Instances"][0]
tags = {tag["Key"]: tag["Value"] for tag in instance.get("Tags", [])}
print(tags.get("Name", ""), instance["State"]["Name"],
      instance.get("PublicIpAddress", ""),
      instance.get("PublicDnsName", ""))
' <<< "$instance_json")"
if [ "$instance_name" != "building-energy-week08" ]; then
  echo "Refusing to update an origin for '$instance_id': expected Name=building-energy-week08, found '$instance_name'." >&2
  exit 1
fi
if [ "$instance_state" != "running" ] || [ -z "$origin_ip" ] || [ -z "$origin_dns" ]; then
  echo "The dedicated instance must be running with a public IPv4 address and public DNS hostname." >&2
  exit 1
fi

distribution_json="$(aws cloudfront get-distribution-config \
  --id "$distribution_id" \
  --output json \
  --no-cli-pager)"
distribution_comment="$(jq -r '.DistributionConfig.Comment' <<< "$distribution_json")"
if [ "$distribution_comment" != "building-energy-week08" ]; then
  echo "Refusing to update distribution '$distribution_id': unexpected comment '$distribution_comment'." >&2
  exit 1
fi

origin_count="$(jq '[.DistributionConfig.Origins.Items[] | select(.Id == "web-origin" or .Id == "api-origin")] | length' <<< "$distribution_json")"
if [ "$origin_count" -ne 2 ]; then
  echo "Distribution '$distribution_id' does not contain the expected web-origin and api-origin." >&2
  exit 1
fi
if ! jq -e '[.DistributionConfig.Origins.Items[] | select(.Id == "web-origin" or .Id == "api-origin") | .Id] | sort == ["api-origin", "web-origin"]' <<< "$distribution_json" >/dev/null; then
  echo "Distribution '$distribution_id' does not contain each expected origin exactly once." >&2
  exit 1
fi
if [ "$(jq '[.DistributionConfig.Origins.Items[] | select(.Id == "web-origin" or .Id == "api-origin") | select(.DomainName != $dns)] | length' --arg dns "$origin_dns" <<< "$distribution_json")" -eq 0 ]; then
  echo "CloudFront origins already use EC2 hostname $origin_dns ($origin_ip)."
  exit 0
fi

etag="$(jq -r '.ETag' <<< "$distribution_json")"
if [ -z "$etag" ] || [ "$etag" = "null" ]; then
  echo "Could not read the CloudFront distribution ETag." >&2
  exit 1
fi
config_file="$(mktemp)"
trap 'rm -f "$config_file"' EXIT
jq --arg dns "$origin_dns" '
  .DistributionConfig
  | .Origins.Items |= map(
      if .Id == "web-origin" or .Id == "api-origin"
      then .DomainName = $dns
      else .
      end
    )
' <<< "$distribution_json" > "$config_file"

aws cloudfront update-distribution \
  --id "$distribution_id" \
  --if-match "$etag" \
  --distribution-config "file://$config_file" \
  --no-cli-pager >/dev/null
echo "Updated both CloudFront origins to $origin_dns ($origin_ip); waiting for distribution deployment."
aws cloudfront wait distribution-deployed --id "$distribution_id" --no-cli-pager
