"""
STEP 1 (v2) - Add real environmental indicators to the 300-site training data.

Loads data/training_features_with_satellite.csv (300 sites with band_ratio and
sar_vv already sampled) and adds three more real satellite features per site:
  - ndvi          : MODIS MOD13Q1 NDVI (most recent 16-day composite, x0.0001)
  - lst_celsius   : MODIS MOD11A2 daytime LST (most recent clear-sky composite,
                    scaled Kelvin -> deg C)
  - soil_moisture : SMAP L4 SPL4SMGP surface soil moisture (most recent)
Values missing for a site are filled with the column mean (per the spec).

Saves data/training_features_full.csv with all columns.

Run:  python backend/fetch_training_features_v2.py
"""

import os

import ee
import pandas as pd

from gee_features import init_ee, sample_env_features

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
INPUT_CSV = os.path.join(DATA_DIR, "training_features_with_satellite.csv")
OUT_CSV = os.path.join(DATA_DIR, "training_features_full.csv")

ENV_COLS = ["ndvi", "lst_celsius", "soil_moisture"]
CHUNK = 50


def main():
    init_ee()

    df = pd.read_csv(INPUT_CSV)
    print(f"Base training table loaded: {len(df)} rows "
          f"({INPUT_CSV.split(chr(92))[-1]})")

    points = ee.FeatureCollection([
        ee.Feature(
            ee.Geometry.Point([row["Longitude"], row["Latitude"]]),
            {"Site_ID": row["Site_ID"]},
        )
        for _, row in df.iterrows()
    ])
    print(f"Sampling environmental features at {len(df)} points "
          f"(chunks of {CHUNK})...")

    env = pd.DataFrame(sample_env_features(points, chunk_size=CHUNK))
    print(f"\nEnvironmental samples returned: {len(env)}")

    # Merge onto the base table (left join keeps all 300 sites).
    out = df.merge(env, on="Site_ID", how="left")

    # Fill any null satellite value with the column mean.
    null_counts = out[ENV_COLS].isna().sum()
    print(f"Nulls before fill:\n{null_counts.to_string()}")
    for col in ENV_COLS:
        if out[col].isna().any():
            mean_val = out[col].mean()
            out[col] = out[col].fillna(mean_val)
            print(f"  filled {col} with column mean {mean_val:.4f}")

    out.to_csv(OUT_CSV, index=False)
    print(f"\nSaved: {OUT_CSV} ({len(out)} rows)")
    print("\nPreview (all feature columns):")
    preview_cols = (["Site_ID", "Latitude", "Longitude",
                     "band_ratio", "sar_vv"] + ENV_COLS)
    print(out[preview_cols].head(5).to_string(index=False))

    print("\nEnvironmental feature stats:")
    print(out[ENV_COLS].describe().to_string())


if __name__ == "__main__":
    main()
