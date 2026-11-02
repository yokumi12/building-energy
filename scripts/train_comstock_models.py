from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GroupShuffleSplit

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "raw" / "comstock" / "metadata.parquet"
MODEL_PATH = ROOT / "artifacts" / "comstock_energy_models.joblib"
METRICS_PATH = ROOT / "artifacts" / "comstock_energy_metrics.json"

TARGET_COLUMNS = {
    "heating": [
        "out.electricity.heating.energy_consumption",
        "out.natural_gas.heating.energy_consumption",
        "out.other_fuel.heating.energy_consumption",
        "out.district_heating.heating.energy_consumption",
    ],
    "cooling": [
        "out.electricity.cooling.energy_consumption",
        "out.district_cooling.cooling.energy_consumption",
    ],
}
STRUCTURE_NUMERIC = [
    "in.sqft",
    "in.number_of_stories",
    "in.aspect_ratio",
    "in.rotation",
]
STRUCTURE_CATEGORICAL = [
    "in.building_type",
    "in.climate_zone_ashrae_2004",
    "in.state_abbreviation",
]
OPERATIONAL_NUMERIC = [
    "in.tstat_clg_sp_f",
    "in.tstat_htg_sp_f",
    "in.weekday_operating_hours",
    "in.weekday_opening_time",
    "in.weekend_operating_hours",
    "in.weekend_opening_time",
]
SYSTEM_CATEGORICAL = [
    "in.hvac_system_type",
    "in.heating_fuel",
    "in.energy_code_followed_during_last_hvac_replacement",
    "in.energy_code_followed_during_last_roof_replacement",
    "in.energy_code_followed_during_last_walls_replacement",
    "in.energy_code_followed_during_last_windows_replacement",
]
FEATURE_ITERATIONS = {
    "iteration_1_structure": {
        "numeric": STRUCTURE_NUMERIC,
        "categorical": STRUCTURE_CATEGORICAL,
    },
    "iteration_2_structure_systems_operations": {
        "numeric": STRUCTURE_NUMERIC + OPERATIONAL_NUMERIC,
        "categorical": STRUCTURE_CATEGORICAL + SYSTEM_CATEGORICAL,
    },
}
TARGETS = ["heating", "cooling"]
RANDOM_STATE = 42
MISSING_CATEGORY = "__missing_or_unseen__"
INPUT_LABELS = {
    "in.sqft": ("건물 바닥면적", "ft²"),
    "in.number_of_stories": ("건물 층수", "층"),
    "in.aspect_ratio": ("건물 장단변 비율", "비율"),
    "in.rotation": ("건물 회전 방향", "도"),
    "in.tstat_clg_sp_f": ("냉방 설정 온도", "°F"),
    "in.tstat_htg_sp_f": ("난방 설정 온도", "°F"),
    "in.weekday_operating_hours": ("평일 운영 시간", "시간/일"),
    "in.weekday_opening_time": ("평일 영업 시작 시각", "시각(24시간)"),
    "in.weekend_operating_hours": ("주말 운영 시간", "시간/일"),
    "in.weekend_opening_time": ("주말 영업 시작 시각", "시각(24시간)"),
    "in.building_type": ("건물 유형", ""),
    "in.climate_zone_ashrae_2004": ("ASHRAE 기후대", ""),
    "in.state_abbreviation": ("미국 주", ""),
    "in.hvac_system_type": ("냉난방 시스템 유형", ""),
    "in.heating_fuel": ("난방 연료", ""),
    "in.energy_code_followed_during_last_hvac_replacement": ("HVAC 교체 당시 에너지 기준", ""),
    "in.energy_code_followed_during_last_roof_replacement": ("지붕 교체 당시 에너지 기준", ""),
    "in.energy_code_followed_during_last_walls_replacement": ("벽체 교체 당시 에너지 기준", ""),
    "in.energy_code_followed_during_last_windows_replacement": ("창호 교체 당시 에너지 기준", ""),
}


def load_data() -> pd.DataFrame:
    if not DATA_PATH.is_file():
        raise FileNotFoundError(
            f"ComStock metadata not found at {DATA_PATH}. "
            "Download the files listed in data/raw/comstock/README.md first."
        )

    frame = pd.read_parquet(DATA_PATH)
    if "bldg_id" not in frame.columns:
        frame = frame.reset_index()
    if "bldg_id" not in frame.columns:
        raise ValueError("ComStock metadata must contain a bldg_id column or index.")
    if "upgrade" in frame.columns:
        baseline = frame["upgrade"].astype(str).eq("00")
        frame = frame.loc[baseline].copy()
    if frame["bldg_id"].isna().any():
        raise ValueError("ComStock building IDs must not be missing.")
    if frame["bldg_id"].duplicated().any():
        raise ValueError("Expected one baseline row per ComStock building ID.")
    return frame


