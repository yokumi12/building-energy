from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field


class BuildingInput(BaseModel):
    relative_compactness: float = Field(ge=0.62, le=0.98)
    surface_area: float = Field(ge=514.5, le=808.5)
    wall_area: float = Field(ge=245.0, le=416.5)
    roof_area: float = Field(ge=110.25, le=220.5)
    overall_height: float = Field(ge=3.5, le=7.0)
    orientation: Literal[2, 3, 4, 5]
    glazing_area: float = Field(ge=0.0, le=0.4)
    glazing_area_distribution: Literal[0, 1, 2, 3, 4, 5]


class PredictionResponse(BaseModel):
    prediction_id: str
    model_version: str
    heating_load: float
    cooling_load: float
    disclaimer: str


class MeterPredictionResponse(BaseModel):
    prediction_id: str
    dataset: str
    building_id: str
    target: Literal["heating", "cooling"]
    strategy: Literal["linear_regression", "hist_gradient_boosting"]
    selected_iteration: str
    building_area_sqm: float
    building_use: str
    features: list[str]
    forecast_timestamp: str
    predicted_value: float
    test_r2: float
    test_mae: float
    baseline_test_r2: float
    baseline_test_mae: float
    unit_note: str
    disclaimer: str


class ComstockPredictionInput(BaseModel):
    values: dict[str, Any]


class ComstockPredictionResponse(BaseModel):
    prediction_id: str
    model_version: str
    dataset: str
    target: Literal["heating", "cooling"]
    predicted_kwh: float
    test_r2: float
    test_mae_kwh: float
    test_rmse_kwh: float
    disclaimer: str


class PredictionFeedbackInput(BaseModel):
    prediction_id: UUID
    model: Literal["uci_design_load", "comstock_annual_energy", "bdg2_next_hour"]
    target: Literal["heating", "cooling"]
    predicted_value: float = Field(ge=0, allow_inf_nan=False)
    actual_value: float = Field(ge=0, allow_inf_nan=False)


class PredictionFeedbackResponse(BaseModel):
    status: Literal["recorded"]
    prediction_id: str
