"""
STEP 3 - Apply reserve_model_v3 over a real Balaghat pixel grid.

Creates a ~200 m grid covering the Balaghat AOI (21.83N, 80.23E, 10 km box),
samples the SAME real satellite features as training - band_ratio, sar_vv
(S2/S1) plus ndvi, lst_celsius, soil_moisture (MODIS/SMAP) - at every grid
node via Earth Engine, and runs reserve_model_v3.pkl to get a
manganese-occurrence probability per node.

Geological proxies (Fault_Distance_km, Lineament_Density_km_per_km2,
Elevation_m) are estimated by inverse-distance-weighted averaging of the
5 nearest training sites, which avoids the artificial step boundaries a single
nearest-neighbour produces.

Writes data/balaghat_prediction_grid.csv  (latitude, longitude, probability)

Run:  python backend/predict_balaghat_grid.py
"""

import os

import ee
import joblib
import numpy as np
import pandas as pd

from gee_features import (init_ee, sample_at_points, sample_env_features,
                          ZONE_LAT, ZONE_LON)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
FEATURES_CSV = os.path.join(DATA_DIR, "training_features_full.csv")
MODEL_PKL = os.path.join(SCRIPT_DIR, "reserve_model_v3.pkl")
OUT_CSV = os.path.join(DATA_DIR, "balaghat_prediction_grid.csv")

GEO_FEATURES = ["Fault_Distance_km", "Lineament_Density_km_per_km2", "Elevation_m"]
ENV_FEATURES = ["ndvi", "lst_celsius", "soil_moisture"]
IDW_K = 5

# Grid geometry: a 10 km x 10 km box around Balaghat at ~200 m spacing.
# 200 m offsets from -5 km to +5 km -> 51 nodes per side (50 cells).
GRID_HALF_M = 5000
SPACING_M = 200
# Probability thresholds matching the reserve map's Low/Medium/High coloring.
LOW_BIN, HIGH_BIN = 0.33, 0.66


def build_grid():
    """Return a DataFrame of lat/lon nodes covering the 10 km Balaghat box."""
    deg_per_m_lat = 360.0 / 40075017.0
    deg_per_m_lon = deg_per_m_lat / np.cos(np.radians(ZONE_LAT))

    offsets_m = np.arange(-GRID_HALF_M, GRID_HALF_M + SPACING_M, SPACING_M)
    lats = ZONE_LAT + offsets_m * deg_per_m_lat
    lons = ZONE_LON + offsets_m * deg_per_m_lon

    lon_grid, lat_grid = np.meshgrid(lons, lats)
    grid = pd.DataFrame({
        "Longitude": lon_grid.ravel(),
        "Latitude": lat_grid.ravel(),
    })
    grid["Site_ID"] = [f"G{i:04d}" for i in range(len(grid))]
    print(f"Grid: {len(lats)} x {len(lons)} = {len(grid)} nodes "
          f"({SPACING_M} m spacing, {GRID_HALF_M * 2 / 1000:.0f} km box)")
    return grid


def _metric_distance_km(grid_ll, train_ll):
    """Approximate great-circle distance (km) between grid and training points.

    Small-area approximation is plenty at the ~10 km scale: lat/lon offsets are
    scaled by 111.32 km/deg and cos(latitude)-adjusted for longitude.
    """
    dlat_deg = grid_ll[:, None, 0] - train_ll[None, :, 0]
    dlon_deg = grid_ll[:, None, 1] - train_ll[None, :, 1]
    cos_lat = np.cos(np.radians(grid_ll[:, 0]))[:, None]
    dx = dlon_deg * 111.32 * cos_lat
    dy = dlat_deg * 111.32
    return np.sqrt(dx ** 2 + dy ** 2)


def idw_geo_proxies(grid, training, k=IDW_K):
    """Inverse-distance-weighted geological features from the k nearest sites.

    Each grid node averages GEO_FEATURES of its k nearest training sites with
    weights = 1/distance, so values vary smoothly instead of snapping to one
    site per Voronoi cell (which caused artificial straight edges).
    """
    train_ll = training[["Latitude", "Longitude"]].to_numpy()
    grid_ll = grid[["Latitude", "Longitude"]].to_numpy()

    dist = _metric_distance_km(grid_ll, train_ll)          # (n_grid, n_train)
    nearest = np.argsort(dist, axis=1)[:, :k]              # (n_grid, k) indices
    d_k = np.take_along_axis(dist, nearest, axis=1)

    # Weights = 1/d; a grid node sitting exactly on a site snaps to that site.
    weights = 1.0 / np.maximum(d_k, 1e-9)
    snapped = d_k[:, 0] < 1e-6
    weights[snapped] = 0.0
    weights[snapped, 0] = 1.0
    weights = weights / weights.sum(axis=1, keepdims=True)

    proxies = {}
    for col in GEO_FEATURES:
        vals = training[col].to_numpy()[nearest]           # (n_grid, k)
        proxies[col] = (vals * weights).sum(axis=1)
    return pd.DataFrame(proxies)


def nearest_geo_proxies(grid, training):
    """Single nearest site (old behaviour) - kept for the artifact check."""
    train_ll = training[["Latitude", "Longitude"]].to_numpy()
    grid_ll = grid[["Latitude", "Longitude"]].to_numpy()
    dist = _metric_distance_km(grid_ll, train_ll)
    nearest = dist.argmin(axis=1)
    return training.iloc[nearest][GEO_FEATURES].reset_index(drop=True)