def prepare_targets(frame: pd.DataFrame) -> pd.DataFrame:
    result = frame.copy()
    for target, columns in TARGET_COLUMNS.items():
        missing_columns = sorted(set(columns).difference(result.columns))
        if missing_columns:
            raise ValueError(f"Missing {target} target columns: {missing_columns}")
        if result[columns].isna().any().any():
            raise ValueError(
                f"{target} target columns contain missing values; "
                "review applicability before forming annual totals."
            )
        result[f"{target}_kwh"] = result[columns].sum(axis=1)
    return result


def make_features(
    frame: pd.DataFrame,
    numeric: list[str],
    categorical: list[str],
    category_levels: dict[str, list[str]],
) -> pd.DataFrame:
    features = frame[numeric + categorical].copy()
    for column in categorical:
        values = features[column].astype("string").fillna(MISSING_CATEGORY)
        values = values.where(values.isin(category_levels[column]), MISSING_CATEGORY)
        categories = category_levels[column]
        if MISSING_CATEGORY not in categories:
            categories = categories + [MISSING_CATEGORY]
        features[column] = pd.Categorical(values, categories=categories)
    return features


def make_model() -> HistGradientBoostingRegressor:
    return HistGradientBoostingRegressor(
        max_iter=120,
        max_leaf_nodes=31,
        learning_rate=0.08,
        l2_regularization=1.0,
        categorical_features="from_dtype",
        random_state=RANDOM_STATE,
        early_stopping=True,
        validation_fraction=0.1,
        n_iter_no_change=10,
    )


def regression_metrics(actual: pd.Series, predicted: np.ndarray) -> dict[str, float]:
    return {
        "r2": float(r2_score(actual, predicted)),
        "mae_kwh": float(mean_absolute_error(actual, predicted)),
        "rmse_kwh": float(np.sqrt(mean_squared_error(actual, predicted))),
    }


def split_rows(frame: pd.DataFrame) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    row_ids = np.arange(len(frame))
    outer = GroupShuffleSplit(n_splits=1, test_size=0.15, random_state=RANDOM_STATE)
    train_validation, test = next(
        outer.split(row_ids, groups=frame["bldg_id"].astype(str))
    )
    validation_split = GroupShuffleSplit(
        n_splits=1, test_size=0.1765, random_state=43
    )
    train_relative, validation_relative = next(
        validation_split.split(
            train_validation,
            groups=frame.iloc[train_validation]["bldg_id"].astype(str),
        )
    )
    train = train_validation[train_relative]
    validation = train_validation[validation_relative]
    return train, validation, test


