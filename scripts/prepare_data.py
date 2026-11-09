from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "raw" / "ENB2012_data.xlsx"
OUTPUT = ROOT / "data" / "processed" / "energy_efficiency.csv"
REPORT = ROOT / "artifacts" / "data_quality.json"

COLUMN_MAP = {
    "X1": "relative_compactness",
    "X2": "surface_area",
    "X3": "wall_area",
    "X4": "roof_area",
    "X5": "overall_height",
    "X6": "orientation",
    "X7": "glazing_area",
    "X8": "glazing_area_distribution",
    "Y1": "heating_load",
    "Y2": "cooling_load",
}
FEATURES = list(COLUMN_MAP.values())[:8]
TARGETS = ["heating_load", "cooling_load"]


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def prepare_data() -> dict[str, object]:
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Expected source workbook at {SOURCE}")

    frame = pd.read_excel(SOURCE, sheet_name=0)
    if list(frame.columns) != list(COLUMN_MAP):
        raise ValueError(f"Unexpected source columns: {list(frame.columns)}")

    frame = frame.rename(columns=COLUMN_MAP)
    if frame.isna().any().any():
        missing = frame.isna().sum()
        raise ValueError(f"Missing values found: {missing[missing > 0].to_dict()}")
    if frame.duplicated().any():
        raise ValueError(f"Exact duplicate rows found: {int(frame.duplicated().sum())}")
    if not (frame[TARGETS] > 0).all().all():
        raise ValueError("Heating and cooling targets must be positive.")
    if not frame["orientation"].isin([2, 3, 4, 5]).all():
        raise ValueError("Orientation contains values outside the documented categories.")
    if not frame["glazing_area_distribution"].isin(range(6)).all():
        raise ValueError("Glazing area distribution contains undocumented categories.")

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.parent.mkdir(parents=True, exist_ok=True)
    frame.to_csv(OUTPUT, index=False, float_format="%.8g")

    report: dict[str, object] = {
        "source_file": SOURCE.name,
        "source_sha256": sha256(SOURCE),
        "processed_file": str(OUTPUT.relative_to(ROOT)),
        "rows": int(len(frame)),
        "columns": list(frame.columns),
        "missing_values": {name: int(count) for name, count in frame.isna().sum().items()},
        "exact_duplicate_rows": int(frame.duplicated().sum()),
        "feature_ranges": {
            name: {"min": float(frame[name].min()), "max": float(frame[name].max())}
            for name in FEATURES
        },
        "target_ranges": {
            name: {"min": float(frame[name].min()), "max": float(frame[name].max())}
            for name in TARGETS
        },
        "geometry_groups": int(
            frame[["relative_compactness", "surface_area", "wall_area", "roof_area", "overall_height"]]
            .drop_duplicates()
            .shape[0]
        ),
        "notes": [
            "Source workbook first worksheet contains 768 simulated building-design records.",
            "No missing values or exact duplicate records were found.",
            "The source does not identify a physical measurement unit for target values; preserve source units.",
            "Model performance on this simulated dataset is not a guarantee for real buildings.",
        ],
    }
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    print(json.dumps(prepare_data(), ensure_ascii=False, indent=2))
