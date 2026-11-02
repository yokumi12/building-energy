#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <building-energy-week08-instance-id>" >&2
  exit 2
fi

for command in aws curl jq python3; do
  if ! command -v "$command" >/dev/null 2>&1; then
    echo "Required command '$command' is not installed." >&2
    exit 1
  fi
done

instance_id="$1"
region="${AWS_REGION:-ap-northeast-2}"
instance_name="building-energy-week08"
distribution_comment="building-energy-week08"
function_name="building-energy-api-prefix"
function_config='{"Comment":"Remove /api prefix before forwarding to FastAPI","Runtime":"cloudfront-js-1.0"}'

aws sts get-caller-identity --query Account --output text --no-cli-pager >/dev/null
instance_json="$(aws ec2 describe-instances \
  --region "$region" \
  --instance-ids "$instance_id" \
  --output json \
  --no-cli-pager)"
read -r actual_name state vpc_id security_group_ids origin_ip origin_dns <<< "$(python3 -c '
import json, sys
instance = json.load(sys.stdin)["Reservations"][0]["Instances"][0]
tags = {tag["Key"]: tag["Value"] for tag in instance.get("Tags", [])}
print(tags.get("Name", ""), instance["State"]["Name"], instance["VpcId"],
      ",".join(group["GroupId"] for group in instance.get("SecurityGroups", [])),
      instance.get("PublicIpAddress", ""),
      instance.get("PublicDnsName", ""))
' <<< "$instance_json")"
if [ "$actual_name" != "$instance_name" ]; then
  echo "Refusing to configure instance '$instance_id': expected Name=$instance_name, found '$actual_name'." >&2
  exit 1
fi
if [ "$state" != "running" ]; then
  echo "Instance must be running with a public IPv4 address before CloudFront setup; current state is '$state'." >&2
  exit 1
fi
if [ -z "$vpc_id" ] || [ -z "$security_group_ids" ]; then
  echo "Could not read the instance network settings." >&2
  exit 1
fi
if [ -z "$origin_ip" ]; then
  echo "Instance is running but has no public IPv4 address." >&2
  exit 1
fi
if [ -z "$origin_dns" ]; then
  echo "Instance is running but has no public DNS hostname for CloudFront." >&2
  exit 1
fi

security_group_id="$(aws ec2 describe-security-groups \
  --region "$region" \
  --group-ids ${security_group_ids//,/ } \
  --query "SecurityGroups[?Tags[?Key=='Purpose' && Value=='building-energy-week08']].GroupId | [0]" \
  --output text \
  --no-cli-pager)"
if [ "$security_group_id" = "None" ] || [ -z "$security_group_id" ]; then
  echo "No attached security group tagged Purpose=building-energy-week08 was found." >&2
  exit 1
fi
if [ "${security_group_ids//[^,]}" != "" ]; then
  echo "Instance has additional security groups; refusing to assume they do not expose the app ports." >&2
  exit 1
fi

prefix_list_id="$(aws ec2 describe-managed-prefix-lists \
  --region "$region" \
  --filters Name=prefix-list-name,Values=com.amazonaws.global.cloudfront.origin-facing \
  --query 'PrefixLists[0].PrefixListId' \
  --output text \
  --no-cli-pager)"
if [ -z "$prefix_list_id" ] || [ "$prefix_list_id" = "None" ]; then
  echo "AWS-managed CloudFront origin-facing prefix list is unavailable in $region." >&2
  exit 1
fi

rules_json="$(aws ec2 describe-security-group-rules \
  --region "$region" \
  --filters "Name=group-id,Values=$security_group_id" \
  --output json \
  --no-cli-pager)"
unexpected_rule_ids="$(python3 -c '
import json, sys
rules = json.load(sys.stdin)["SecurityGroupRules"]
prefix_list_id = sys.argv[1]
ports = {22, 3001, 8001}
unexpected = []
for rule in rules:
    if rule["IsEgress"]:
        continue
    protocol = rule.get("IpProtocol")
    first, last = rule.get("FromPort"), rule.get("ToPort")
    exposes_app = protocol == "-1" or (
        protocol == "tcp" and first is not None and last is not None
        and first <= 8001 and last >= 3001
    )
    if not exposes_app:
        continue
    is_cloudfront = (
        protocol == "tcp" and first == 3001 and last == 8001
        and rule.get("PrefixListId") == prefix_list_id
    )
    is_legacy = (
        protocol == "tcp" and first == last and first in ports
        and rule.get("CidrIpv4") == "210.181.166.4/32"
    )
    if not is_cloudfront and not is_legacy:
        unexpected.append(rule["SecurityGroupRuleId"])
print(" ".join(unexpected))
' "$prefix_list_id" <<< "$rules_json")"
if [ -n "$unexpected_rule_ids" ]; then
  echo "Unexpected security-group ingress rules could expose the app; inspect these rule IDs before retrying: $unexpected_rule_ids" >&2
  exit 1
