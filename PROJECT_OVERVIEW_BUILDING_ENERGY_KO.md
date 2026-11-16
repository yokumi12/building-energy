# 우리 팀 프로젝트: 건물 냉난방 예측

## 프로젝트를 한 문장으로

**건물의 구조·설계 조건을 입력하면 난방 부하와 냉방 부하를 예측해 설계안을 비교할 수 있도록 돕는 교육용 웹 서비스**입니다.

> 주제는 **건물 냉난방 예측**입니다. 교수님 시범 `demo_subway`와 혼동하지 않습니다. 지하철 혼잡도 예측은 교수님 예시이고, 우리 프로젝트의 도메인은 건물 에너지입니다.

## 사용자가 얻는 것

- 사용자: 건물 설계안을 검토하거나 비교하는 에너지 담당자·학생
- 사용 상황: 설계 입력을 바꿔가며 난방·냉방 관련 예측값을 확인
- 기본 서비스 출력: UCI Energy Efficiency 데이터의 설계 난방부하와 냉방부하
- 웹 화면: 건물 조건 입력 폼, 난방/냉방 탭, 예측 결과와 데이터 한계 안내

서비스에서 사용하는 “부하”, “연간 에너지 사용량”, “다음 시간 계량값”은 서로 다른 예측 대상입니다. 사이트에는 이들이 별도 모델 섹션으로 존재하며 수치나 단위를 서로 바꾸어 해석하지 않습니다.

## 세 가지 데이터·예측 흐름

프로젝트 안에 건물 에너지와 관련한 세 가지 흐름이 있습니다. 모두 같은 문제를 푸는 하나의 모델이 아니라, 타깃과 데이터 성격이 달라 분리해 유지합니다.

| 흐름 | 사용 목적과 입력 | 예측 타깃 | 시험 결과 | 핵심 한계 |
|---|---|---|---|---|
| **기본 UCI 설계부하 모델** | 건물 형태·면적·높이·방향·창 조건 8개 | `Y1` 난방부하, `Y2` 냉방부하 | 난방 R² 0.8456, 냉방 R² 0.7019 | 시뮬레이션 설계 사례 768행. 원본에 물리 단위가 명시되지 않으며 실제 계량 사용량이 아님 |
| **BDG2 계량 시계열 데모** | 직전/과거 계량값, 면적, 건물 용도, 일부 시간 특성 | 다음 시간 냉수(chilled water)·증기(steam) 계량값 | 9개 미사용 건물·마지막 30일 시험: 냉방 R² 0.8888, 난방 R² 0.9296 | 미국 한 익명 사이트의 2016–2017 자료. 단위·계량 관례가 불명확하고, 직전값 기준선이 모델보다 MAE가 낮음 |
| **ComStock 연간 에너지 모델** | 건물 구조, 유형, 미국 기후·주, HVAC·연료·설정온도·운영시간 등 | 연간 난방 kWh, 연간 냉방 kWh | 미사용 건물 시험: 난방 R² 0.8499, 냉방 R² 0.8916 | 미국 건물 재고 시뮬레이션 결과이지 실측값이나 한국 건물 평가가 아님 |

### 1) 기본 UCI 설계부하 모델

- 데이터: UCI Energy Efficiency `ENB2012_data.xlsx`
- 크기: 768행, 입력 8개, 타깃 2개
- Features: 상대 컴팩트도, 표면적, 벽면적, 지붕면적, 높이, 방향, 창면적, 창 분포
- Labels: `Y1` 난방부하, `Y2` 냉방부하
- 모델: `RandomForestRegressor`
- 평가: 형상 중복 변형이 train/test에 섞이지 않도록 건물 geometry 그룹 분할, train 576행 / test 192행
- 시험 MAE/RMSE/R²:

| 타깃 | MAE (원본 단위 미표기) | RMSE (원본 단위 미표기) | R² |
|---|---:|---:|---:|
| 난방부하 | 2.6500 | 2.9052 | 0.8456 |
| 냉방부하 | 3.6696 | 4.1625 | 0.7019 |

이것이 프로젝트의 원래 “건물 구조를 입력해 난방/냉방 부하를 예측한다”는 서비스 정의에 가장 직접 대응합니다. 성능 결과를 정확도라고 부르지 않습니다.

### 2) BDG2 다음 시간 계량값 데모