def largest_uniform_block(geo_values, n_side):
    """Largest 4-connected block of grid nodes with identical geo values.

    geo_values: DataFrame of the GEO_FEATURES columns, one row per grid node
    (grid order must match build_grid's row-major ravel). n_side: grid nodes
    per side. Returns (block_size, sample_tuple) where block_size == 1 means no
    two neighbouring cells share identical geological features (the old
    single-nearest bug is gone).
    """
    codes, _ = pd.factorize(
        geo_values.apply(lambda r: tuple(r), axis=1).to_numpy()
    )
    codes = codes.reshape(n_side, n_side)

    visited = np.zeros_like(codes, dtype=bool)
    largest = 0
    sample = None
    for r in range(n_side):
        for c in range(n_side):
            if visited[r, c]:
                continue
            # BFS over 4-connected cells sharing the same code
            stack = [(r, c)]
            visited[r, c] = True
            size = 0
            while stack:
                i, j = stack.pop()
                size += 1
                for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ni, nj = i + di, j + dj
                    if (0 <= ni < n_side and 0 <= nj < n_side
                            and not visited[ni, nj]
                            and codes[ni, nj] == codes[i, j]):
                        visited[ni, nj] = True
                        stack.append((ni, nj))
            if size > largest:
                largest = size
                sample = geo_values.iloc[r * n_side + c].to_dict()
    return largest, sample


def main():
    init_ee()
    bundle = joblib.load(MODEL_PKL)
    model = bundle["model"]
    model_features = bundle["features"]
    print(f"Loaded reserve_model_v3.pkl (features: {model_features})")

    training = pd.read_csv(FEATURES_CSV)
    print(f"Training sites for geo proxies: {len(training)}")

    grid = build_grid()

    # Sample the real satellite features at every grid node (batched in EE).
    points_fc = ee.FeatureCollection([
        ee.Feature(
            ee.Geometry.Point([row["Longitude"], row["Latitude"]]),
            {"Site_ID": row["Site_ID"]},
        )
        for _, row in grid.iterrows()
    ])
    print("Sampling band_ratio + sar_vv at grid nodes from Earth Engine...")
    sampled = sample_at_points(points_fc, scale=20, buffer_m=100,
                               chunk_size=500)
    sat = pd.DataFrame(sampled)
    print(f"Satellite samples returned: {len(sat)}")

    print("Sampling ndvi / lst_celsius / soil_moisture at grid nodes...")
    env_rows = sample_env_features(points_fc, chunk_size=900)
    env = pd.DataFrame(env_rows)
    print(f"Environmental samples returned: {len(env)}")

    features = grid.merge(
        sat[["Site_ID", "band_ratio", "sar_vv"]], on="Site_ID", how="left"
    )
    features = features.merge(env, on="Site_ID", how="left")

    # Environmental rasters are coarse (250 m - 9 km); if a node has no value,
    # fill with the column mean from the training table (same convention used
    # when the training features were built).
    for col in ENV_FEATURES:
        if features[col].isna().any():
            mean_val = training[col].mean()
            features[col] = features[col].fillna(mean_val)
            print(f"  filled {col} at grid nodes with training mean {mean_val:.4f}")

    # Artifact check: compare the largest contiguous block of nodes that share
    # IDENTICAL geological proxy values under the old (single nearest) and new
    # (IDW over 5 nearest) schemes. A big block means whole regions are still
    # snapping to one training site -> the artificial boundary would remain.
    n_side = int(round(len(features) ** 0.5))
    old_proxies = nearest_geo_proxies(features, training)
    old_block, old_sample = largest_uniform_block(old_proxies, n_side)
    print("\nArtifact diagnostic (identical geological proxy values):")
    print(f"  old single-nearest:  largest contiguous block = {old_block} nodes")
    print(f"    e.g. values {old_sample}")
    print(f"    unique proxy combos = {old_proxies.drop_duplicates().shape[0]}")

    geo_proxies = idw_geo_proxies(features, training)
    new_block, new_sample = largest_uniform_block(geo_proxies, n_side)
    print(f"  new IDW (k={IDW_K}):  largest contiguous block = {new_block} nodes")
    print(f"    e.g. values {new_sample}")
    print(f"    unique proxy combos = {geo_proxies.drop_duplicates().shape[0]}")
    if new_block > 1:
        print("  WARNING: large identical block still present - check the proxy logic.")
    else:
        print("  OK: no large block of identical geological values - "
              "artificial boundary removed.")

    features = pd.concat([features.reset_index(drop=True),
                          geo_proxies.reset_index(drop=True)], axis=1)

    # Predict only nodes with a full feature vector.
    complete = features.dropna(subset=model_features)
    dropped = len(features) - len(complete)
    if dropped:
        print(f"WARNING: {dropped} grid nodes missing satellite values - skipped")

    X = complete[model_features]
    proba = model.predict_proba(X)[:, 1]

    result = complete[["Latitude", "Longitude"]].copy()
    result["probability"] = proba
    result = result.rename(columns={"Latitude": "latitude",
                                    "Longitude": "longitude"})
    result.to_csv(OUT_CSV, index=False)
    print(f"Saved: {OUT_CSV} ({len(result)} rows)")

    # High/Medium/Low counts using the same cutoffs as the reserve map.
    result["zone"] = pd.cut(
        result["probability"], bins=[-0.01, LOW_BIN, HIGH_BIN, 1.0],
        labels=["Low", "Medium", "High"]
    )
    counts = result["zone"].value_counts()
    print("\nBalaghat prediction grid - zone counts:")
    for zone in ["Low", "Medium", "High"]:
        print(f"  {zone}: {int(counts.get(zone, 0))}")

    print("\nProbability stats:")
    print(result["probability"].describe().to_string())


if __name__ == "__main__":
    main()