fi
has_cloudfront_rule="$(python3 -c '
import json, sys
rules = json.load(sys.stdin)["SecurityGroupRules"]
prefix_list_id = sys.argv[1]
print(any(
    not rule["IsEgress"] and rule.get("IpProtocol") == "tcp"
    and rule.get("FromPort") == 3001 and rule.get("ToPort") == 8001
    and rule.get("PrefixListId") == prefix_list_id
    for rule in rules
))
' "$prefix_list_id" <<< "$rules_json")"
if [ "$has_cloudfront_rule" != "True" ]; then
  permission="$(jq -cn \
    --arg prefix_list_id "$prefix_list_id" \
    '[{IpProtocol:"tcp",FromPort:3001,ToPort:8001,PrefixListIds:[{PrefixListId:$prefix_list_id,Description:"CloudFront origin-facing"}]}]')"
  aws ec2 authorize-security-group-ingress \
    --region "$region" \
    --group-id "$security_group_id" \
    --ip-permissions "$permission" \
    --no-cli-pager >/dev/null
fi

function_exists="$(aws cloudfront list-functions \
  --query "FunctionList.Items[?Name=='$function_name'].Name | [0]" \
  --output text \
  --no-cli-pager)"
if [ "$function_exists" = "None" ] || [ -z "$function_exists" ]; then
  function_result="$(aws cloudfront create-function \
    --name "$function_name" \
    --function-config "$function_config" \
    --function-code fileb://scripts/cloudfront_api_prefix.js \
    --output json \
    --no-cli-pager)"
  function_etag="$(jq -r '.ETag' <<< "$function_result")"
  aws cloudfront publish-function \
    --name "$function_name" \
    --if-match "$function_etag" \
    --no-cli-pager >/dev/null
elif ! aws cloudfront describe-function \
  --name "$function_name" \
  --stage LIVE \
  --no-cli-pager >/dev/null 2>&1; then
  echo "CloudFront Function '$function_name' exists but has no published LIVE version; inspect it before retrying." >&2
  exit 1
fi
account_id="$(aws sts get-caller-identity --query Account --output text --no-cli-pager)"
function_arn="arn:aws:cloudfront::${account_id}:function/${function_name}"

distribution_id="$(aws cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='$distribution_comment'].Id | [0]" \
  --output text \
  --no-cli-pager)"