- 데이터: Building Data Genome Project 2, 익명화된 Eagle 사이트 건물 계량 자료
- 타깃: 냉방 관련 냉수 계량값 또는 난방 관련 증기 계량값의 다음 시간 값
- 예측에 사용하는 입력은 선택 건물의 과거 계량 이력, 면적, 용도 및 선택된 시간 특성입니다.
- 시험은 학습에 넣지 않은 9개 건물과 마지막 30일의 시간 구간으로 분리했습니다.
- 시험 결과:

| 타깃 | 모델 MAE | 직전값 기준선 MAE | 모델 R² | 직전값 기준선 R² |
|---|---:|---:|---:|---:|
| 냉수 계량값 | 21,145.32 | **15,007.52** | 0.8888 | **0.9036** |
| 증기 계량값 | 55.82 | **41.62** | 0.9296 | **0.9326** |

계량 단위가 확인되지 않았고 대상은 2017년 말까지의 미국 과거 자료입니다. 기준선과 비교했을 때 모델이 항상 더 낫다고 주장하지 않습니다. 한국·실시간 예측도 아닙니다.

### 3) ComStock 연간 사용량 모델

- 데이터: NREL ComStock 2021 AMY 2018 baseline upgrade `00`
- 사용 행: 347,144개 건물 행. 건물 ID 기준 train 242,991행, validation 52,081행, 최종 test 52,072행으로 분리
- 입력: 면적·층수·장단변 비율·회전, 건물 유형·ASHRAE 기후대·미국 주, HVAC/난방 연료, 에너지 기준, 온도 설정, 운영시간
- 난방 Label: 전기·천연가스·기타 연료·지역난방의 연간 난방 kWh 합
- 냉방 Label: 전기 냉방·지역 냉방의 연간 냉방 kWh 합
- 모델: `HistGradientBoostingRegressor`
- 구조만 사용한 1차 Feature iteration보다 HVAC·연료·에너지 기준·운영 특성을 추가한 2차 iteration이 validation에서 더 높았습니다.
- held-out test: 난방 R² 0.8499, MAE 41,751.50 kWh, RMSE 122,054.10 kWh; 냉방 R² 0.8916, MAE 22,212.63 kWh, RMSE 78,539.92 kWh

R² 0.85 목표는 냉방은 넘었고 난방은 아주 근소하게 못 넘었습니다. 이는 ComStock의 **미국 연간 시뮬레이션 에너지** 문제에 대한 점수이지, UCI 설계부하 모델이나 한국 운영 건물의 성능을 뜻하지 않습니다.

## 시스템 구성

- **웹:** Next.js / React, 한국어 입력·결과 화면
- **API:** Python FastAPI, Uvicorn으로 로컬 서빙
- **모델:** scikit-learn, joblib 직렬화 모델 번들
- **DB:** 현재 애플리케이션은 SQLite나 서버 DB를 사용하지 않습니다. API는 모델 파일을 불러와 예측하며 예측 요청을 DB에 저장하지 않습니다.
- **예측·정답 로그:** API는 모델 종류, 입력값, 예측값, 예측 ID를 JSON 한 줄 로그로 표준 출력에 기록하고, `/feedback`으로 제출된 확인값도 같은 ID로 연결해 기록합니다. 로컬 실행에서는 프로세스 콘솔에만 남으며, ECS에서 CloudWatch Logs를 보려면 task의 `awslogs` 설정이 필요합니다. 로그는 실제값을 확보한 뒤에만 제출하며, 계량값의 단위·정답 의미를 확인하지 못한 경우 임의로 입력하지 않습니다.
- **로컬 실행:** 프로젝트의 `docker-compose.yml`로 API와 웹 컨테이너를 띄울 수 있습니다.
- **AWS 운영 배포:** 현재 문서와 코드 기준으로 배포했다고 주장하지 않습니다.

## 현재 API와 웹 기능

### 기본 UCI

- `GET /health`: API 상태
- `GET /metadata`: 기본 UCI 모델 Feature와 타깃 정보
- `POST /predict`: 입력 건물 조건으로 난방부하와 냉방부하 예측
- `POST /feedback`: `prediction_id`, 모델, 타깃, 예측값 및 나중에 확인된 실제값을 구조화 로그에 기록

### BDG2

- `GET /meter-model/metadata`: 데이터셋, 지원 건물, 모델·평가 정보
- `POST /meter-model/predict/heating`
- `POST /meter-model/predict/cooling`
- `building_id`를 지정하지 않으면 기본 건물을 사용합니다.

### ComStock

