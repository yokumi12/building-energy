from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data" / "raw" / "bdg2"
ARTIFACT_ROOT = ROOT / "artifacts"
MODEL_PATH = ARTIFACT_ROOT / "bdg2_meter_models.joblib"
METRICS_PATH = ARTIFACT_ROOT / "bdg2_meter_metrics.json"
SITE_ID = "Eagle"
SERIES = {"cooling": "chilledwater_cleaned.csv", "heating": "steam_cleaned.csv"}
METER_LABELS = {"cooling": "chilled water", "heating": "steam"}
TEST_DAYS = 30
VALIDATION_DAYS = 30
MIN_VALID_READINGS = 1000
MIN_NONZERO_READINGS = 100
BASE_FEATURES = ["previous_reading", "area_sqm", "building_use"]
TIME_FEATURES = BASE_FEATURES + [
    "previous_day_reading",
    "previous_week_reading",
    "hour",
    "day_of_week",
    "month",
]
FEATURE_ITERATIONS = {
    "iteration_1_structure": {
        "features": BASE_FEATURES,
        "model": "linear_regression",
    },
    "iteration_2_time_and_history": {
        "features": TIME_FEATURES,
        "model": "linear_regression",
    },
    "iteration_2_time_and_history_tree": {
        "features": TIME_FEATURES,
        "model": "hist_gradient_boosting",
    },
}


def make_examples(
    building_id: str,
    info: pd.Series,
    meter: pd.DataFrame,
) -> pd.DataFrame:
    values = pd.to_numeric(meter[building_id], errors="coerce")
    timestamps = pd.DatetimeIndex(meter["timestamp"])
    result = pd.DataFrame(
        {
            "target": values.to_numpy(),
            "previous_reading": values.shift(1).to_numpy(),
            "previous_day_reading": values.shift(24).to_numpy(),
            "previous_week_reading": values.shift(168).to_numpy(),
            "area_sqm": float(info["sqm"]),
            "building_use": str(info["primaryspaceusage"]),
            "building_id": building_id,
            "hour": timestamps.hour,
            "day_of_week": timestamps.dayofweek,
            "month": timestamps.month,
        },
        index=timestamps,
    )
    return result


def make_model(feature_names: list[str], model_kind: str) -> Pipeline:
    categorical = ["building_use"] if "building_use" in feature_names else []
    numeric = [name for name in feature_names if name not in categorical]
    dense_output = model_kind == "hist_gradient_boosting"
    preprocessing = ColumnTransformer(
        [
            (
                "building_use",
                OneHotEncoder(handle_unknown="ignore", sparse_output=not dense_output),
                categorical,
            ),
            ("numeric", "passthrough", numeric),
        ],
        remainder="drop",
    )
    estimator = (
        LinearRegression()
        if model_kind == "linear_regression"
        else HistGradientBoostingRegressor(
            max_iter=80,
            max_leaf_nodes=15,
            learning_rate=0.08,
            l2_regularization=2.0,
            random_state=42,
        )
    )
    return Pipeline([("features", preprocessing), ("regression", estimator)])


def regression_metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    return {
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(np.sqrt(mean_squared_error(actual, predicted))),
        "r2": float(r2_score(actual, predicted)),
    }