def train() -> dict[str, Any]:
    frame = prepare_targets(load_data())
    feature_columns = {
        column
        for iteration in FEATURE_ITERATIONS.values()
        for column in iteration["numeric"] + iteration["categorical"]
    }
    missing_features = sorted(feature_columns.difference(frame.columns))
    if missing_features:
        raise ValueError(f"Missing ComStock input features: {missing_features}")

    train_indices, validation_indices, test_indices = split_rows(frame)
    train_rows = frame.iloc[train_indices]
    validation_rows = frame.iloc[validation_indices]
    train_validation_rows = frame.iloc[
        np.concatenate([train_indices, validation_indices])
    ]
    category_levels = {
        column: sorted(
            frame[column].astype("string").fillna(MISSING_CATEGORY).unique().tolist()
        )
        for column in {
            name
            for iteration in FEATURE_ITERATIONS.values()
            for name in iteration["categorical"]
        }
    }
    input_schema: dict[str, dict[str, Any]] = {}
    for column, (label, unit) in INPUT_LABELS.items():
        if column in STRUCTURE_NUMERIC + OPERATIONAL_NUMERIC:
            values = pd.to_numeric(frame[column], errors="coerce")
            if values.isna().all():
                raise ValueError(f"Numeric feature {column} has no usable values.")
            input_schema[column] = {
                "label": label,
                "unit": unit,
                "kind": "number",
                "min": float(values.min()),
                "max": float(values.max()),
                "default": float(values.median()),
            }
        else:
            values = frame[column].astype("string").fillna(MISSING_CATEGORY)
            input_schema[column] = {
                "label": label,
                "unit": unit,
                "kind": "category",
                "options": category_levels[column],
                "default": str(values.mode().iloc[0]),
            }

    validation_results: dict[str, dict[str, dict[str, float]]] = {}
    for iteration_name, iteration in FEATURE_ITERATIONS.items():
        feature_args = (
            iteration["numeric"],
            iteration["categorical"],
            category_levels,
        )
        x_train = make_features(train_rows, *feature_args)
        x_validation = make_features(validation_rows, *feature_args)
        validation_results[iteration_name] = {}
        for target in TARGETS:
            estimator = make_model().fit(x_train, train_rows[f"{target}_kwh"])
            predictions = np.maximum(estimator.predict(x_validation), 0.0)
            validation_results[iteration_name][target] = regression_metrics(
                validation_rows[f"{target}_kwh"], predictions
            )

    selected_iteration = {
        target: max(
            FEATURE_ITERATIONS,
            key=lambda name: validation_results[name][target]["r2"],
        )
        for target in TARGETS
    }

    models: dict[str, HistGradientBoostingRegressor] = {}
    target_results: dict[str, dict[str, Any]] = {}
    model_features: dict[str, dict[str, list[str]]] = {}
    for target in TARGETS:
        iteration_name = selected_iteration[target]
        iteration = FEATURE_ITERATIONS[iteration_name]
        x_train_validation = make_features(
            train_validation_rows,
            iteration["numeric"],
            iteration["categorical"],
            category_levels,
        )
        x_test = make_features(
            frame.iloc[test_indices],
            iteration["numeric"],
            iteration["categorical"],
            category_levels,
        )
        estimator = make_model().fit(
            x_train_validation, train_validation_rows[f"{target}_kwh"]
        )
        predictions = np.maximum(estimator.predict(x_test), 0.0)
        actual = frame.iloc[test_indices][f"{target}_kwh"]
        mean_baseline = np.full(len(actual), train_validation_rows[f"{target}_kwh"].mean())
        models[target] = estimator
        model_features[target] = {
            "numeric": iteration["numeric"],
            "categorical": iteration["categorical"],
        }
        target_results[target] = {
            "selected_iteration": iteration_name,
            "validation_r2": validation_results[iteration_name][target]["r2"],
            "model": regression_metrics(actual, predictions),
            "mean_baseline": regression_metrics(actual, mean_baseline),
            "test_zero_fraction": float((actual == 0).mean()),
        }

    bundle = {
        "model_version": "comstock-annual-end-use-hgb-v1",
        "dataset": "NREL ComStock 2021 AMY 2018 baseline upgrade 00",
        "target_definition": {
            target: f"Annual {target} end-use energy consumption in kWh"
            for target in TARGETS
        },
        "models": models,
        "features": model_features,
        "category_levels": category_levels,
        "input_schema": input_schema,
        "test_metrics": target_results,
        "training_rows": int(len(train_validation_rows)),
        "test_rows": int(len(test_indices)),
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, MODEL_PATH)

    metrics: dict[str, Any] = {
        "model_version": bundle["model_version"],
        "dataset": bundle["dataset"],
        "target_definition": bundle["target_definition"],
        "algorithm": "HistGradientBoostingRegressor",
        "feature_iterations": {
            name: {
                "numeric_features": value["numeric"],
                "categorical_features": value["categorical"],
            }
            for name, value in FEATURE_ITERATIONS.items()
        },
        "split": {
            "method": "GroupShuffleSplit by unique building ID",
            "random_state": RANDOM_STATE,
            "validation_random_state": 43,
            "train_rows": int(len(train_indices)),
            "validation_rows": int(len(validation_indices)),
            "test_rows": int(len(test_indices)),
            "test_usage": "Used once after validation-based feature selection.",
        },
        "validation": validation_results,
        "selected_iteration_by_target": selected_iteration,
        "test": target_results,
        "limitations": [
            "ComStock labels are simulated annual end-use energy, not direct metered operation or UCI design-load labels.",
            "Results are from a US modeled building stock and should not be generalized to Korean buildings.",
            "R2 is a regression metric, not classification accuracy.",
        ],
    }
    METRICS_PATH.write_text(
        json.dumps(metrics, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return metrics


if __name__ == "__main__":
    print(json.dumps(train(), ensure_ascii=False, indent=2))
