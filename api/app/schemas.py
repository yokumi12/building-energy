from typing import Literal

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
    model_version: str
    heating_load: float
    cooling_load: float
    disclaimer: str


class MeterPredictionResponse(BaseModel):
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
