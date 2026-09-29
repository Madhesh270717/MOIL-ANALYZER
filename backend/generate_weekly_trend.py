"""STEP 2 - Balaghat weekly production trend (illustrative forecast).

Generates 8 weeks of ILLUSTRATIVE Balaghat production trend by running
production_forecast_model.pkl eight times with different operational
combinations, plus the current live rainfall value:

    * equipment_downtime_pct : random uniform 5-25%   (realistic range)
    * blast_delay_hours      : random uniform 2-30 hrs (realistic range)
    * Annual_Rainfall_mm     : current live Balaghat value (fallback: historical
                               mean) applied to every week

Predicted weekly production mirrors app.py's weekly-target endpoint: the model's
raw output is treated as the mine's monthly capacity, the same operational-loss
layer used by the simulator is applied, and the result is divided by
WEEKS_PER_MONTH. The values are illustrative - they show how the forecast model
responds to varying operating conditions, not a measured schedule.

Writes data/balaghat_weekly_trend.csv with:
    week_label, predicted_production_tonnes, planned_target_tonnes

Run:  python backend/generate_weekly_trend.py
"""

import json
import os

import joblib
import numpy as np
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
MODEL_PATH = os.path.join(SCRIPT_DIR, "production_forecast_model.pkl")
LIVE_RAINFALL_JSON = os.path.join(DATA_DIR, "balaghat_live_rainfall.json")
OUT_CSV = os.path.join(DATA_DIR, "balaghat_weekly_trend.csv")

# --- Illustrative scenario settings ---
N_WEEKS = 8
SEED = 42                          # reproducible random operational combos
DOWNTIME_RANGE_PCT = (5.0, 25.0)   # equipment downtime %
DELAY_RANGE_HOURS = (2.0, 30.0)    # blast delay hrs
PLANNED_WEEKLY_TARGET_TONNES = 10000.0   # fixed reference planned target

# --- Model inputs mirrored from app.py (Balaghat operating defaults) ---
BALAGHAT_MODEL_DEFAULTS = {
    "Manganese_Grade_pct": 34.0,
    "Ore_Thickness_m": 8.0,
    "Average_Drilling_Depth_m": 150.0,
    "Blast_Count": 60,
    "Blast_Holes": 65,
}

# --- Operational loss layer + unit conversion (mirrors app.py) ---
DEFAULT_MONTHLY_RAINFALL_MM = 120.87   # historical mean (04_Rainfall_Data.csv)
NORMAL_EQUIPMENT_DOWNTIME_PCT = 10.0
NORMAL_BLAST_DELAY_HOURS = 6.0
NORMAL_MONTHLY_RAINFALL_MM = 120.87
DOWNTIME_LOSS_PER_PCT = 0.012
DELAY_LOSS_PER_HOUR = 0.008
RAINFALL_LOSS_PER_MM = 0.0003
MAX_FACTOR_LOSS_FRAC = 0.50
WEEKS_PER_MONTH = 4.345


def load_rainfall():
    """Current live Balaghat monthly rainfall, falling back to the historical mean."""
    try:
        with open(LIVE_RAINFALL_JSON, encoding="utf-8") as f:
            payload = json.load(f)
        return float(payload["monthly_rainfall_mm"]), "live"
    except Exception:
        return DEFAULT_MONTHLY_RAINFALL_MM, "default (live file unavailable)"


def operational_loss_frac(downtime_pct, delay_hours, rainfall_mm):
    """Total fractional loss of monthly capacity from the operational inputs.

    Each factor contributes only above its normal range, capped individually -
    identical to app.py's _operational_losses.
    """
    fracs = [
        max(0.0, downtime_pct - NORMAL_EQUIPMENT_DOWNTIME_PCT) * DOWNTIME_LOSS_PER_PCT,
        max(0.0, delay_hours - NORMAL_BLAST_DELAY_HOURS) * DELAY_LOSS_PER_HOUR,
        max(0.0, rainfall_mm - NORMAL_MONTHLY_RAINFALL_MM) * RAINFALL_LOSS_PER_MM,
    ]
    return sum(min(f, MAX_FACTOR_LOSS_FRAC) for f in fracs)


def main():
    artifact = joblib.load(MODEL_PATH)
    model, features = artifact["model"], artifact["features"]

    rainfall_mm, rainfall_source = load_rainfall()
    rng = np.random.default_rng(SEED)
    downtime = rng.uniform(*DOWNTIME_RANGE_PCT, size=N_WEEKS).round(1)
    delay = rng.uniform(*DELAY_RANGE_HOURS, size=N_WEEKS).round(1)

    print(f"Model: {MODEL_PATH}")
    print(f"Rainfall used for all weeks: {rainfall_mm:.2f} mm "
          f"({rainfall_source})")
    print(f"Illustrative combos: downtime {DOWNTIME_RANGE_PCT[0]:.0f}-"
          f"{DOWNTIME_RANGE_PCT[1]:.0f}%  |  delay "
          f"{DELAY_RANGE_HOURS[0]:.0f}-{DELAY_RANGE_HOURS[1]:.0f} hrs  "
          f"(seed={SEED})\n")

    rows = []
    for i in range(N_WEEKS):
        row = dict(BALAGHAT_MODEL_DEFAULTS)
        row.update({
            "Annual_Rainfall_mm": rainfall_mm,
            "Equipment_Downtime_pct": float(downtime[i]),
            "Blast_Delay_hours": float(delay[i]),
        })
        x = pd.DataFrame([row])[features]
        monthly_capacity = float(model.predict(x)[0])
        loss_frac = operational_loss_frac(downtime[i], delay[i], rainfall_mm)
        monthly_expected = max(0.0, monthly_capacity * (1.0 - loss_frac))
        predicted_weekly = monthly_expected / WEEKS_PER_MONTH

        rows.append({
            "week_label": f"Week {i + 1}",
            "predicted_production_tonnes": round(predicted_weekly, 1),
            "planned_target_tonnes": PLANNED_WEEKLY_TARGET_TONNES,
            # kept for the console table only, not written to the CSV
            "_downtime_pct": float(downtime[i]),
            "_delay_hours": float(delay[i]),
            "_loss_frac": round(loss_frac, 4),
        })

    out = pd.DataFrame(rows)
    print("=" * 78)
    print("BALAGHAT WEEKLY PRODUCTION TREND - ILLUSTRATIVE (8 weeks)")
    print("=" * 78)
    display = out[["week_label", "_downtime_pct", "_delay_hours",
                   "_loss_frac", "predicted_production_tonnes",
                   "planned_target_tonnes"]].rename(columns={
        "_downtime_pct": "downtime_%",
        "_delay_hours": "delay_hrs",
        "_loss_frac": "loss_frac",
    })
    with pd.option_context("display.width", 200):
        print(display.to_string(index=False))

    pred = out["predicted_production_tonnes"]
    print(f"\nPredicted weekly production: min {pred.min():,.0f}  "
          f"max {pred.max():,.0f}  mean {pred.mean():,.0f} tonnes")
    print(f"Planned weekly target (fixed): "
          f"{PLANNED_WEEKLY_TARGET_TONNES:,.0f} tonnes")

    final = out[["week_label", "predicted_production_tonnes",
                 "planned_target_tonnes"]]
    final.to_csv(OUT_CSV, index=False)
    print(f"\nSaved: {OUT_CSV} ({len(final)} rows)")


if __name__ == "__main__":
    main()
