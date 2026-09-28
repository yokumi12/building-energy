from contextlib import asynccontextmanager
from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import BuildingInput, MeterPredictionResponse, PredictionResponse

ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = ROOT / "artifacts" / "models.joblib"
METER_MODEL_PATH = ROOT / "artifacts" / "bdg2_meter_models.joblib"
DISCLAIMER = (
    "예측값은 UCI Energy Efficiency의 시뮬레이션 설계 데이터로 학습한 교육용 모델 결과입니다. "
    "실제 건물의 에너지 사용량이나 설계 적합성을 보장하지 않습니다."
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not MODEL_PATH.is_file():
        raise RuntimeError(f"Trained model is missing at {MODEL_PATH}; run scripts/train.py first.")
    app.state.model_bundle = joblib.load(MODEL_PATH)
    app.state.meter_model_bundle = (
        joblib.load(METER_MODEL_PATH) if METER_MODEL_PATH.is_file() else None
    )
    yield


app = FastAPI(title="Building Heating and Cooling Load API", version="0.1.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://127.0.0.1:3001"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/metadata")
def metadata() -> dict[str, object]:
    if not MODEL_PATH.is_file():
        raise HTTPException(status_code=503, detail="Model has not been trained.")
    return {
        "model_version": "energy-efficiency-rf-v1",
        "features": [
            "relative_compactness",
            "surface_area",
            "wall_area",
            "roof_area",
            "overall_height",
            "orientation",
            "glazing_area",
            "glazing_area_distribution",
        ],
        "targets": ["heating_load", "cooling_load"],
        "disclaimer": DISCLAIMER,
    }


@app.post("/predict", response_model=PredictionResponse)
def predict(building: BuildingInput) -> PredictionResponse:
    bundle = getattr(app.state, "model_bundle", None)
    if bundle is None:
        raise HTTPException(status_code=503, detail="Model is not loaded.")
    row = pd.DataFrame(
        [[getattr(building, feature) for feature in bundle["features"]]],
        columns=bundle["features"],
    )
    heating = float(bundle["models"]["heating_load"].predict(row)[0])
    cooling = float(bundle["models"]["cooling_load"].predict(row)[0])
    return PredictionResponse(
        model_version=bundle["model_version"],
        heating_load=round(heating, 3),
        cooling_load=round(cooling, 3),
        disclaimer=DISCLAIMER,
    )


@app.get("/meter-model/metadata")
def meter_model_metadata() -> dict[str, object]:
    bundle = getattr(app.state, "meter_model_bundle", None)
    if bundle is None:
        raise HTTPException(status_code=503, detail="Train the BDG2 meter models first.")
    profiles = bundle["building_profiles"]
    return {
        "dataset": bundle["dataset"],
        "site_id": bundle["site_id"],
        "building_count": len(profiles),
        "forecast_horizon_hours": bundle["forecast_horizon_hours"],
        "forecast_explanation": "Predict the next-hour meter reading using recent readings, building floor area, building use, and calendar time.",
        "feature_definition": {
            "previous_reading": "같은 계량기의 1시간 전 값",
            "previous_day_reading": "같은 계량기의 24시간 전 값",
            "previous_week_reading": "같은 계량기의 168시간 전 값",
            "area_sqm": "건물 바닥면적(m²)",
            "building_use": "건물의 주 용도",
            "hour": "예측 시각의 시(hour)",
            "day_of_week": "예측 시각의 요일",
            "month": "예측 시각의 월",
        },
        "targets": {
            target: {
                "strategy": model["strategy"],
                "selected_iteration": model["selected_iteration"],
            }
            for target, model in bundle["models"].items()
        },
        "test_metrics": bundle["test_metrics"],
        "buildings": [
            {
                "building_id": building_id,
                "building_area_sqm": profile["area_sqm"],
                "building_use": profile["building_use"],
            }
            for building_id, profile in profiles.items()
        ],
        "unit_note": "Source meter unit and meter convention are not established here.",
        "disclaimer": "Overseas multi-building teaching demo; not a live forecast or Korean building model.",
    }


@app.post("/meter-model/predict/{target}", response_model=MeterPredictionResponse)
def predict_meter(target: str, building_id: str | None = None) -> MeterPredictionResponse:
    bundle = getattr(app.state, "meter_model_bundle", None)
    if bundle is None:
        raise HTTPException(status_code=503, detail="Train the BDG2 meter models first.")
    if target not in bundle["models"]:
        raise HTTPException(status_code=422, detail="Target must be 'heating' or 'cooling'.")
    selected_building = building_id or bundle["default_building_id"]
    profile = bundle["building_profiles"].get(selected_building)
    if profile is None:
        raise HTTPException(status_code=422, detail="Select a building from the available list.")
    forecast_time = pd.Timestamp(profile[f"{target}_last_timestamp"]) + pd.Timedelta(hours=1)
    feature_values = {
        "previous_reading": profile[f"{target}_previous_reading"],
        "previous_day_reading": profile[f"{target}_previous_day_reading"],
        "previous_week_reading": profile[f"{target}_previous_week_reading"],
        "area_sqm": profile["area_sqm"],
        "building_use": profile["building_use"],
        "hour": forecast_time.hour,
        "day_of_week": forecast_time.dayofweek,
        "month": forecast_time.month,
    }
    model_info = bundle["models"][target]
    features = pd.DataFrame(
        [{name: feature_values[name] for name in model_info["features"]}],
        columns=model_info["features"],
    )
    prediction = max(0.0, float(model_info["estimator"].predict(features)[0]))

    return MeterPredictionResponse(
        dataset=bundle["dataset"],
        building_id=selected_building,
        target=target,
        strategy=model_info["strategy"],
        selected_iteration=model_info["selected_iteration"],
        building_area_sqm=profile["area_sqm"],
        building_use=profile["building_use"],
        features=model_info["features"],
        forecast_timestamp=forecast_time.isoformat(),
        predicted_value=round(prediction, 4),
        test_r2=bundle["test_metrics"][target]["model"]["r2"],
        test_mae=bundle["test_metrics"][target]["model"]["mae"],
        baseline_test_r2=bundle["test_metrics"][target]["previous_reading_baseline"]["r2"],
        baseline_test_mae=bundle["test_metrics"][target]["previous_reading_baseline"]["mae"],
        unit_note="Source meter unit and meter convention are not established; value is shown on the original scale.",
        disclaimer="This is a one-hour-ahead teaching demo for an anonymized US building, not a Korean or live building prediction.",
    )
