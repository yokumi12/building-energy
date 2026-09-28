from fastapi.testclient import TestClient

from app.main import app

VALID_BUILDING = {
    "relative_compactness": 0.9,
    "surface_area": 563.5,
    "wall_area": 318.5,
    "roof_area": 122.5,
    "overall_height": 7.0,
    "orientation": 2,
    "glazing_area": 0.1,
    "glazing_area_distribution": 1,
}


def test_predicts_heating_and_cooling_loads() -> None:
    with TestClient(app) as client:
        response = client.post("/predict", json=VALID_BUILDING)
    assert response.status_code == 200
    body = response.json()
    assert body["model_version"] == "energy-efficiency-rf-v1"
    assert body["heating_load"] > 0
    assert body["cooling_load"] > 0
    assert "시뮬레이션" in body["disclaimer"]


def test_rejects_out_of_range_input() -> None:
    invalid = {**VALID_BUILDING, "glazing_area": 0.9}
    with TestClient(app) as client:
        response = client.post("/predict", json=invalid)
    assert response.status_code == 422


def test_meter_model_metadata_and_separate_forecasts() -> None:
    with TestClient(app) as client:
        metadata = client.get("/meter-model/metadata")
        heating = client.post("/meter-model/predict/heating")
        cooling = client.post("/meter-model/predict/cooling")

    assert metadata.status_code == 200
    assert metadata.json()["dataset"] == "Building Data Genome Project 2"
    assert metadata.json()["forecast_horizon_hours"] == 1
    assert metadata.json()["building_count"] == 41
    assert "recent readings" in metadata.json()["forecast_explanation"]
    assert "area_sqm" in metadata.json()["feature_definition"]
    assert metadata.json()["test_metrics"]["cooling"]["model"]["r2"] >= 0.8
    assert metadata.json()["test_metrics"]["heating"]["model"]["r2"] >= 0.8
    assert len(metadata.json()["buildings"]) == metadata.json()["building_count"]
    for response, target in ((heating, "heating"), (cooling, "cooling")):
        assert response.status_code == 200
        body = response.json()
        assert body["target"] == target
        assert body["building_id"] == "Eagle_education_Alberto"
        assert body["strategy"] in {"linear_regression", "hist_gradient_boosting"}
        assert body["selected_iteration"].startswith("iteration_")
        assert body["building_area_sqm"] > 0
        assert body["building_use"]
        assert body["features"]
        assert body["test_r2"] >= 0.8
        assert body["test_mae"] > 0
        assert body["baseline_test_r2"] > 0
        assert body["baseline_test_mae"] > 0
        assert body["predicted_value"] >= 0
        assert "unit" in body["unit_note"]


def test_meter_model_predicts_selected_building() -> None:
    with TestClient(app) as client:
        response = client.post(
            "/meter-model/predict/cooling",
            params={"building_id": "Eagle_education_Brooke"},
        )
    assert response.status_code == 200
    assert response.json()["building_id"] == "Eagle_education_Brooke"
    assert response.json()["building_use"] == "Education"


def test_meter_model_rejects_unknown_target() -> None:
    with TestClient(app) as client:
        response = client.post("/meter-model/predict/electricity")
    assert response.status_code == 422