- `GET /comstock/metadata`: 입력값의 범위·범주·기본값과 시험 지표
- `POST /comstock/predict/heating`
- `POST /comstock/predict/cooling`
- 화면에는 연간 예측을 `kWh/년`으로 따로 표시합니다.
- 모든 예측 응답에는 로그와 정답을 연결하기 위한 `prediction_id`가 포함됩니다.

## 코드와 주요 산출물

| 목적 | 위치 |
|---|---|
| UCI 데이터 전처리 | `scripts/prepare_data.py` |
| UCI 모델 학습·평가 | `scripts/train.py` |
| BDG2 시계열 학습·평가 | `scripts/train_meter_models.py` |
| ComStock 학습·Feature iteration·최종 평가 | `scripts/train_comstock_models.py` |
| FastAPI 애플리케이션 | `api/app/main.py` |
| API 입력/응답 스키마 | `api/app/schemas.py` |
| API 회귀 테스트 | `api/tests/test_api.py` |
| 웹 화면 | `web/app/page.tsx` |
| 기본 UCI 평가 결과 | `artifacts/metrics.json` |
| BDG2 평가 결과 | `artifacts/bdg2_meter_metrics.json` |
| ComStock 평가 결과 | `artifacts/comstock_energy_metrics.json` |
| 모델 파일 | `artifacts/*.joblib` |
| ComStock 출처·라벨 설명 | `data/raw/comstock/README.md` |
| BDG2 출처·단위 주의사항 | `data/raw/bdg2/README.md` |

원본 대용량 데이터는 `.gitignore`로 Git에 올리지 않고, 출처와 내려받은 파일 설명을 README에 둡니다.

## 실행 방법

### Docker Compose

저장소 루트 `C:\2024100163\MLops\building-energy`에서:

```powershell
docker compose up --build
```

- 웹: `http://localhost:3001`
- API 문서: `http://localhost:8001/docs`

### 로컬 개별 실행

API:

```powershell
cd C:\2024100163\MLops\building-energy\api
python -m uvicorn app.main:app --host 127.0.0.1 --port 8001
```

웹(별도 터미널):

```powershell
cd C:\2024100163\MLops\building-energy\web
npm ci
npm run dev
```

ComStock 모델을 다시 학습해야 하는 경우 ComStock 원본 파일을 먼저 준비한 뒤 저장소 루트에서:

```powershell
python scripts\train_comstock_models.py
```

## 과제 체크리스트 관점의 상태

1. **서비스 정의:** 건물 구조 기반 설계 냉난방 부하 예측으로 정의되어 있습니다. ComStock과 BDG2는 부가적인 별도 문제/시연으로 분리했습니다.
2. **Feature/Label:** UCI, BDG2, ComStock별 입력과 출력, 단위·한계를 문서화했습니다.
3. **예측 모델·성능 확인:** 세 파이프라인의 별도 시험 점수를 저장했습니다. 냉방/난방 성능은 타깃 정의별로 해석해야 합니다.
4. **API 서빙:** 기본 UCI, BDG2, ComStock을 각각 분리된 endpoint로 제공합니다.
5. **PR:** GitHub PR #1에 ComStock 연동 작업을 포함해 feature 브랜치로 푸시했습니다.
6. **팀원 전원 리뷰:** 사람 리뷰 진행이 필요합니다. 자동화나 작성자 커밋이 이를 대신하지 않습니다.
7. **0060.kr Q&A 등록:** 사용자가 직접 PR 주소를 올리기로 했습니다.

## 주의해서 설명할 점

- UCI `Y1`/`Y2`는 건물 설계부하이며 원본 데이터에 물리 단위가 없습니다.
- BDG2는 시간별 운전 계량값 예측이고, 계량 단위가 불명확하며 모델이 직전값 기준선보다 낮은 MAE를 보였습니다.
- ComStock은 미국 건물 재고의 연간 시뮬레이션 kWh입니다. 한국 건물의 실제 소비량에 대한 정확도라고 말하면 안 됩니다.
- R²는 회귀 성능 지표이고 분류 정확도(accuracy)가 아닙니다.
- 화면에서 표시하는 모델별 수치는 그 모델의 별도 데이터·시험 설정에 대한 값입니다. 서로 다른 단위와 타깃의 R²를 단순 비교하면 안 됩니다.
- 입력 범위를 벗어난 값은 검증에서 거부해야 하며, 실험·학습 범위를 넘어선 외삽 결과를 신뢰 가능한 예측처럼 다루지 않습니다.
