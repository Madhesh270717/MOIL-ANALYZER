"""
Operations AI — Train Production Forecast Model on Phase-1 Two-Mine Data.

Trains a RandomForestRegressor to predict Historical_Production_tonnes from:
  - Annual_Rainfall_mm       (from two-mine live CHIRPS / weather baseline)
  - Manganese_Grade_pct      (from geological grid core mineralogy)
  - Ore_Thickness_m          (from geological formation strata)
  - Average_Drilling_Depth_m (from zone mining level depths)
  - Blast_Count              (from sector blast cycle)
  - Blast_Holes              (from blast drill pattern)
  - Blast_Delay_hours        (from blasting_logs.csv delay logs)
  - Equipment_Downtime_pct   (from equipment_iot_telemetry.csv actual downtime %)

Replaces the retired manganese_historical_data.xlsx synthetic downtime column
with real operational telemetry and blasting data from Phase 1.

Saves:
  - backend/production_forecast_model.pkl ({"model": ..., "features": [...]})

Run:  python backend/train_production_forecast.py
"""

import os
import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import train_test_split

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
TRAIN_CSV = os.path.join(DATA_DIR, "two_mine_production_training.csv")
OUT_MODEL = os.path.join(SCRIPT_DIR, "production_forecast_model.pkl")

FEATURES = [
    "Annual_Rainfall_mm",
    "Manganese_Grade_pct",
    "Ore_Thickness_m",
    "Average_Drilling_Depth_m",
    "Blast_Count",
    "Blast_Holes",
    "Blast_Delay_hours",
    "Equipment_Downtime_pct",
]
TARGET = "Historical_Production_tonnes"

RF_PARAMS = dict(
    n_estimators=300,
    max_depth=8,
    min_samples_leaf=3,
    random_state=42,
)


def main():
    if not os.path.exists(TRAIN_CSV):
        raise FileNotFoundError(f"Missing {TRAIN_CSV}. Run generate_two_mine_datasets.py first.")

    df = pd.read_csv(TRAIN_CSV)
    print(f"Loaded {len(df)} operational records from {TRAIN_CSV}")
    print(
        f"Telemetry Downtime % range: {df['Equipment_Downtime_pct'].min():.1f}% - "
        f"{df['Equipment_Downtime_pct'].max():.1f}% (mean {df['Equipment_Downtime_pct'].mean():.1f}%)"
    )
    print(
        f"Blasting Delay Hours range: {df['Blast_Delay_hours'].min():.1f}h - "
        f"{df['Blast_Delay_hours'].max():.1f}h (mean {df['Blast_Delay_hours'].mean():.1f}h)"
    )

    X = df[FEATURES]
    y = df[TARGET]

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    model = RandomForestRegressor(**RF_PARAMS)
    model.fit(X_train, y_train)

    y_pred = model.predict(X_test)
    r2 = r2_score(y_test, y_pred)
    mae = mean_absolute_error(y_test, y_pred)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))

    print("\n" + "=" * 65)
    print("PRODUCTION FORECAST MODEL (OPERATIONS AI) — RESULT")
    print("=" * 65)
    print(f"Training samples: {len(X_train)}  |  Test samples: {len(X_test)}")
    print(f"R² Score:  {r2:.4f}")
    print(f"MAE:       {mae:,.1f} tonnes")
    print(f"RMSE:      {rmse:,.1f} tonnes")

    # Feature importance ranking
    importances = pd.Series(model.feature_importances_, index=FEATURES).sort_values(ascending=False)
    print("\nFeature importance ranking:")
    print(importances.to_string())

    joblib.dump({"model": model, "features": FEATURES}, OUT_MODEL)
    print(f"\nSaved production forecast model: {OUT_MODEL}")


if __name__ == "__main__":
    main()
