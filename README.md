# 건물 난방·냉방 부하 예측기

건물 설계 초기 단계에서 난방·냉방 부하를 함께 비교해 보려는 기획자와 학습자를 위한 교육용 MLOps 서비스입니다. 사용자는 상대 컴팩트도, 표면적·벽면적·지붕면적, 전체 높이, 방향, 유리 면적과 분포 등 8가지 건물 설계값을 입력하고, UCI Energy Efficiency 시뮬레이션 데이터로 학습한 모델에서 난방 부하와 냉방 부하 예측값을 받습니다. 이 결과는 실제 건물의 계량 에너지 사용량이나 설계 적합성 판정이 아닙니다.

구현 패턴은 교수님이 제공한 지하철 프로젝트에서 참고했지만, 데이터와 예측 대상은 UCI Energy Efficiency 데이터셋에 맞게 분리했습니다.

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

## 데이터 준비 및 모델 학습

이 디렉터리에서 다음 명령을 실행합니다.

```powershell
python -m pip install -r api\requirements.txt
python scripts\prepare_data.py
python scripts\train.py
```

데이터 검증 결과는 `artifacts/data_quality.json`에 저장됩니다. 기준선 및 랜덤 포레스트 모델의 MAE, RMSE, R²는 `artifacts/metrics.json`에 저장됩니다. 평가는 거의 같은 설계가 학습 데이터와 시험 데이터에 무작위로 나뉘지 않도록, 결정론적 그룹 분할을 사용해 전체 건물 형상 그룹을 통째로 분리합니다.

## API 실행

```powershell
python -m uvicorn app.main:app --app-dir api --reload --port 8001
```

API 문서: `http://localhost:8001/docs`

## 웹 앱 실행

다른 터미널에서 다음을 실행합니다.

```powershell
cd web
npm ci
npm run dev
```

웹 앱: `http://localhost:3001`

## 화면 안내

한국어 화면은 원본 데이터의 입력 특성 8개를 건물 구조와 유리 조건으로 나누어 보여줍니다. 난방과 냉방은 각각 별도의 탭, 입력값, 결과를 사용합니다. 선택한 부하 결과만 표시되며, 탭을 바꾸어도 각 탭의 설계 입력값은 유지됩니다. 화면에는 BDG2 실측 계량값을 이용하는 별도의 데모도 있으며, 난방·냉방 예측 버튼을 각각 제공합니다. BDG2 결과와 UCI 설계 모델 결과를 섞지 않습니다. 각 UCI 입력 항목에서 허용되는 데이터 범위를 보여주고 API 상태도 확인합니다. UCI 결과 막대는 데이터셋의 0~50 범위에 맞춘 시각적 척도일 뿐이며, 원본 통합 문서에는 물리적 단위가 명시되어 있지 않습니다.

화면과 API는 교육용 프로토타입입니다. 프로젝트 코드는 GitHub 저장소에 공개되어 있습니다. 아래 로컬 실행 절차는 AWS 리소스를 생성하지 않습니다.

## Docker Compose로 실행

Docker Desktop이 실행 중인 상태에서 프로젝트 루트 디렉터리에서 다음 명령을 실행합니다.

```powershell
docker compose up --build
```

- 웹 화면: `http://localhost:3001`
- API 상태 확인: `http://localhost:8001/health`
- API 문서: `http://localhost:8001/docs`

종료하려면 같은 디렉터리에서 `docker compose down`을 실행합니다. 모델 파일은 이미지에 포함되며, 원본 학습 데이터는 컨테이너 실행에 필요하지 않습니다.

## AWS CLI와 Docker Compose로 EC2 배포

배포 대상은 기존 ECS·EC2 인프라와 분리된 새 인스턴스입니다. 스크립트는 `building-energy-week08` 이름 태그를 사용하고, 기존 인스턴스의 ID가 지정되면 거부합니다. 전용 보안 그룹에는 TCP 3001(웹)과 8001(API)만 사용자가 지정한 단일 IPv4 CIDR에 허용하며 SSH는 열지 않습니다.

AWS 콘솔의 CloudShell에서 아래 절차를 실행합니다. `ALLOWED_CIDR`에는 접속할 컴퓨터의 공인 IPv4 주소에 `/32`를 붙여 넣으세요(예: `203.0.113.10/32`). CloudShell의 주소가 아니라 브라우저로 서비스에 접속할 컴퓨터의 주소여야 합니다.

```bash
git clone --branch feature/meter-models https://github.com/yokumi12/building-energy.git
cd building-energy
export AWS_REGION=ap-northeast-2
export ALLOWED_CIDR=내_공인_IP/32
bash scripts/create_ec2.sh
```

생성 스크립트는 AWS CLI 로그인 상태를 확인하고, 기본 VPC와 서브넷, Ubuntu 24.04 AMI를 조회합니다. 전용 보안 그룹, 암호화된 gp3 볼륨 12 GiB, `t3.small` 인스턴스를 생성하고 `scripts/ec2_bootstrap.sh`를 사용자 데이터로 전달합니다. 사용자 데이터는 Docker와 Compose를 설치해 `feature/meter-models`를 순차 빌드·실행하고, systemd 배포 서비스를 등록합니다. 부팅될 때마다 이 서비스가 같은 Compose 설정으로 브랜치의 최신 코드를 받아 다시 빌드합니다.

생성 스크립트가 출력한 인스턴스 ID를 기록합니다. 초기 부팅이 끝나면 CloudShell에서 다음을 실행해 재배포합니다.

```bash
bash scripts/deploy_ec2.sh i-인스턴스ID
```

이 명령은 AWS CLI로 `Name=building-energy-week08`인 인스턴스만 확인하고 중지 후 시작하여 부팅 배포를 다시 실행합니다. 스크립트는 매번 Docker Compose로 웹·API 이미지를 재빌드합니다. 코드 변경은 GitHub의 `feature/meter-models` 브랜치에 먼저 push해야 다음 실행에서 반영됩니다. 인스턴스가 정상화되면 브라우저에서 웹 `http://<출력된-퍼블릭-IPv4>:3001`과 API `http://<출력된-퍼블릭-IPv4>:8001/health`를 확인합니다. 중지·시작하면 공인 IPv4가 바뀔 수 있으므로 재배포 스크립트가 출력한 주소를 사용하세요.

실습 후에는 다음 명령으로 전용 인스턴스를 중지합니다.

```bash
bash scripts/stop_ec2.sh i-인스턴스ID
```

중지 중에는 컴퓨팅 비용이 멈추지만 EBS 볼륨은 남아 저장 비용이 발생할 수 있습니다. 인스턴스를 실행하면 컴퓨팅 및 공인 IPv4 비용이 발생할 수 있습니다. 이 스크립트들은 인스턴스나 볼륨을 삭제하지 않습니다.

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
