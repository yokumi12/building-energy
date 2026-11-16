# 새 담당자를 위한 AWS 배포 인수 문서

이 문서는 프로젝트를 처음 받은 담당자가 **자신의 AWS 계정과 승인된 권한으로** 서울 리전에 새 EC2와 CloudFront를 만들고, 웹·API를 확인한 뒤 EC2를 중지하는 절차입니다. 명령은 AWS CloudShell에서 실행합니다. Windows PowerShell은 로컬 Docker 실행에 사용하고, 이 배포 스크립트는 Bash 기반이므로 Windows PowerShell에서 직접 실행하지 않습니다.

로컬에서만 실행하려면 [README의 Windows 빠른 시작](./README.md#처음-실행하는-사람을-위한-빠른-시작-windows)을 이용하세요. AWS 배포는 공개 서비스에만 필요하며 AWS 요금이 발생할 수 있습니다.

## 1. 서비스와 배포 범위 이해하기

**서비스 한 문장:** 건물 설계안의 구조와 창 조건을 입력해 UCI Energy Efficiency 시뮬레이션 데이터에 기반한 난방·냉방 부하 예측값을 비교해 보는 학습용 웹 서비스입니다.

- 주요 사용자: 건물 설계를 학습하거나 초기 설계안을 살펴보는 학생·기획자
- 기본 웹 화면: UCI 설계 조건 8개로 난방 또는 냉방 부하를 예측합니다.
- 별도 데모: BDG2는 미국 과거 계량 데이터의 다음 시간 냉수·증기 값, ComStock은 미국 건물 시뮬레이션의 연간 에너지 값을 예측합니다. 이 두 데모는 기본 UCI 모델과 데이터·타깃·단위가 다릅니다.
- 예측은 교육용 추정값입니다. 실제 건물 계량 사용량, 한국 건물의 실시간 예측, 에너지 절감량, 설계 적합성 판정으로 해석하지 않습니다.

## 2. 필요한 계정·권한·도구

### AWS 계정과 사전 승인

1. 프로젝트 관리자가 지정한 AWS 계정에 로그인합니다. 개인 계정이라면 결제 수단과 예산 알림을 먼저 확인합니다.
2. AWS 콘솔 상단에서 리전을 **아시아 태평양(서울), `ap-northeast-2`**로 선택합니다.
3. 콘솔에서 **CloudShell**을 엽니다. 이 문서의 명령은 CloudShell Bash 터미널에 입력합니다. CloudShell의 AWS CLI 세션 자격 증명을 사용하므로 액세스 키를 명령이나 파일에 입력하지 않습니다.
4. 계정 관리자에게 아래 권한이 승인되었는지 확인합니다. 조직의 SCP, 권한 경계, 서비스 쿼터 또는 교육용 `StudentGuardrails`가 작업을 막을 수 있습니다. 이런 제한을 우회하지 말고 AWS 관리자에게 프로젝트·리전·인스턴스 종류를 알리고 요청합니다.

### 스크립트가 사용하는 AWS 권한

아래는 저장소의 `scripts/create_ec2.sh`, `create_cloudfront.sh`, `deploy_ec2.sh`, `stop_ec2.sh`, `update_cloudfront_origin.sh`가 사용하는 작업 기준입니다. 관리자에게 이 작업을 허용하는 프로젝트 전용 권한을 요청합니다. `List`/`Describe` 계열은 AWS 정책에서 리소스 ARN 제한을 지원하지 않아 `Resource: "*"`가 필요한 경우가 있습니다. 생성·수정 작업은 가능하면 이 프로젝트의 인스턴스·보안 그룹·CloudFront 함수/배포와 서울 리전에 범위를 좁혀야 합니다.

- **확인 및 로그인:** `sts:GetCallerIdentity`
- **EC2 조회·생성·중지/시작:** `ec2:DescribeInstances`, `ec2:DescribeInstanceStatus`, `ec2:DescribeVpcs`, `ec2:DescribeSubnets`, `ec2:DescribeSecurityGroups`, `ec2:DescribeSecurityGroupRules`, `ec2:DescribeManagedPrefixLists`, `ec2:CreateSecurityGroup`, `ec2:CreateTags`, `ec2:RunInstances`, `ec2:AuthorizeSecurityGroupIngress`, `ec2:RevokeSecurityGroupIngress`, `ec2:StopInstances`, `ec2:StartInstances`
- **Ubuntu AMI ID 조회:** `ssm:GetParameter` (경로 `/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id`)
- **CloudFront 함수와 배포 조회·생성·갱신:** `cloudfront:ListFunctions`, `cloudfront:CreateFunction`, `cloudfront:DescribeFunction`, `cloudfront:PublishFunction`, `cloudfront:ListDistributions`, `cloudfront:ListCachePolicies`, `cloudfront:ListOriginRequestPolicies`, `cloudfront:CreateDistribution`, `cloudfront:GetDistribution`, `cloudfront:GetDistributionConfig`, `cloudfront:UpdateDistribution`

스크립트는 EC2 인스턴스 프로파일이나 IAM 역할을 인스턴스에 전달하지 않으므로 `iam:PassRole`은 사용하지 않습니다. 사용자 정책에 위 작업이 있어도 조직 정책이나 서비스 제한이 우선 적용될 수 있습니다. `AccessDenied`, quota 또는 guardrail 메시지를 받으면 그 명령을 반복하거나 우회하지 말고 메시지와 작업을 관리자에게 전달합니다.

### CloudShell 도구

CloudShell에서 다음을 확인합니다. 이 프로젝트의 스크립트는 AWS CLI, Git, `curl`, `jq`, `python3`를 사용합니다. CloudShell에 없는 도구가 있거나 AWS CLI가 인증되지 않으면 진행하지 말고 관리자에게 확인합니다.

```bash
aws --version
git --version
curl --version
jq --version
python3 --version
aws sts get-caller-identity
```

마지막 명령의 계정 ID와 ARN이 배포할 계정·사용자인지 확인합니다. 예상한 계정이 아니면 이후 명령을 실행하지 않습니다.

## 3. 저장소 준비 및 브랜치 확인

CloudShell에서 프로젝트 브랜치를 내려받습니다. 이미 `~/building-energy`가 있다면 `git clone` 대신 그 폴더에서 `git status --short`와 `git pull --ff-only`를 확인합니다. 미커밋 변경이 있으면 덮어쓰지 말고 담당자와 먼저 확인합니다.

```bash
git clone --branch feature/meter-models https://github.com/yokumi12/building-energy.git ~/building-energy
cd ~/building-energy
git status --short
git branch --show-current
```

브랜치가 `feature/meter-models`인지 확인합니다. 스크립트는 이 브랜치를 EC2 부팅 때 받아 Docker Compose로 빌드합니다. 기본 UCI·BDG2·ComStock 모델 파일은 저장소의 `artifacts/`에 포함되어 있으므로 일반적인 배포를 위해 데이터를 별도 다운로드하거나 재학습할 필요가 없습니다.

## 4. 전용 EC2 만들기

리전을 이 CloudShell 세션에 명시하고, 인스턴스 생성 스크립트를 실행합니다.

```bash
export AWS_REGION=ap-northeast-2
bash scripts/create_ec2.sh
```

성공하면 `building-energy-week08` 이름 태그가 있는 전용 인스턴스 ID가 출력됩니다. 그 ID를 별도 기록합니다. 이 스크립트는 중복 인스턴스 생성을 거부합니다. 이름이 같은 인스턴스가 이미 있다는 메시지가 나오면 새 인스턴스를 만들지 말고 8절의 기존 인스턴스 재실행 절차를 사용합니다.

스크립트는 기본 VPC/서브넷, Ubuntu 24.04, `t3.small`, 암호화된 gp3 EBS 12 GiB를 사용합니다. 인스턴스는 시작 시 Docker를 설치하고 저장소를 받아 웹/API 컨테이너를 빌드합니다. SSH(22)나 웹/API 포트를 모든 인터넷 주소에 공개하지 않습니다.

AWS 콘솔의 EC2 인스턴스 화면에서 새 인스턴스의 상태가 **실행 중**이고 시스템 상태 검사도 통과하는지 기다립니다. 부팅과 첫 이미지 빌드에는 몇 분이 걸릴 수 있습니다. 아직 시작 중이면 다음 단계로 진행하지 않습니다.

## 5. CloudFront HTTPS 배포 연결

인스턴스 ID를 실제 출력값으로 바꾸어 실행합니다. 꺾쇠 괄호는 입력하지 않습니다.

```bash
bash scripts/create_cloudfront.sh i-실제인스턴스ID
```

이 스크립트는 전용 보안 그룹에 CloudFront origin-facing 주소만 TCP 3001–8001 포트로 허용하고, `/api` 경로를 API origin에 전달하는 CloudFront Function과 HTTPS CloudFront 배포를 설정합니다. 완료 시 출력되는 `HTTPS web` 주소가 공유할 사이트 주소입니다. `HTTPS API health`도 확인을 위해 기록합니다.

CloudFront가 만든 HTTPS 주소는 같은 CloudFront 배포를 유지하는 동안 계속 사용됩니다. EC2를 중지·시작하면 EC2 퍼블릭 IP/DNS가 바뀔 수 있지만, 8절의 스크립트가 두 CloudFront origin을 갱신합니다. CloudFront 요청과 실행 중 EC2에는 요금이 발생할 수 있습니다. EC2를 중지해도 EBS 저장 공간과 CloudFront 배포는 남아 각각 요금이 발생할 수 있습니다.

**첫 실행이 상태 검사에 실패한 경우:** 배포 생성과 CloudFront 전파가 첫 부팅보다 먼저 끝나면 HTTPS 점검이 실패할 수 있습니다. CloudFront 배포를 지우지 말고 부팅 완료를 기다린 뒤 같은 `create_cloudfront.sh` 명령을 다시 실행합니다. 스크립트는 기존 `building-energy-week08` 배포를 찾아 재사용합니다. 계속 실패하면 아래 검증·문제 해결 절차를 따릅니다.

## 6. 배포가 실제로 동작하는지 확인

아래 `<배포도메인>`을 스크립트가 출력한 호스트명으로 바꾸어 CloudShell에서 실행합니다. `https://`는 명령에 포함되어 있습니다.

```bash
export SITE_URL="https://<배포도메인>"
curl --fail --show-error --silent --output /dev/null \
  --write-out 'web HTTP %{http_code}\n' "$SITE_URL/"
curl --fail --show-error --silent "$SITE_URL/api/health"
```

정상 기준:

1. 첫 요청이 HTML을 반환하고 브라우저에서 사이트 화면이 열립니다.
2. 건강 확인 요청이 HTTP 성공을 반환하고 JSON에 `"status":"ok"`가 표시됩니다.
3. 브라우저에서 사이트에 입력된 초기 설계 조건으로 난방 예측과 냉방 예측을 각각 실행할 수 있습니다.
4. 화면의 안내에 UCI 시뮬레이션 기반 교육용 추정값이며 실제 계량 사용량/설계 적합성 판정이 아니라는 점이 표시됩니다.

API 요청을 직접 확인하고 싶다면 동일한 화면 origin을 통해 예측 요청을 보냅니다. 아래 응답에서 `prediction_id`, `model_version`, `heating_load`, `cooling_load`, `disclaimer`가 있는지 확인합니다. 값은 재현 가능한 입력에 대한 모델 출력이지 실측 정답이 아닙니다.

```bash
curl --fail --show-error --silent \
  -H 'Content-Type: application/json' \
  -d '{"relative_compactness":0.9,"surface_area":563.5,"wall_area":318.5,"roof_area":122.5,"overall_height":7.0,"orientation":2,"glazing_area":0.1,"glazing_area_distribution":1}' \
  "$SITE_URL/api/predict?target=heating"
```

기본 UCI 모델의 학습 평가 결과는 배포 확인과 별개입니다. 건강 확인만 성공했다고 예측 요청, 웹 화면 또는 ML 모델의 품질까지 검증된 것은 아닙니다.

## 7. 문제 해결과 로그의 범위

- **`AccessDenied`:** 오류에 나온 AWS 작업 이름과 리전을 복사해 계정 관리자에게 권한을 요청합니다. 제한을 우회하거나 다른 리소스를 지정하지 않습니다.
- **기본 VPC/서브넷 없음:** `create_ec2.sh`는 기본 VPC를 자동 생성하지 않습니다. AWS 관리자에게 승인된 네트워크 구성을 요청하고 기존 스크립트가 새 VPC를 임의로 만들지 않도록 합니다.
- **인스턴스가 이미 존재함:** `create_ec2.sh`를 다시 실행하지 않습니다. 해당 ID가 전용 `building-energy-week08` 인스턴스인지 콘솔에서 확인하고 8절을 사용합니다.
- **사이트/API 점검 실패:** EC2 상태 검사와 CloudFront 배포 상태를 확인합니다. 한 번 실패했다면 몇 분 기다린 후 `create_cloudfront.sh`를 다시 실행할 수 있습니다. 반복 실패 시 인스턴스 ID, CloudFront 도메인, 명령의 오류 내용을 관리자/담당자에게 보냅니다.
- **부팅 로그:** EC2 콘솔에서 인스턴스를 선택하고 **작업 → 모니터링 및 문제 해결 → 시스템 로그 가져오기(Get system log)**를 확인할 수 있습니다. CLI를 사용할 경우 정책상 허용되면 `aws ec2 get-console-output --region "$AWS_REGION" --instance-id i-실제인스턴스ID --latest --output text`를 실행합니다. 이 명령을 쓰는 사용자에게는 `ec2:GetConsoleOutput` 권한이 추가로 필요할 수 있습니다.

현재 `ec2_bootstrap.sh`는 CloudWatch Agent나 Systems Manager 인스턴스 프로파일을 설정하지 않으며 SSH 인바운드도 열지 않습니다. 따라서 새 EC2의 Docker 로그를 CloudWatch에서 볼 수 있다고 가정하지 마세요. 요청/예측 이벤트는 API 표준 출력으로 기록되지만, 지속적인 원격 로그 확인은 별도 승인된 모니터링 구성이 필요합니다. 이를 위해 임의로 SSH 포트를 공개하거나 인스턴스에 비밀 키를 저장하지 않습니다.

## 8. 기존 EC2 다시 시작 또는 코드 변경 배포

사이트가 정상 동작 중이고 코드를 바꿀 계획이 없다면 재배포하지 않습니다. 아래 스크립트는 대상 인스턴스가 이미 실행 중이어도 **중지 후 다시 시작**하여 잠시 서비스 중단을 일으킵니다.

1. CloudShell을 열고 서울 리전을 선택합니다.
2. 저장소가 없으면 3절의 `git clone`을 실행합니다. 기존 폴더라면 변경 사항이 없는지 확인한 후 다음을 실행합니다.

```bash
cd ~/building-energy
git status --short
git pull --ff-only origin feature/meter-models
export AWS_REGION=ap-northeast-2
```

3. 기록해 둔 인스턴스 ID를 넣어 재배포합니다.

```bash
bash scripts/deploy_ec2.sh i-실제인스턴스ID
```

이 스크립트는 대상 이름 태그를 검증하고 EC2를 시작/재시작한 뒤, CloudFront origin을 현재 EC2 DNS로 갱신하고 HTTPS 웹/API 상태를 확인합니다. 완료 출력에 나온 기존 CloudFront 주소를 사용합니다. 코드 변경은 먼저 `feature/meter-models` 브랜치에 반영되어 있어야 합니다.

## 9. 실습 후 EC2 중지

실행 중인 EC2가 필요하지 않으면 비용을 줄이기 위해 CloudShell에서 다음을 실행합니다. `create_ec2.sh` 때 기록한 실제 인스턴스 ID를 사용합니다.

```bash
cd ~/building-energy
export AWS_REGION=ap-northeast-2
bash scripts/stop_ec2.sh i-실제인스턴스ID
```

이 명령은 전용 인스턴스만 확인한 뒤 중지합니다. 인스턴스와 EBS, CloudFront 배포를 삭제하지 않습니다. 중지 중에도 EBS 저장 공간과 CloudFront 요청 비용이 발생할 수 있습니다. 이 저장소에는 이 인프라를 완전히 삭제하는 자동화 스크립트가 없습니다. 리소스를 삭제해야 한다면 과금·데이터·팀 소유권을 확인한 뒤 AWS 관리자와 별도로 계획합니다.

## 10. 새 담당자 인수 확인표

현재 작업은 혼자 진행하므로 새 AWS 환경에서의 독립 인수 배포와 별도 새 환경 검증은 이번 범위에서 제외합니다. 아래처럼 범위에 포함되는 작업과 제외 작업을 구분하며, 제외 항목을 미완료 작업으로 계산하지 않습니다.

| 확인 항목 | 완료 조건 | 상태 |
|---|---|---|
| 문서로 신규 담당자 배포 절차 준비 | AWS 권한 안내부터 실행·검증·중지까지 기록 | 완료 |
| 새 담당자의 독립 실행 | 타인이 문서만 보고 신규 배포를 수행 | 범위 제외 |
| 완전히 새로운 AWS 환경 검증 | 새 계정/환경에 별도 자원을 만들어 재검증 | 범위 제외 |
| 팀원 리뷰 | PR의 문서·구현 변경을 팀원이 검토 | 미수행 |

배포 절차 문서화와 코드 수준 점검은 수행했지만, 이번 작업에서 새 AWS 자원을 생성해 재배포하지는 않았습니다. 따라서 문서에 적힌 신규 환경 절차의 실제 실행 검증은 범위 밖입니다. PR 팀원 리뷰는 별도 항목이며 아직 수행되지 않았습니다.
