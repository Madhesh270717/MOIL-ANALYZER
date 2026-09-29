"""
Data Quality & Integrity Validation Module for MOIL Datasets.

Performs systematic quality checks on all tabular datasets:
  1. Missing / null value audit
  2. Spatial coordinate boundary validation (latitude / longitude inside mine bounds)
  3. Primary key / row duplication check
  4. 0-100 Composite Data Quality Score calculation
  5. Synthetic provenance metadata tagging
"""

import os
import pandas as pd
from mines import MINES

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
DATA_DIR = os.path.join(PROJECT_ROOT, "data")

DATASET_CONFIGS = [
    {
        "id": "geo_grid",
        "name": "Common Geo-Spatial Grid",
        "filename": "geo_grid.csv",
        "key_cols": ["Cell_ID"],
        "lat_col": "Latitude",
        "lon_col": "Longitude",
        "mine_col": "Mine_ID",
        "synthetic": True,
        "description": "Hierarchical spatial grid defining Blocks, Zones and Cells for Balaghat and Ukwa.",
    },
    {
        "id": "geological_grid",
        "name": "Geological Grid Features",
        "filename": "geological_grid.csv",
        "key_cols": ["Cell_ID"],
        "lat_col": "Latitude",
        "lon_col": "Longitude",
        "mine_col": "Mine_ID",
        "synthetic": True,
        "description": "Cell-level mineralogy, rock types, Mn concentrations and structural features.",
    },
    {
        "id": "equipment_telemetry",
        "name": "IoT Equipment Telemetry",
        "filename": "equipment_iot_telemetry.csv",
        "key_cols": ["Reading_ID"],
        "lat_col": None,
        "lon_col": None,
        "mine_col": "Mine_ID",
        "synthetic": True,
        "description": "Multi-timestamp operational telemetry logs (operating hours, downtime, availability, vibration).",
    },
    {
        "id": "blasting_logs",
        "name": "Blasting Operational Logs",
        "filename": "blasting_logs.csv",
        "key_cols": ["Blast_ID"],
        "lat_col": None,
        "lon_col": None,
        "mine_col": "Mine_ID",
        "synthetic": True,
        "description": "Zone-level blast scheduling, drill/charge/clearance delays and firing logs.",
    },
    {
        "id": "geode_seismic_stations",
        "name": "Geode Seismic Proxy Stations",
        "filename": "geode_seismic_stations.csv",
        "key_cols": ["Station_ID"],
        "lat_col": "Latitude",
        "lon_col": "Longitude",
        "mine_col": "Mine_ID",
        "synthetic": True,
        "description": "Geode seismograph proxy survey lines with P-wave (Vp) and S-wave (Vs) velocities.",
    },
    {
        "id": "balaghat_prediction_grid",
        "name": "Balaghat High-Res Prediction Grid",
        "filename": "balaghat_prediction_grid.csv",
        "key_cols": ["node_id"],
        "lat_col": "latitude",
        "lon_col": "longitude",
        "mine_col": None,
        "synthetic": True,
        "description": "Pixel-by-pixel Earth Engine ML prediction nodes across Balaghat 10 km AOI.",
    },
]

def check_missing_values(df):
    """Calculate null / missing value percentages across dataframe."""
    total_cells = df.size
    null_cells = int(df.isna().sum().sum())
    missing_pct = round((null_cells / max(total_cells, 1)) * 100, 2)
    missing_by_col = {col: int(count) for col, count in df.isna().sum().items() if count > 0}
    return {
        "passed": null_cells == 0,
        "null_count": null_cells,
        "missing_pct": missing_pct,
        "columns_with_missing": missing_by_col,
    }

def check_coordinate_bounds(df, lat_col, lon_col, mine_col=None):
    """Verify that all spatial coordinates fall inside valid bounding boxes."""
    if not lat_col or not lon_col or lat_col not in df.columns or lon_col not in df.columns:
        return {"checked": False, "passed": True, "out_of_bounds_count": 0}

    out_of_bounds = 0
    total = len(df)

    for _, row in df.iterrows():
        lat = float(row[lat_col])
        lon = float(row[lon_col])
        mine_id = str(row.get(mine_col, "balaghat")).lower() if mine_col and mine_col in row else "balaghat"
        mine_info = MINES.get(mine_id, MINES["balaghat"])
        bounds = mine_info["bounds"]  # [[south, west], [north, east]]

        south, west = bounds[0]
        north, east = bounds[1]

        # Allow generous boundary buffer (+-0.03 deg) around mine area
        if not ((south - 0.03) <= lat <= (north + 0.03) and (west - 0.03) <= lon <= (east + 0.03)):
            out_of_bounds += 1

    return {
        "checked": True,
        "passed": out_of_bounds == 0,
        "out_of_bounds_count": out_of_bounds,
        "valid_pct": round(((total - out_of_bounds) / max(total, 1)) * 100, 2),
    }

