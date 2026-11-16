import json

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
    assert body["prediction_id"]
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
        assert body["prediction_id"]
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


def test_comstock_metadata_and_annual_energy_predictions() -> None:
    with TestClient(app) as client:
        metadata = client.get("/comstock/metadata")
        assert metadata.status_code == 200
        body = metadata.json()
        values = {
            name: feature["default"] for name, feature in body["features"].items()
        }
        heating = client.post("/comstock/predict/heating", json={"values": values})
        cooling = client.post("/comstock/predict/cooling", json={"values": values})

    assert len(body["features"]) == 19
    assert body["dataset"].startswith("NREL ComStock")
    for response, target in ((heating, "heating"), (cooling, "cooling")):
        assert response.status_code == 200
        prediction = response.json()
        assert prediction["prediction_id"]
        assert prediction["target"] == target
        assert prediction["predicted_kwh"] >= 0
        assert prediction["test_r2"] >= 0.84
        assert prediction["test_mae_kwh"] > 0
        assert "UCI" in prediction["disclaimer"]


def test_comstock_rejects_out_of_range_and_unknown_target() -> None:
    with TestClient(app) as client:
        metadata = client.get("/comstock/metadata").json()
        values = {
            name: feature["default"] for name, feature in metadata["features"].items()
        }
        values["in.sqft"] = metadata["features"]["in.sqft"]["max"] + 1
        invalid = client.post("/comstock/predict/heating", json={"values": values})
        unknown_target = client.post("/comstock/predict/electricity", json={"values": values})

    assert invalid.status_code == 422
    assert unknown_target.status_code == 422


def test_prediction_and_actual_value_are_written_as_structured_logs(caplog) -> None:
    caplog.set_level("INFO", logger="uvicorn.error")
    with TestClient(app) as client:
        prediction = client.post("/predict?target=heating", json=VALID_BUILDING)
        body = prediction.json()
        feedback = client.post(
            "/feedback",
            json={
                "prediction_id": body["prediction_id"],
                "model": "uci_design_load",
                "target": "heating",
                "predicted_value": body["heating_load"],
                "actual_value": 12.5,
            },
        )

    assert prediction.status_code == 200
    assert feedback.status_code == 200
    events = [
        json.loads(record.getMessage())
        for record in caplog.records
        if record.getMessage().startswith("{")
    ]
    prediction_event = next(event for event in events if event.get("event_type") == "prediction")
    feedback_event = next(event for event in events if event.get("event_type") == "actual_value")
    assert prediction_event["prediction_id"] == body["prediction_id"]
    assert prediction_event["model"] == "uci_design_load"
    assert prediction_event["target"] == "heating"
    assert prediction_event["input"] == VALID_BUILDING
    assert feedback_event["prediction_id"] == body["prediction_id"]
    assert feedback_event["actual_value"] == 12.5


def test_feedback_rejects_negative_or_invalid_actual_values() -> None:
    with TestClient(app) as client:
        negative = client.post(
            "/feedback",
            json={
                "prediction_id": "00000000-0000-0000-0000-000000000001",
                "model": "uci_design_load",
                "target": "heating",
                "predicted_value": 2.0,
                "actual_value": -1,
            },
        )
        non_finite = client.post(
            "/feedback",
            json={
                "prediction_id": "00000000-0000-0000-0000-000000000001",
                "model": "uci_design_load",
                "target": "heating",
                "predicted_value": 2.0,
                "actual_value": "not-a-number",
            },
        )

    assert negative.status_code == 422
    assert non_finite.status_code == 422
