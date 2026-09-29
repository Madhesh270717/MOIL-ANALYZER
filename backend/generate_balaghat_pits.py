"""STEP 1 - Divide the Balaghat AOI into a 6x6 grid of 36 production "pits".

Reads the fine prediction grid (data/balaghat_prediction_grid.csv, ~200 m nodes
over the same 10 km box used for reserve mapping) and buckets every node into
one of 36 equal blocks. Each pit's reserve probability is the mean of the grid
nodes falling inside its boundary - the coarse "pit" view of the same AOI the
Geologist tab shows pixel-by-pixel.

Writes data/balaghat_pits.json with, per pit: id, row/col, centre, bounds
([[south, west], [north, east]] for Leaflet), average reserve probability and
node count. Used by /api/production-simulator-pits.

Run:  python backend/generate_balaghat_pits.py
"""

import json
import os
from datetime import datetime, timezone

import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
GRID_CSV = os.path.join(DATA_DIR, "balaghat_prediction_grid.csv")
OUT_JSON = os.path.join(DATA_DIR, "balaghat_pits.json")

# Same AOI as predict_balaghat_grid.py / app.py: a 10 km box around Balaghat.
ZONE_LAT, ZONE_LON = 21.83, 80.23
GRID_HALF_M = 5000
PITS_PER_SIDE = 6
N_PITS = PITS_PER_SIDE * PITS_PER_SIDE


def aoi_bounds():
    """Lat/lon box of the 10 km AOI (equirectangular, cos-lat corrected)."""
    deg_per_m_lat = 360.0 / 40075017.0
    deg_per_m_lon = deg_per_m_lat / np.cos(np.radians(ZONE_LAT))
    dlat = GRID_HALF_M * deg_per_m_lat
    dlon = GRID_HALF_M * deg_per_m_lon
    return (ZONE_LAT - dlat, ZONE_LON - dlon,   # south, west
            ZONE_LAT + dlat, ZONE_LON + dlon)   # north, east


def build_pits(grid, south, west, north, east, n_side=PITS_PER_SIDE):
    """Bucket every grid node into an n_side x n_side lattice of pits."""
    pit_h = (north - south) / n_side
    pit_w = (east - west) / n_side

    # Row 0 is the southern edge, column 0 the western edge.
    cols = np.floor((grid["longitude"].to_numpy() - west) / pit_w).astype(int)
    rows = np.floor((grid["latitude"].to_numpy() - south) / pit_h).astype(int)
    cols = np.clip(cols, 0, n_side - 1)
    rows = np.clip(rows, 0, n_side - 1)

    work = grid.assign(row=rows, col=cols)
    grouped = work.groupby(["row", "col"])["probability"]
    stats = grouped.agg(["mean", "count"]).to_dict("index")

    overall_mean = float(grid["probability"].mean())
    pits = []
    for row in range(n_side):
        for col in range(n_side):
            key = (row, col)
            if key in stats:
                avg_prob = float(stats[key]["mean"])
                count = int(stats[key]["count"])
            else:
                # Empty cell (shouldn't happen at this resolution): fall back to
                # the AOI mean so the pit still renders.
                avg_prob, count = overall_mean, 0

            p_south = south + row * pit_h
            p_north = p_south + pit_h
            p_west = west + col * pit_w
            p_east = p_west + pit_w
            pits.append({
                "pit_id": f"P{row * n_side + col + 1:02d}",
                "row": row,
                "col": col,
                "center_lat": round((p_south + p_north) / 2, 6),
                "center_lon": round((p_west + p_east) / 2, 6),
                "bounds": [[round(p_south, 6), round(p_west, 6)],
                           [round(p_north, 6), round(p_east, 6)]],
                "avg_probability": round(avg_prob, 4),
                "node_count": count,
            })
    return pits, overall_mean


def main():
    grid = pd.read_csv(GRID_CSV)
    missing = {"latitude", "longitude", "probability"} - set(grid.columns)
    if missing:
        raise KeyError(f"{GRID_CSV} is missing columns: {sorted(missing)}")

    south, west, north, east = aoi_bounds()
    print(f"AOI box: S {south:.6f}  W {west:.6f}  N {north:.6f}  E {east:.6f}")
    print(f"Grid nodes: {len(grid)}  |  splitting into "
          f"{PITS_PER_SIDE}x{PITS_PER_SIDE} = {N_PITS} pits")

    pits, overall_mean = build_pits(grid, south, west, north, east)

    payload = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "aoi": {"center": {"lat": ZONE_LAT, "lon": ZONE_LON},
                "half_width_m": GRID_HALF_M,
                "bounds": [[round(south, 6), round(west, 6)],
                           [round(north, 6), round(east, 6)]]},
        "pits_per_side": PITS_PER_SIDE,
        "grid_mean_probability": round(overall_mean, 4),
        "pits": pits,
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)

    probs = [p["avg_probability"] for p in pits]
    print(f"\nAOI mean probability: {overall_mean:.4f}")
    print(f"Pit probabilities: min {min(probs):.4f}  max {max(probs):.4f}  "
          f"mean {np.mean(probs):.4f}")
    print(f"Nodes per pit: min {min(p['node_count'] for p in pits)}  "
          f"max {max(p['node_count'] for p in pits)}")
    print("\nPits by row (south -> north):")
    for row in range(PITS_PER_SIDE):
        row_pits = [p for p in pits if p["row"] == row]
        print("  " + "  ".join(f"{p['pit_id']}={p['avg_probability']:.2f}"
                               for p in row_pits))
    print(f"\nSaved: {OUT_JSON} ({len(pits)} pits)")


if __name__ == "__main__":
    main()