def load_data() -> tuple[dict[str, pd.DataFrame], dict[str, dict[str, object]]]:
    metadata_path = DATA_ROOT / "metadata.csv"
    if not metadata_path.is_file():
        raise FileNotFoundError(f"BDG2 metadata is missing: {metadata_path}")
    metadata = pd.read_csv(metadata_path).set_index("building_id")
    metadata = metadata[
        metadata["site_id"].eq(SITE_ID)
        & metadata["sqm"].notna()
        & metadata["primaryspaceusage"].notna()
    ]

    meters: dict[str, pd.DataFrame] = {}
    for target, filename in SERIES.items():
        path = DATA_ROOT / filename
        if not path.is_file():
            raise FileNotFoundError(f"BDG2 meter file is missing: {path}")
        meters[target] = pd.read_csv(path, parse_dates=["timestamp"])
        if not meters[target]["timestamp"].is_monotonic_increasing:
            raise ValueError(f"Timestamps must be increasing in {filename}.")

    shared_ids = sorted(
        set(metadata.index)
        & set(meters["cooling"].columns)
        & set(meters["heating"].columns)
    )
    examples: dict[str, list[pd.DataFrame]] = {target: [] for target in SERIES}
    profiles: dict[str, dict[str, object]] = {}
    for building_id in shared_ids:
        info = metadata.loc[building_id]
        building_examples = {
            target: make_examples(building_id, info, meters[target])
            for target in SERIES
        }
        usable = True
        for target, data in building_examples.items():
            meter_values = data["target"]
            if (
                meter_values.notna().sum() < MIN_VALID_READINGS
                or (meter_values > 0).sum() < MIN_NONZERO_READINGS
            ):
                usable = False
                break
        if not usable:
            continue

        for target, data in building_examples.items():
            examples[target].append(data)
        profile: dict[str, object] = {
            "site_id": SITE_ID,
            "area_sqm": float(info["sqm"]),
            "building_use": str(info["primaryspaceusage"]),
        }
        can_forecast = True
        for target in SERIES:
            values = pd.to_numeric(meters[target][building_id], errors="coerce")
            timestamps = pd.DatetimeIndex(meters[target]["timestamp"])
            positions = np.arange(168, len(values))
            eligible_positions = positions[
                values.iloc[positions].notna().to_numpy()
                & values.iloc[positions - 1].notna().to_numpy()
                & values.iloc[positions - 24].notna().to_numpy()
                & values.iloc[positions - 167].notna().to_numpy()
            ]
            if len(eligible_positions) == 0:
                can_forecast = False
                usable = False
                break
            position = int(eligible_positions[-1])
            profile[f"{target}_last_timestamp"] = str(timestamps[position])
            profile[f"{target}_previous_reading"] = float(values.iloc[position])
            profile[f"{target}_previous_day_reading"] = float(values.iloc[position - 23])
            profile[f"{target}_previous_week_reading"] = float(values.iloc[position - 167])
        if usable and can_forecast:
            profiles[building_id] = profile

    if len(profiles) < 10:
        raise ValueError(f"Expected at least 10 usable buildings at {SITE_ID}; found {len(profiles)}.")
    datasets = {
        target: pd.concat(frames).sort_index()
        for target, frames in examples.items()
    }
    return datasets, profiles