def check_duplicate_rows(df, key_cols):
    """Verify primary key uniqueness and full duplicate row detection."""
    full_duplicates = int(df.duplicated().sum())
    key_duplicates = 0
    valid_key_cols = [c for c in key_cols if c in df.columns]

    if valid_key_cols:
        key_duplicates = int(df.duplicated(subset=valid_key_cols).sum())

    total = len(df)
    passed = (full_duplicates == 0 and key_duplicates == 0)

    return {
        "passed": passed,
        "full_duplicate_count": full_duplicates,
        "key_duplicate_count": key_duplicates,
        "evaluated_keys": valid_key_cols,
    }

def audit_dataset(config, data_dir=DATA_DIR):
    """Run full suite of data quality checks on a single dataset."""
    file_path = os.path.join(data_dir, config["filename"])
    if not os.path.exists(file_path):
        # Fall back to backend/data
        file_path = os.path.join(SCRIPT_DIR, "data", config["filename"])

    if not os.path.exists(file_path):
        return {
            "id": config["id"],
            "name": config["name"],
            "status": "missing_file",
            "file": config["filename"],
            "quality_score": 0,
            "synthetic": config["synthetic"],
            "error": "File not found",
        }

    df = pd.read_csv(file_path)
    total_rows = len(df)

    # 1. Missing values
    missing = check_missing_values(df)

    # 2. Coordinates
    bounds = check_coordinate_bounds(df, config.get("lat_col"), config.get("lon_col"), config.get("mine_col"))

    # 3. Duplicates
    duplicates = check_duplicate_rows(df, config.get("key_cols", []))

    # 4. Composite Quality Score (0 - 100)
    # Deductions: missing values (up to -40), duplicates (up to -30), out of bounds (up to -30)
    score = 100.0
    if missing["null_count"] > 0:
        score -= min(missing["missing_pct"] * 4, 40.0)
    if duplicates["key_duplicate_count"] > 0:
        score -= min((duplicates["key_duplicate_count"] / max(total_rows, 1)) * 100, 30.0)
    if bounds.get("checked") and not bounds["passed"]:
        score -= min((bounds["out_of_bounds_count"] / max(total_rows, 1)) * 100, 30.0)

    quality_score = max(round(score, 1), 0.0)

    return {
        "id": config["id"],
        "name": config["name"],
        "filename": config["filename"],
        "total_records": total_rows,
        "columns_count": len(df.columns),
        "quality_score": quality_score,
        "status": "healthy" if quality_score >= 90 else "warning" if quality_score >= 70 else "critical",
        "synthetic": config["synthetic"],
        "description": config["description"],
        "checks": {
            "missing_values": missing,
            "coordinate_bounds": bounds,
            "duplicates": duplicates,
        },
    }

def audit_all_datasets(data_dir=DATA_DIR):
    """Run data quality audit across all registered datasets."""
    results = []
    overall_scores = []

    for cfg in DATASET_CONFIGS:
        res = audit_dataset(cfg, data_dir)
        results.append(res)
        if "quality_score" in res:
            overall_scores.append(res["quality_score"])

    avg_score = round(sum(overall_scores) / max(len(overall_scores), 1), 1)

    datasets_dict = {}
    for d in results:
        datasets_dict[d["id"]] = d
    if "geode_seismic_stations" in datasets_dict:
        datasets_dict["seismic_stations"] = datasets_dict["geode_seismic_stations"]

    return {
        "datasets": datasets_dict,
        "datasets_list": results,
        "overall_quality_score": avg_score,
        "overall_data_quality_score": avg_score,
        "total_datasets_audited": len(results),
        "all_healthy": all(d.get("status") == "healthy" for d in results),
        "timestamp": pd.Timestamp.now(tz="UTC").isoformat(),
    }

if __name__ == "__main__":
    audit = audit_all_datasets()
    print(f"Overall Data Quality Score: {audit['overall_data_quality_score']} / 100")
    for d in audit["datasets"]:
        print(f" - {d['name']} ({d.get('filename')}): {d.get('quality_score', 0)}% [{d.get('status')}]")
