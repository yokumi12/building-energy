from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.dummy import DummyRegressor
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "processed" / "energy_efficiency.csv"
MODEL_PATH = ROOT / "artifacts" / "models.joblib"
METRICS_PATH = ROOT / "artifacts" / "metrics.json"
FEATURES = [
    "relative_compactness",
    "surface_area",
    "wall_area",
    "roof_area",
    "overall_height",
    "orientation",
    "glazing_area",
    "glazing_area_distribution",
]
TARGETS = ["heating_load", "cooling_load"]
GROUP_COLUMNS = [
    "relative_compactness",
    "surface_area",
    "wall_area",
    "roof_area",
    "overall_height",
]


def regression_metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
        "r2": float(r2_score(actual, predicted)),
    }


def train() -> dict[str, object]:
    if not DATA.is_file():
        raise FileNotFoundError(f"Processed data not found at {DATA}. Run scripts/prepare_data.py first.")

    frame = pd.read_csv(DATA)
    if len(frame) < 20:
        raise ValueError("At least 20 rows are required for a train/test split.")

    features = frame[FEATURES]
    groups = frame[GROUP_COLUMNS].astype(str).agg("|".join, axis=1)
    splitter = GroupShuffleSplit(n_splits=1, test_size=0.25, random_state=42)
    train_indices, test_indices = next(splitter.split(features, groups=groups))
    x_train, x_test = features.iloc[train_indices], features.iloc[test_indices]

    models: dict[str, RandomForestRegressor] = {}
    results: dict[str, object] = {}
    for target in TARGETS:
        y_train, y_test = frame[target].iloc[train_indices], frame[target].iloc[test_indices]
        baseline = DummyRegressor(strategy="mean").fit(x_train, y_train)
        model = RandomForestRegressor(
            n_estimators=300,
            min_samples_leaf=1,
            random_state=42,
            n_jobs=-1,
        ).fit(x_train, y_train)
        baseline_metrics = regression_metrics(y_test, baseline.predict(x_test))
        model_metrics = regression_metrics(y_test, model.predict(x_test))
        models[target] = model
        results[target] = {
            "baseline_mean": baseline_metrics,
            "random_forest": model_metrics,
            "test_rows": int(len(test_indices)),
        }

    bundle = {
        "model_version": "energy-efficiency-rf-v1",
        "features": FEATURES,
        "targets": TARGETS,
        "models": models,
        "training_rows": int(len(train_indices)),
        "test_rows": int(len(test_indices)),
        "test_geometry_groups": sorted(groups.iloc[test_indices].unique().tolist()),
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)

    metrics: dict[str, object] = {
        "model_version": bundle["model_version"],
        "algorithm": "RandomForestRegressor",
        "split": {
            "method": "GroupShuffleSplit",
            "group_columns": GROUP_COLUMNS,
            "test_size": 0.25,
            "random_state": 42,
            "train_rows": int(len(train_indices)),
            "test_rows": int(len(test_indices)),
            "unique_geometry_groups": int(groups.nunique()),
        },
        "targets": results,
        "limitations": [
            "Evaluation holds out building geometry groups to reduce leakage between repeated design variants.",
            "The dataset contains simulated design cases, not measurements from operating buildings.",
            "Metric units follow the source target values; the workbook does not state a physical unit.",
        ],
    }
    METRICS_PATH.write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return metrics


if __name__ == "__main__":
    print(json.dumps(train(), ensure_ascii=False, indent=2))
