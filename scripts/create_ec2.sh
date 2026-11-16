#!/usr/bin/env bash
set -euo pipefail

region="${AWS_REGION:-ap-northeast-2}"
instance_name="building-energy-week08"
security_group_name="building-energy-week08"

aws sts get-caller-identity --query Account --output text --no-cli-pager >/dev/null

existing_instance="$(aws ec2 describe-instances \
  --region "$region" \
  --filters "Name=tag:Name,Values=$instance_name" \
            "Name=instance-state-name,Values=pending,running,stopping,stopped" \
  --query 'Reservations[].Instances[].InstanceId | [0]' \
  --output text \
  --no-cli-pager)"
if [ "$existing_instance" != "None" ]; then
  echo "Instance $existing_instance already exists. Refusing to create a duplicate." >&2
  echo "Use scripts/deploy_ec2.sh $existing_instance to redeploy it." >&2
  exit 1
fi

vpc_id="$(aws ec2 describe-vpcs \
  --region "$region" \
  --filters Name=isDefault,Values=true \
  --query 'Vpcs[0].VpcId' \
  --output text \
  --no-cli-pager)"
if [ "$vpc_id" = "None" ] || [ -z "$vpc_id" ]; then
  echo "No default VPC found in $region. No resources were created." >&2
  exit 1
fi

subnet_id="$(aws ec2 describe-subnets \
  --region "$region" \
  --filters "Name=vpc-id,Values=$vpc_id" Name=default-for-az,Values=true \
  --query 'Subnets[0].SubnetId' \
  --output text \
  --no-cli-pager)"
if [ "$subnet_id" = "None" ] || [ -z "$subnet_id" ]; then
  echo "No default subnet found in VPC $vpc_id. No resources were created." >&2
  exit 1
fi

security_group_id="$(aws ec2 describe-security-groups \
  --region "$region" \
  --filters "Name=vpc-id,Values=$vpc_id" \
            "Name=tag:Name,Values=$security_group_name" \
            Name=tag:Purpose,Values=building-energy-week08 \
  --query 'SecurityGroups[0].GroupId' \
  --output text \
  --no-cli-pager)"
if [ "$security_group_id" = "None" ] || [ -z "$security_group_id" ]; then
  security_group_id="$(aws ec2 create-security-group \
    --region "$region" \
    --group-name "$security_group_name" \
    --description "Dedicated week 8 building energy demo; web/API ingress is managed by CloudFront setup" \
    --vpc-id "$vpc_id" \
    --tag-specifications "ResourceType=security-group,Tags=[{Key=Name,Value=$security_group_name},{Key=Purpose,Value=building-energy-week08}]" \
    --query GroupId \
    --output text \
    --no-cli-pager)"
fi

ami_id="$(aws ssm get-parameter \
  --region "$region" \
  --name /aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id \
  --query Parameter.Value \
  --output text \
  --no-cli-pager)"

client_token="$(python3 -c 'import uuid; print(uuid.uuid4())')"
instance_id="$(aws ec2 run-instances \
  --region "$region" \
  --client-token "$client_token" \
  --image-id "$ami_id" \
  --instance-type t3.small \
  --subnet-id "$subnet_id" \
  --security-group-ids "$security_group_id" \
  --associate-public-ip-address \
  --metadata-options HttpEndpoint=enabled,HttpTokens=required \
  --block-device-mappings '[{"DeviceName":"/dev/sda1","Ebs":{"VolumeSize":12,"VolumeType":"gp3","Encrypted":true,"DeleteOnTermination":true}}]' \
  --user-data file://scripts/ec2_bootstrap.sh \
  --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=$instance_name},{Key=Purpose,Value=building-energy-week08}]" \
                     "ResourceType=volume,Tags=[{Key=Name,Value=$instance_name},{Key=Purpose,Value=building-energy-week08}]" \
  --query 'Instances[0].InstanceId' \
  --output text \
  --no-cli-pager)"

echo "Created dedicated instance $instance_id with security group $security_group_id."
echo "No ingress rules were added. Run scripts/create_cloudfront.sh for HTTPS access."
echo "Wait for first-boot Docker installation and Compose build before checking the app."
