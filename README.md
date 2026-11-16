# 건물 난방·냉방 부하 예측기

**서비스 한 문장:** 건물 설계안의 구조와 창 조건을 입력해 UCI Energy Efficiency 시뮬레이션 데이터에 기반한 난방·냉방 부하 예측값을 비교해 보는 학습용 웹 서비스입니다. 주요 사용자는 건물 설계를 학습하거나 초기 설계안을 살펴보는 학생·기획자입니다. 결과는 실제 건물의 계량 에너지 사용량이나 설계 적합성 판정이 아닙니다.

BDG2 다음 시간 계량값과 ComStock 연간 에너지 예측은 같은 서비스 목표를 학습·시연하기 위한 **별도 데모**입니다. 데이터와 예측 대상, 단위가 UCI 기본 서비스와 다르므로 결과를 서로 직접 비교하지 않습니다.

구현 패턴은 교수님이 제공한 지하철 프로젝트에서 참고했지만, 데이터와 예측 대상은 UCI Energy Efficiency 데이터셋에 맞게 분리했습니다.

## 처음 실행하는 사람을 위한 빠른 시작 (Windows)

처음 프로젝트를 실행한다면 이 절차를 권장합니다. Docker Desktop이 Python·Node.js 패키지를 컨테이너 안에 설치하므로, 로컬에 Python이나 Node.js 개발 환경을 따로 구성할 필요가 없습니다. **AWS 계정이나 클라우드 권한도 필요하지 않습니다.** 아래 명령은 로컬 컴퓨터에서만 서비스를 실행하며 AWS 자원을 생성하지 않습니다.

### 1. 필요한 프로그램 설치

