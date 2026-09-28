# Building Heating and Cooling Load Predictor

건물 구조 입력값으로 난방 부하와 냉방 부하를 각각 예측하는 교육용 MLOps 프로젝트입니다. 구현 패턴은 교수님 제공 지하철 프로젝트에서 참고하지만, 데이터와 예측 대상은 UCI Energy Efficiency 데이터셋에 맞게 분리했습니다.

## Dataset

- Source: UCI Energy Efficiency, `ENB2012_data.xlsx`
- Local source copy: `data/raw/ENB2012_data.xlsx`
- 768 records, 8 input features, 2 targets
- First worksheet only; other workbook sheets are empty.
- Missing values: 0; exact duplicate rows: 0
- Target values are kept in the source scale. The workbook does not state a physical unit.
- This is a simulated building-design dataset, not metered energy consumption from real buildings.

| Input name | Original | Meaning |
|---|---|---|
| relative_compactness | X1 | Relative compactness |
| surface_area | X2 | Surface area |
| wall_area | X3 | Wall area |
| roof_area | X4 | Roof area |
| overall_height | X5 | Overall height |
| orientation | X6 | Orientation category (2–5) |
| glazing_area | X7 | Glazing area |
| glazing_area_distribution | X8 | Glazing distribution category (0–5) |

Targets: `Y1` heating load, `Y2` cooling load.

## Additional measured building data

An additional real-operation dataset is stored separately under `data/raw/bdg2/`: hourly chilled-water, hot-water, and steam meter readings for 2016–2017, with building metadata and site weather. See [`data/raw/bdg2/README.md`](data/raw/bdg2/README.md) for file details, source attribution, and interpretation cautions.

BDG2 is not merged into the UCI design table or the current model: its time-series meter readings are different targets with site-dependent units and require a separate time-aware feature and evaluation pipeline. Chilled water is cooling-related; hot water and steam are heating-related. Do not interpret them as directly comparable to the UCI simulated load targets.

## Run data preparation and training

From this directory:

```powershell
python -m pip install -r api\requirements.txt
python scripts\prepare_data.py
python scripts\train.py
```

Data checks are saved in `artifacts/data_quality.json`; baseline and random-forest MAE, RMSE and R² are saved in `artifacts/metrics.json`. Evaluation holds out whole geometry groups using a deterministic group split, rather than randomly splitting nearly repeated designs across train and test.

## Run API

```powershell
python -m uvicorn app.main:app --app-dir api --reload --port 8001
```

API docs: `http://localhost:8001/docs`

## Run web

In another terminal:

```powershell
cd web
npm ci
npm run dev
```

Web: `http://localhost:3001`

## Screen

The Korean-language screen groups the eight source features into building structure and glazing conditions. Heating and cooling have separate tabs, input values, and results; only the selected load is shown, and each tab keeps its own design inputs when switching. The screen also has a separate BDG2 measured-meter demo with one button per heating/cooling forecast; it does not mix BDG2 results with the UCI design model. The screen shows the accepted dataset range for each UCI field and checks API health. The UCI result bar is only a visual scale against the dataset's 0–50 target range; the source workbook does not state a physical unit.

The UI and API are a local teaching prototype. GitHub publication and AWS deployment are intentionally not part of the current phase.

## Train separate BDG2 meter models

After downloading the files listed in `data/raw/bdg2/README.md`, run:

```powershell
python scripts\train_meter_models.py
```

This trains separate next-hour regressors for 41 eligible buildings at one anonymized US site.

- **Target:** next-hour chilled-water meter reading for cooling; next-hour steam meter reading for heating.
- **Features:** the same meter's previous-hour value, floor area, building use, and (in the expanded iteration) readings from 24 and 168 hours earlier plus hour, weekday, and month.
- **Iteration 1:** structure plus the previous-hour reading, using LinearRegression.
- **Iteration 2:** add 24-hour/168-hour history and calendar features; compare LinearRegression and HistGradientBoosting.

Feature/model selection uses a separate set of validation buildings and dates. Final metrics use nine buildings held out from training and the final 30 chronological days. Both R² and MAE are reported, as well as a baseline that copies the previous reading. R² is not classification accuracy, and the more complex model can still lose to that baseline. Results are saved to `artifacts/bdg2_meter_metrics.json`; the separate bundle is `artifacts/bdg2_meter_models.joblib`.

The API exposes `GET /meter-model/metadata` and `POST /meter-model/predict/heating` or `/meter-model/predict/cooling`. A `building_id` query parameter selects one building from the available list. These endpoints forecast the next available hour for that building; the history ends in 2017. This is a reproducible offline demonstration, not a live or Korean-building forecast. BDG2 and UCI targets are not merged.

## Limitations

- The model is trained on simulated design cases. It does not predict measured utility bills or guarantee real-world performance.
- Input values are constrained to the source dataset range; extrapolation is intentionally rejected.
- Heating and cooling are separate regression targets. Model metrics must be reviewed before interpreting predictions.
- The additional BDG2 meter models are separate demonstrations using multiple buildings from one anonymized US site; their meter units are not asserted and performance must not be generalized.
- No deployment or AWS resources are created by this local project.