def train() -> dict[str, object]:
    datasets, profiles = load_data()
    building_ids = np.array(sorted(profiles))
    train_pool_indices, test_indices = next(
        GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=42).split(
            building_ids, groups=building_ids
        )
    )
    train_pool_ids = building_ids[train_pool_indices]
    test_ids = set(building_ids[test_indices])
    train_indices, validation_indices = next(
        GroupShuffleSplit(n_splits=1, test_size=0.2, random_state=43).split(
            train_pool_ids, groups=train_pool_ids
        )
    )
    train_ids = set(train_pool_ids[train_indices])
    validation_ids = set(train_pool_ids[validation_indices])

    test_start = pd.Timestamp("2018-01-01") - pd.Timedelta(days=TEST_DAYS)
    validation_start = test_start - pd.Timedelta(days=VALIDATION_DAYS)
    bundle: dict[str, object] = {
        "dataset": "Building Data Genome Project 2",
        "site_id": SITE_ID,
        "forecast_horizon_hours": 1,
        "building_profiles": profiles,
        "models": {},
    }
    report: dict[str, object] = {
        "dataset": "Building Data Genome Project 2",
        "site_id": SITE_ID,
        "site_location": "United States (site name anonymized)",
        "feature_definition": {
            "features": {
                "previous_reading": "Same meter's reading one hour earlier",
                "previous_day_reading": "Same meter's reading 24 hours earlier",
                "previous_week_reading": "Same meter's reading 168 hours earlier",
                "area_sqm": "Building floor area in square meters",
                "building_use": "Primary building-use category",
                "hour": "Hour of forecast time",
                "day_of_week": "Day of week of forecast time",
                "month": "Month of forecast time",
            },
            "targets": {
                "cooling": "Next-hour chilled-water meter reading",
                "heating": "Next-hour steam meter reading",
            },
        },
        "building_count": len(profiles),
        "validation": {
            "method": "separate validation buildings and dates before the final test period",
            "training_buildings": len(train_ids),
            "validation_buildings": len(validation_ids),
            "validation_start": str(validation_start),
            "validation_end": str(test_start - pd.Timedelta(hours=1)),
        },
        "test": {
            "method": "unseen buildings, final chronological 30 days",
            "test_buildings": len(test_ids),
            "test_start": str(test_start),
            "test_end": "2017-12-31 23:00:00",
        },
        "targets": {},
        "limitations": [
            "Overseas demonstration data from one anonymized US site, not a Korean building model.",
            "Meter units and conventions are not stated; values are kept on their original scale.",
            "Heating uses steam meters and cooling uses chilled-water meters.",
            "R² is a regression metric, not classification accuracy; MAE is also reported.",
            "The baseline that copies the previous reading can outperform the structure-aware model.",
            "Forecast is one hour ahead and requires the latest meter reading for the selected building.",
        ],
    }

    for target, data in datasets.items():
        validation_results: dict[str, dict[str, float]] = {}
        for iteration, config in FEATURE_ITERATIONS.items():
            feature_names = config["features"]
            valid_rows = data[feature_names + ["target"]].notna().all(axis=1)
            train_mask = (
                (data.index < validation_start)
                & data["building_id"].isin(train_ids)
                & valid_rows
            )
            validation_mask = (
                (data.index >= validation_start)
                & (data.index < test_start)
                & data["building_id"].isin(validation_ids)
                & valid_rows
            )
            train_frame = data.loc[train_mask]
            validation_frame = data.loc[validation_mask]
            if len(train_frame) < 1000 or len(validation_frame) < 500:
                raise ValueError(
                    f"Not enough validation rows for {target}/{iteration}: "
                    f"{len(train_frame)}/{len(validation_frame)}."
                )
            model = make_model(feature_names, config["model"])
            model.fit(train_frame[feature_names], train_frame["target"])
            predictions = np.maximum(
                model.predict(validation_frame[feature_names]), 0
            )
            validation_results[iteration] = regression_metrics(
                validation_frame["target"], predictions
            )

        selected_iteration = min(
            validation_results,
            key=lambda name: validation_results[name]["mae"],
        )
        selected_config = FEATURE_ITERATIONS[selected_iteration]
        selected_features = selected_config["features"]
        valid_rows = data[selected_features + ["target"]].notna().all(axis=1)
        final_train_mask = (
            (data.index < test_start)
            & ~data["building_id"].isin(test_ids)
            & valid_rows
        )
        test_mask = (
            (data.index >= test_start)
            & data["building_id"].isin(test_ids)
            & valid_rows
        )
        final_train = data.loc[final_train_mask]
        test_frame = data.loc[test_mask]
        if len(final_train) < 1000 or len(test_frame) < 500:
            raise ValueError(f"Not enough final test rows for {target}.")

        final_model = make_model(selected_features, selected_config["model"])
        final_model.fit(final_train[selected_features], final_train["target"])
        predictions = np.maximum(final_model.predict(test_frame[selected_features]), 0)
        baseline_predictions = test_frame["previous_reading"].to_numpy()
        bundle["models"][target] = {
            "strategy": selected_config["model"],
            "selected_iteration": selected_iteration,
            "features": selected_features,
            "estimator": final_model,
        }
        report["targets"][target] = {
            "meter_type": METER_LABELS[target],
            "selected_iteration": selected_iteration,
            "selected_model": selected_config["model"],
            "features": selected_features,
            "validation_mae_by_iteration": {
                name: metrics["mae"] for name, metrics in validation_results.items()
            },
            "validation_r2_by_iteration": {
                name: metrics["r2"] for name, metrics in validation_results.items()
            },
            "training_rows": int(len(final_train)),
            "held_out_test_rows": int(len(test_frame)),
            "held_out_test_buildings": int(test_frame["building_id"].nunique()),
            "model_metrics": regression_metrics(test_frame["target"], predictions),
            "previous_reading_baseline_metrics": regression_metrics(
                test_frame["target"], baseline_predictions
            ),
        }

    bundle["test_metrics"] = {
        target: {
            "model": result["model_metrics"],
            "previous_reading_baseline": result["previous_reading_baseline_metrics"],
        }
        for target, result in report["targets"].items()
    }
    bundle["default_building_id"] = (
        "Eagle_education_Alberto"
        if "Eagle_education_Alberto" in profiles
        else next(iter(profiles))
    )
    ARTIFACT_ROOT.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)
    METRICS_PATH.write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    return report


if __name__ == "__main__":
    print(json.dumps(train(), ensure_ascii=False, indent=2))
