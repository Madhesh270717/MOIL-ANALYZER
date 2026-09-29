"""
STEP 1 - Fetch real satellite features for the 300 MOIL training sites.

Samples real Earth Engine values at each training site:
  - band_ratio : Sentinel-2 iron oxide Red/Blue (B4/B2), cloud-filtered median
                 composite over the 2024-01-01..2026-12-31 window (same imagery
                 definition as the existing Balaghat raster exports)
  - sar_vv     : Sentinel-1 GRD IW VV backscatter (dB), median over the window
Each point is reduced over a ~100 m buffer (mean) so the samples are robust.

The two satellite columns are merged onto the full geological table and written
to data/training_features_with_satellite.csv.

Run:  python backend/fetch_training_features.py
"""

import os

import ee
import pandas as pd

from gee_features import init_ee, sample_at_points

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
GEO_CSV = os.path.join(DATA_DIR, "01_Geological_Data.csv")
OUT_CSV = os.path.join(DATA_DIR, "training_features_with_satellite.csv")

SAMPLE_SCALE_M = 20       # ~20 m pixel scale for the reduce
SAMPLE_BUFFER_M = 100     # ~100 m radius per point
CHUNK = 50                # EE queries batched 50 sites at a time


def main():
    init_ee()

    geo = pd.read_csv(GEO_CSV)
    print(f"Geological training table loaded: {len(geo)} rows")

    # FeatureCollection of the 300 site locations (id = Site_ID)
    points = ee.FeatureCollection(
        [
            ee.Feature(
                ee.Geometry.Point([row["Longitude"], row["Latitude"]]),
                {"Site_ID": row["Site_ID"]},
            )
            for _, row in geo.iterrows()
        ]
    )
    print(f"Sampling satellite features at {len(geo)} points "
          f"(scale={SAMPLE_SCALE_M} m, buffer={SAMPLE_BUFFER_M} m, "
          f"chunks of {CHUNK})...")

    sampled = sample_at_points(
        points,
        scale=SAMPLE_SCALE_M,
        buffer_m=SAMPLE_BUFFER_M,
        chunk_size=CHUNK,
    )
    sat = pd.DataFrame(sampled)
    print(f"\nSatellite samples returned: {len(sat)}")

    # Merge the two requested columns onto the full geological table
    df = geo.merge(
        sat[["Site_ID", "band_ratio", "sar_vv"]],
        on="Site_ID",
        how="left",
    )

    missing = df[["band_ratio", "sar_vv"]].isna().sum()
    print(f"Sites with missing satellite values:\n{missing.to_string()}")

    df.to_csv(OUT_CSV, index=False)
    print(f"\nSaved: {OUT_CSV} ({len(df)} rows)")
    print("\nPreview (first 5 rows with satellite columns):")
    print(df[["Site_ID", "Latitude", "Longitude",
              "band_ratio", "sar_vv"]].head(5).to_string(index=False))


if __name__ == "__main__":
    main()