if [ "$distribution_id" = "None" ] || [ -z "$distribution_id" ]; then
  cache_disabled_id="$(aws cloudfront list-cache-policies \
    --type managed \
    --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='Managed-CachingDisabled'].CachePolicy.Id | [0]" \
    --output text \
    --no-cli-pager)"
  cache_optimized_id="$(aws cloudfront list-cache-policies \
    --type managed \
    --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='Managed-CachingOptimized'].CachePolicy.Id | [0]" \
    --output text \
    --no-cli-pager)"
  api_request_policy_id="$(aws cloudfront list-origin-request-policies \
    --type managed \
    --query "OriginRequestPolicyList.Items[?OriginRequestPolicy.OriginRequestPolicyConfig.Name=='Managed-AllViewerExceptHostHeader'].OriginRequestPolicy.Id | [0]" \
    --output text \
    --no-cli-pager)"
  for policy_id in "$cache_disabled_id" "$cache_optimized_id" "$api_request_policy_id"; do
    if [ -z "$policy_id" ] || [ "$policy_id" = "None" ]; then
      echo "Could not resolve a required AWS-managed CloudFront policy." >&2
      exit 1
    fi
  done

  config_file="$(mktemp)"
  trap 'rm -f "$config_file"' EXIT
  jq -n \
    --arg caller_reference "building-energy-week08-${instance_id}" \
    --arg origin_domain "$origin_dns" \
    --arg function_arn "$function_arn" \
    --arg cache_disabled_id "$cache_disabled_id" \
    --arg cache_optimized_id "$cache_optimized_id" \
    --arg api_request_policy_id "$api_request_policy_id" \
    --arg comment "$distribution_comment" '
    def trusted:
      {Enabled:false,Quantity:0,Items:[]};
    def methods($items; $cached):
      {Quantity:($items|length),Items:$items,
       CachedMethods:{Quantity:($cached|length),Items:$cached}};
    def origin($id; $port):
      {Id:$id,DomainName:$origin_domain,OriginPath:"",
       CustomHeaders:{Quantity:0,Items:[]},
       CustomOriginConfig:{
         HTTPPort:$port,HTTPSPort:443,OriginProtocolPolicy:"http-only",
         OriginSslProtocols:{Quantity:1,Items:["TLSv1.2"]},
         OriginReadTimeout:60,OriginKeepaliveTimeout:5
       },
       ConnectionAttempts:3,ConnectionTimeout:10,
       OriginShield:{Enabled:false}};
    {
      CallerReference:$caller_reference,
      Aliases:{Quantity:0,Items:[]},
      Origins:{Quantity:2,Items:[
        origin("web-origin";3001),
        origin("api-origin";8001)
      ]},
      DefaultCacheBehavior:{
        TargetOriginId:"web-origin",
        TrustedSigners:trusted,
        TrustedKeyGroups:trusted,
        ViewerProtocolPolicy:"redirect-to-https",
        AllowedMethods:methods(["GET","HEAD"];["GET","HEAD"]),
        SmoothStreaming:false,Compress:true,
        LambdaFunctionAssociations:{Quantity:0,Items:[]},
        FunctionAssociations:{Quantity:0,Items:[]},
        FieldLevelEncryptionId:"",
        CachePolicyId:$cache_optimized_id
      },
      CacheBehaviors:{Quantity:1,Items:[{
        PathPattern:"/api*",
        TargetOriginId:"api-origin",
        TrustedSigners:trusted,
        TrustedKeyGroups:trusted,
        ViewerProtocolPolicy:"redirect-to-https",
        AllowedMethods:methods(
          ["GET","HEAD","OPTIONS","PUT","PATCH","POST","DELETE"];
          ["GET","HEAD"]
        ),
        SmoothStreaming:false,Compress:true,
        LambdaFunctionAssociations:{Quantity:0,Items:[]},
        FunctionAssociations:{Quantity:1,Items:[{
          EventType:"viewer-request",FunctionARN:$function_arn
        }]},
        FieldLevelEncryptionId:"",
        CachePolicyId:$cache_disabled_id,
        OriginRequestPolicyId:$api_request_policy_id
      }]},
      Comment:$comment,
      PriceClass:"PriceClass_100",
      Enabled:true,
      ViewerCertificate:{CloudFrontDefaultCertificate:true},
      Restrictions:{GeoRestriction:{RestrictionType:"none",Quantity:0,Items:[]}},
      HttpVersion:"http2",
      IsIPV6Enabled:true
    }' > "$config_file"
  distribution_result="$(aws cloudfront create-distribution \
    --distribution-config "file://$config_file" \
    --output json \
    --no-cli-pager)"
  distribution_id="$(jq -r '.Distribution.Id' <<< "$distribution_result")"
  distribution_domain="$(jq -r '.Distribution.DomainName' <<< "$distribution_result")"
  echo "Created CloudFront distribution $distribution_id ($distribution_domain)."
else
  distribution_domain="$(aws cloudfront get-distribution \
    --id "$distribution_id" \
    --query 'Distribution.DomainName' \
    --output text \
    --no-cli-pager)"
  echo "Reusing existing CloudFront distribution $distribution_id ($distribution_domain)."
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
bash "$script_dir/update_cloudfront_origin.sh" "$instance_id" "$distribution_id"
echo "Waiting for CloudFront deployment; this can take several minutes."
aws cloudfront wait distribution-deployed --id "$distribution_id" --no-cli-pager
curl --fail --silent --show-error --retry 10 --retry-all-errors \
  --retry-delay 5 --output /dev/null "https://${distribution_domain}/"
curl --fail --silent --show-error --retry 10 --retry-all-errors \
  --retry-delay 5 --output /dev/null "https://${distribution_domain}/api/health"

rules_json="$(aws ec2 describe-security-group-rules \
  --region "$region" \
  --filters "Name=group-id,Values=$security_group_id" \
  --output json \
  --no-cli-pager)"
legacy_rule_ids="$(python3 -c '
import json, sys
rules = json.load(sys.stdin)["SecurityGroupRules"]
ports = {22, 3001, 8001}
print(" ".join(
    rule["SecurityGroupRuleId"] for rule in rules
    if not rule["IsEgress"] and rule.get("IpProtocol") == "tcp"
    and rule.get("FromPort") == rule.get("ToPort")
    and rule.get("FromPort") in ports
    and rule.get("CidrIpv4") == "210.181.166.4/32"
))
' <<< "$rules_json")"
if [ -n "$legacy_rule_ids" ]; then
  aws ec2 revoke-security-group-ingress \
    --region "$region" \
    --group-id "$security_group_id" \
    --security-group-rule-ids $legacy_rule_ids \
    --no-cli-pager >/dev/null
fi

echo "HTTPS web: https://${distribution_domain}"
echo "HTTPS API health: https://${distribution_domain}/api/health"
echo "EC2 origin hostname: ${origin_dns} (${origin_ip}; CloudFront-to-origin traffic uses HTTP; deploy_ec2.sh updates this after restart)."
echo "CloudFront origin-facing IPs are allowed on TCP 3001-8001; the app listens only on 3001 and 8001."