1. [Git for Windows](https://git-scm.com/download/win)을 설치합니다. 설치 중 별도 설정을 바꾸지 않아도 기본값으로 사용할 수 있습니다.
2. [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/)를 설치합니다. 설치가 끝나면 Docker Desktop을 실행하고, Docker가 실행 중이라는 표시가 나올 때까지 기다립니다. 설치 과정에서 WSL 2를 사용하라는 안내가 나오면 안내에 따라 설치한 뒤 컴퓨터를 다시 시작합니다.
3. Windows 시작 메뉴에서 **PowerShell**을 엽니다. 이후 명령은 별도 안내가 없는 한 PowerShell 창에 한 번에 한 줄씩 입력합니다.

### 2. 프로젝트 내려받기

PowerShell에서 아래 명령을 차례대로 실행합니다. 프로젝트를 저장할 위치는 예시로 `Documents`를 사용합니다.

```powershell
cd $HOME\Documents
git clone --branch feature/meter-models https://github.com/yokumi12/building-energy.git
cd building-energy
```

`git clone`은 프로젝트 파일을 컴퓨터로 복사하는 명령입니다. 다운로드가 끝나면 `cd building-energy`로 프로젝트 폴더에 들어갑니다. 이후 실행과 종료 명령은 이 폴더에서 입력해야 합니다.

### 3. 웹 화면과 API 실행

Docker Desktop이 실행 중인지 확인한 뒤, 프로젝트 폴더에서 다음을 실행합니다.

```powershell
docker compose up --build
```

첫 실행은 웹·API 이미지를 내려받고 빌드하므로 몇 분 걸릴 수 있습니다. PowerShell에 오류가 나오지 않고 서비스 로그가 계속 표시되면 창을 닫지 말고 브라우저에서 다음 주소를 엽니다.

- 서비스 화면: <http://localhost:3001>
- API 상태 확인: <http://localhost:8001/health> — 정상이라면 성공 응답을 반환합니다.
- API 사용 문서: <http://localhost:8001/docs>

API 문서는 요청을 직접 시험해 보는 페이지입니다. 일반 사용은 서비스 화면에서 시작하면 됩니다. 예측 모델 파일은 프로젝트에 포함되어 있으므로, 이 실행 경로에서는 데이터셋을 다시 내려받거나 모델을 다시 학습할 필요가 없습니다.

### 4. 실행 종료와 다음 실행

실행 로그가 표시되는 PowerShell 창에서 `Ctrl+C`를 눌러 서비스를 중지한 다음, 같은 프로젝트 폴더에서 아래 명령을 실행해 컨테이너를 정리합니다.

```powershell
docker compose down
```

나중에 다시 실행하려면 Docker Desktop을 먼저 켜고 PowerShell에서 프로젝트 폴더로 이동한 뒤 `docker compose up`을 실행합니다. 코드를 바꾼 뒤 변경 내용을 반영해야 할 때만 `docker compose up --build`를 사용합니다.

### 자주 막히는 경우

- **`docker`를 찾을 수 없다는 오류:** Docker Desktop 설치가 끝났는지 확인하고 PowerShell을 새로 연 뒤 다시 시도합니다.
- **Docker 엔진에 연결할 수 없다는 오류:** Docker Desktop을 실행하고 상태가 준비됨으로 바뀔 때까지 기다린 뒤 다시 실행합니다.
- **3001 또는 8001 포트를 사용할 수 없다는 오류:** 기존에 실행해 둔 프로젝트가 있는지 확인하고, 그 프로젝트의 터미널에서 `Ctrl+C`와 `docker compose down`을 실행합니다. 다른 앱이 포트를 쓰는 경우 해당 앱을 종료하거나 관리자에게 문의합니다.
- **화면은 열리지만 API가 응답하지 않음:** 두 컨테이너의 로그가 표시되는 PowerShell 창에 오류가 있는지 확인합니다. 종료 후 프로젝트 폴더에서 `docker compose up --build`로 다시 실행할 수 있습니다.
- **프로젝트 폴더를 찾을 수 없음:** clone할 때 사용한 경로(위 예시에서는 `$HOME\Documents\building-energy`)로 이동한 다음 명령을 실행합니다.

## 데이터셋

- 출처: UCI Energy Efficiency, `ENB2012_data.xlsx`
- 로컬 원본 파일: `data/raw/ENB2012_data.xlsx`
- 데이터: 768개 레코드, 입력 특성 8개, 예측 대상 2개
- 첫 번째 워크시트만 사용합니다. 통합 문서의 다른 시트는 비어 있습니다.
- 결측값: 0개, 완전히 중복된 행: 0개
- 예측 대상 값은 원본 데이터의 척도를 유지합니다. 원본 통합 문서에는 물리적 단위가 명시되어 있지 않습니다.
- 실제 건물의 계량 에너지 소비량이 아니라, 건물 설계를 시뮬레이션한 데이터셋입니다.

| 입력 이름 | 원본 변수 | 의미 |
|---|---|---|
| relative_compactness | X1 | 상대 컴팩트도 |
| surface_area | X2 | 표면적 |
| wall_area | X3 | 벽 면적 |
| roof_area | X4 | 지붕 면적 |
| overall_height | X5 | 전체 높이 |
| orientation | X6 | 방향 범주(2–5) |
| glazing_area | X7 | 유리 면적 |
| glazing_area_distribution | X8 | 유리 면적 분포 범주(0–5) |

예측 대상: `Y1` 난방 부하, `Y2` 냉방 부하

## 추가 실측 건물 데이터

2016~2017년의 시간별 냉수·온수·증기 계량값과 건물 메타데이터, 현장 기상 데이터를 포함하는 실제 운영 데이터셋을 `data/raw/bdg2/`에 별도로 저장합니다. 파일 정보, 출처 표기, 해석 시 주의사항은 [`data/raw/bdg2/README.md`](data/raw/bdg2/README.md)를 참고하세요.

BDG2는 UCI 설계 데이터 표나 현재 모델에 합쳐지지 않습니다. 시계열 계량값은 예측 대상이 다르고 현장에 따라 단위도 달라, 시간 정보를 고려하는 별도의 특성 및 평가 파이프라인이 필요합니다. 냉수는 냉방과 관련되고, 온수와 증기는 난방과 관련됩니다. 이를 UCI의 시뮬레이션 부하 예측 대상과 직접 비교하지 마세요.

## 데이터 준비 및 모델 학습 (선택)

일반적인 앱 실행에는 필요하지 않습니다. 학습 모델 파일은 저장소에 포함되어 있으므로, 모델을 새로 만들거나 학습 결과를 재현할 때만 실행합니다. 프로젝트 루트에서 개발용 직접 실행 안내에 따라 `.venv`를 만들고 활성화한 뒤 다음을 실행합니다. `data/raw/ENB2012_data.xlsx` 원본 파일도 필요합니다.

```powershell
python -m pip install -r api\requirements.txt
python scripts\prepare_data.py
python scripts\train.py
```

데이터 검증 결과는 `artifacts/data_quality.json`에 저장됩니다. 기준선 및 랜덤 포레스트 모델의 MAE, RMSE, R²는 `artifacts/metrics.json`에 저장됩니다. 평가는 거의 같은 설계가 학습 데이터와 시험 데이터에 무작위로 나뉘지 않도록, 결정론적 그룹 분할을 사용해 전체 건물 형상 그룹을 통째로 분리합니다.

## 개발용 직접 실행 (Docker 없이)

이 방법은 API와 웹 앱을 각각 실행하거나 코드를 수정하며 개발할 때 사용합니다. [Python 3.12](https://www.python.org/downloads/), [Node.js 22](https://nodejs.org/en/download), Git이 설치되어 있어야 합니다. 처음 실행하는 경우에는 위의 Docker 방법이 더 간단합니다.

### API 실행

PowerShell에서 프로젝트 루트 폴더로 이동한 뒤 가상 환경을 만들고 의존성을 설치합니다. 위의 빠른 시작 경로로 clone했다면 다음 명령으로 이동합니다. 다른 위치에 clone했다면 해당 경로로 이동합니다. 가상 환경은 이 프로젝트의 Python 패키지를 다른 프로젝트와 분리합니다.

```powershell
cd $HOME\Documents\building-energy
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r api\requirements.txt
python -m uvicorn app.main:app --app-dir api --reload --port 8001
```

명령을 실행한 PowerShell 창은 API가 동작하는 동안 열어 둡니다. API 문서는 `http://localhost:8001/docs`, 상태 확인은 `http://localhost:8001/health`입니다. PowerShell에서 가상 환경 활성화가 차단되면 다음 명령을 현재 사용자에 한해 실행한 후 다시 활성화합니다.

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### 웹 앱 실행

새 PowerShell 창을 열고 프로젝트 루트 폴더로 이동한 다음 웹 앱을 실행합니다. 위의 빠른 시작 경로로 clone했다면 `cd $HOME\Documents\building-energy`로 이동합니다. API 실행 창은 계속 켜 두어야 합니다.

다른 터미널에서 다음을 실행합니다.

```powershell
cd web
npm ci
npm run dev
```

웹 앱은 `http://localhost:3001`에서 열립니다. 각 서버를 종료할 때는 해당 서버의 PowerShell 창에서 `Ctrl+C`를 누릅니다.

## 화면 안내

한국어 화면은 원본 데이터의 입력 특성 8개를 건물 구조와 유리 조건으로 나누어 보여줍니다. 난방과 냉방은 각각 별도의 탭, 입력값, 결과를 사용합니다. 선택한 부하 결과만 표시되며, 탭을 바꾸어도 각 탭의 설계 입력값은 유지됩니다. 화면에는 BDG2 실측 계량값을 이용하는 별도의 데모도 있으며, 난방·냉방 예측 버튼을 각각 제공합니다. BDG2 결과와 UCI 설계 모델 결과를 섞지 않습니다. 각 UCI 입력 항목에서 허용되는 데이터 범위를 보여주고 API 상태도 확인합니다. UCI 결과 막대는 데이터셋의 0~50 범위에 맞춘 시각적 척도일 뿐이며, 원본 통합 문서에는 물리적 단위가 명시되어 있지 않습니다.

화면과 API는 교육용 프로토타입입니다. 프로젝트 코드는 GitHub 저장소에 공개되어 있습니다. 아래 로컬 실행 절차는 AWS 리소스를 생성하지 않습니다.

## Docker Compose로 실행

앞의 Windows 빠른 시작을 완료했다면 이 절을 다시 수행할 필요는 없습니다. 아래는 Docker를 사용할 수 있는 다른 운영체제에서도 동일한 프로젝트 구성을 실행하는 요약입니다.

Docker Desktop이 실행 중인 상태에서 프로젝트 루트 디렉터리에서 다음 명령을 실행합니다.

```powershell
docker compose up --build
```

- 웹 화면: `http://localhost:3001`
- API 상태 확인: `http://localhost:8001/health`
- API 문서: `http://localhost:8001/docs`

종료하려면 같은 디렉터리에서 `docker compose down`을 실행합니다. 모델 파일은 이미지에 포함되며, 원본 학습 데이터는 컨테이너 실행에 필요하지 않습니다.

## AWS CLI와 Docker Compose로 EC2 배포

이 절차는 인터넷에 서비스를 공개할 때만 필요합니다. 로컬에서 시험하려면 앞의 Docker 빠른 시작만 사용하세요. AWS 계정과 해당 리소스를 만들 권한이 필요하며 EC2, 저장 공간, CloudFront 사용 요금이 발생할 수 있습니다. AWS 콘솔에서 서울 리전(`ap-northeast-2`)을 선택한 뒤 CloudShell을 엽니다. 이미 전용 인스턴스가 있다면 `create_ec2.sh`를 다시 실행하지 말고 아래의 재실행 절차를 사용하세요.

새 담당자가 AWS 권한 확인부터 새 EC2/CloudFront 생성, 기능 검증, 재실행, 중지까지 진행하는 상세 절차는 [새 담당자를 위한 AWS 배포 인수 문서](./DEPLOYMENT_HANDOFF.md)를 참고하세요. 실제 다른 사람의 새 환경 배포와 리뷰는 별도로 수행해 완료 여부를 기록해야 합니다.

배포 대상은 기존 ECS·EC2 인프라와 분리된 전용 인스턴스 `building-energy-week08`입니다. 배포 스크립트는 이 이름 태그를 확인하며, 다른 인스턴스 ID가 지정되면 거부합니다. 웹·API 포트는 처음부터 인터넷에 열지 않고, CloudFront 구성 후 AWS 관리형 CloudFront origin-facing IP 목록에만 허용합니다. 브라우저는 CloudFront 기본 HTTPS 주소를 사용하므로 별도 도메인을 구매할 필요가 없습니다.

AWS 콘솔의 CloudShell에서 아래 절차를 실행합니다.

```bash
git clone --branch feature/meter-models https://github.com/yokumi12/building-energy.git
cd building-energy
export AWS_REGION=ap-northeast-2
bash scripts/create_ec2.sh
```

생성 스크립트는 AWS CLI 로그인 상태를 확인하고, 기본 VPC와 서브넷, Ubuntu 24.04 AMI를 조회합니다. 전용 보안 그룹, 암호화된 gp3 볼륨 12 GiB, `t3.small` 인스턴스를 생성하고 `scripts/ec2_bootstrap.sh`를 사용자 데이터로 전달합니다. 사용자 데이터는 Docker와 Compose를 설치해 `feature/meter-models`를 순차 빌드·실행하고, systemd 배포 서비스를 등록합니다. 부팅될 때마다 이 서비스가 같은 Compose 설정으로 브랜치의 최신 코드를 받아 다시 빌드합니다.

생성 스크립트가 출력한 인스턴스 ID를 기록합니다. 최초 부팅이 끝난 뒤 CloudFront를 만드는 명령을 실행합니다.

```bash
bash scripts/create_cloudfront.sh i-인스턴스ID
```

스크립트는 `Name=building-energy-week08`인 전용 인스턴스와 그 전용 보안 그룹만 확인합니다. EIP를 새로 할당하거나 다른 인스턴스의 주소를 재사용하지 않고, 현재 EC2 퍼블릭 DNS 호스트명(현재 퍼블릭 IPv4에 연결됨)을 CloudFront origin으로 설정합니다. 보안 그룹은 CloudFront 관리형 origin-facing prefix list에만 TCP 3001–8001 포트를 허용합니다(컨테이너는 3001과 8001에서만 수신). 관리형 목록을 사용하는 보안 그룹 규칙 수를 절약하기 위해 두 포트를 하나의 범위 규칙으로 묶었습니다. CloudFront 기본 HTTPS 인증서가 적용된 배포를 생성합니다. 웹 앱은 같은 HTTPS origin의 `/api` 경로로 API를 요청하며, CloudFront Function이 이 접두사를 제거해 FastAPI 경로로 전달합니다.

배포가 완료되면 스크립트가 출력한 `https://<distribution>.cloudfront.net` 주소를 휴대폰에서도 사용할 수 있습니다. API 확인 주소는 `https://<distribution>.cloudfront.net/api/health`입니다. 브라우저에서 CloudFront까지는 HTTPS이며, 사용자 도메인/인증서 없이 EC2 origin까지 TLS를 구성하지 않으므로 CloudFront와 EC2 사이 구간은 HTTP입니다.

CloudFront 요청에는 AWS 요금이 발생할 수 있습니다. EC2 중지·시작으로 퍼블릭 IPv4와 퍼블릭 DNS 호스트명이 바뀌면 `deploy_ec2.sh`가 CloudFront의 웹·API origin을 새 호스트명으로 갱신하고 배포가 완료될 때까지 기다린 뒤, HTTPS 웹과 API 상태를 확인합니다. 사용자가 공유하는 CloudFront HTTPS 주소는 유지되지만, 반복 배포 때 CloudFront 전파 시간만큼 더 기다려야 합니다.

### 중지한 EC2 다시 실행 또는 코드 재배포

실습 후 `stop_ec2.sh`로 EC2를 중지했다가 다시 사용할 때는 AWS 콘솔의 CloudShell을 열고 다음을 실행합니다. CloudShell의 서울 리전을 선택하고, 저장소를 아직 내려받지 않았다면 먼저 clone합니다.

```bash
git clone --branch feature/meter-models https://github.com/yokumi12/building-energy.git ~/building-energy
```

이미 저장소가 있다면 clone 명령은 건너뛰고, 아래 명령으로 재실행합니다.

```bash
cd ~/building-energy
export AWS_REGION=ap-northeast-2
bash scripts/deploy_ec2.sh i-인스턴스ID
```

`deploy_ec2.sh`는 `Name=building-energy-week08`인 전용 인스턴스만 대상으로 합니다. 인스턴스가 중지 상태면 시작하고, 실행 중이면 중지 후 다시 시작한 뒤 부팅 배포를 기다립니다. 매번 Docker Compose로 웹·API 이미지를 다시 빌드합니다. EC2 중지 후 시작 시 퍼블릭 IPv4와 DNS는 바뀔 수 있지만, 스크립트가 CloudFront의 웹·API origin을 새 DNS로 갱신하고 배포 상태 및 HTTPS 웹/API를 확인합니다. CloudFront 배포를 삭제하지 않는 한 사용자 사이트 주소는 유지되므로, 스크립트가 출력하는 기존 CloudFront HTTPS 주소로 접속하면 됩니다.

코드 변경을 배포하려면 먼저 GitHub의 `feature/meter-models` 브랜치에 push한 뒤 같은 명령을 실행합니다. 사이트가 이미 정상 작동 중이면 이 명령을 불필요하게 실행하지 마세요. 실행 중인 인스턴스도 재시작하여 서비스가 잠시 중단되고, EC2 실행 요금이 발생합니다.

실습 후에는 다음 명령으로 전용 인스턴스를 중지합니다.

```bash
bash scripts/stop_ec2.sh i-인스턴스ID
```

중지 중에는 컴퓨팅 비용이 멈추지만 EBS 볼륨은 남아 저장 비용이 발생할 수 있습니다. CloudFront 배포는 별도 정리 전까지 유지되며 요청량에 따른 요금이 발생할 수 있습니다. 이 스크립트들은 인스턴스, 볼륨 또는 CloudFront 배포를 삭제하지 않습니다.

## BDG2 계량값 모델 별도 학습

`data/raw/bdg2/README.md`에 안내된 파일을 내려받은 뒤 다음 명령을 실행합니다.

```powershell
python scripts\train_meter_models.py
```

이 스크립트는 익명화된 미국 내 한 사이트에서 조건을 충족한 건물 41곳을 대상으로, 다음 시간 계량값을 예측하는 회귀 모델을 난방·냉방별로 학습합니다.

- **예측 대상:** 냉방은 다음 시간의 냉수 계량값, 난방은 다음 시간의 증기 계량값입니다.
- **특성:** 같은 계량기의 이전 시간 값, 바닥 면적, 건물 용도입니다. 확장 반복에서는 24시간 및 168시간 전 계량값과 시각·요일·월 정보도 추가합니다.
- **반복 1:** 건물 구조 특성과 이전 시간 계량값을 사용하며 LinearRegression을 적용합니다.
- **반복 2:** 24시간·168시간 전 이력과 달력 특성을 추가하고 LinearRegression과 HistGradientBoosting을 비교합니다.

특성 및 모델 선택에는 별도의 검증용 건물과 날짜를 사용합니다. 최종 지표는 학습에서 제외한 건물 9곳과 시간순으로 마지막 30일을 사용해 계산합니다. R²와 MAE를 보고하고, 이전 계량값을 그대로 복사하는 기준선도 함께 비교합니다. R²는 분류 정확도가 아니며, 복잡한 모델이 기준선보다 성능이 낮을 수도 있습니다. 결과는 `artifacts/bdg2_meter_metrics.json`에 저장되고, 별도의 모델 묶음 파일은 `artifacts/bdg2_meter_models.joblib`입니다.

API는 `GET /meter-model/metadata`와 `POST /meter-model/predict/heating`, `POST /meter-model/predict/cooling`을 제공합니다. 사용 가능한 건물 목록 중 하나를 선택하려면 `building_id` 쿼리 매개변수를 사용합니다. 이 엔드포인트는 해당 건물의 다음으로 제공 가능한 한 시간 값을 예측하며, 데이터 이력은 2017년에 끝납니다. 재현 가능한 오프라인 시연이며 실시간 예측이나 한국 건물 예측이 아닙니다. BDG2와 UCI의 예측 대상은 합쳐지지 않습니다.

## ComStock 연간 에너지 모델 별도 학습

ComStock은 세 번째로 분리된 예측 대상 정의입니다. 연간 난방·냉방 용도별 시뮬레이션 에너지 소비량을 kWh 단위로 예측합니다. UCI의 설계 난방·냉방 부하와는 다르며, 실제 계량 에너지 소비량도 아닙니다. 특성 반복 실험은 기준 시나리오(`upgrade == 00`)의 건물 행만 사용하고, 고유 건물 ID를 기준으로 그룹을 나눕니다. 검증 데이터에서 건물 구조만 사용한 특성과 건물 구조·HVAC/연료·에너지 코드·온도조절기·운영 시간을 사용한 특성을 비교합니다. 선택한 모델은 학습 및 검증 데이터를 합쳐 다시 학습한 뒤, 학습에서 제외한 시험 건물로 한 번 평가합니다.

`data/raw/comstock/README.md`에 안내된 파일을 내려받은 뒤 다음을 실행합니다.

```powershell
python scripts\train_comstock_models.py
```

스크립트는 `artifacts/comstock_energy_metrics.json`과 `artifacts/comstock_energy_models.joblib`을 생성합니다. 현재 분할에서는 확장 특성 반복을 사용했을 때 검증 R²가 난방은 0.5000에서 0.8102로, 냉방은 0.7932에서 0.8979로 향상됩니다. 학습에서 제외한 시험 데이터의 결과는 다음과 같습니다.

| 연간 예측 대상 | 시험 R² | MAE (kWh) | RMSE (kWh) |
|---|---:|---:|---:|
| 난방 | 0.8499 | 41,751.50 | 122,054.10 |
| 냉방 | 0.8916 | 22,212.63 | 78,539.92 |

R²는 정확도가 아닙니다. 난방은 목표치 0.85에 약간 못 미치고, 냉방은 이를 넘습니다. 이 결과는 미국의 모델링된 건물 재고에 대한 연간 에너지 소비량을 설명할 뿐, 한국 건물에서의 성능을 입증하지 않습니다. 기존 UCI 부하 API는 별도의 서비스이므로 그 예측값을 연간 kWh로 해석하지 마세요.

API의 `GET /comstock/metadata`는 지원되는 특성 이름·범위·범주·기본값 및 시험 지표를 제공합니다. 모든 특성값을 `values` 객체에 담아 `POST /comstock/predict/heating` 또는 `POST /comstock/predict/cooling`으로 보내면, 각 응답에서 연간 예상 kWh와 해당 시험 지표를 반환합니다. 웹 페이지에는 한국어 입력 항목과 별도의 난방·냉방 예측 버튼이 있는 ComStock 전용 영역이 있습니다. 이 API는 생성된 ComStock 모델 묶음 파일이 필요합니다. 파일이 없으면 다른 데이터셋의 모델로 대체하지 않고 HTTP 503을 반환합니다.

## 한계

- 모델은 시뮬레이션된 설계 사례로 학습되었습니다. 실제 공과금 사용량을 예측하거나 실제 환경에서의 성능을 보장하지 않습니다.
- 입력값은 원본 데이터셋의 범위로 제한되며, 범위를 벗어난 외삽은 의도적으로 거부합니다.
- 난방과 냉방은 서로 분리된 회귀 예측 대상입니다. 예측을 해석하기 전에 모델 지표를 확인해야 합니다.
- 추가 BDG2 계량 모델은 익명화된 미국 내 한 사이트의 여러 건물을 사용한 별도 시연입니다. 계량 단위는 단정하지 않으며, 성능을 다른 환경에 일반화하면 안 됩니다.
- 이 로컬 프로젝트는 배포하거나 AWS 리소스를 생성하지 않습니다.
