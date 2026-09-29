"""STEP 1 - Regional production vs reserves overview (real historical data).

Loads the Historical_Data sheet from data/manganese_historical_data.xlsx, keeps the
top 15 sites by Estimated_Reserves_tonnes and writes data/regional_trends.csv with:

    Site_ID, Region, Historical_Production_tonnes, Estimated_Reserves_tonnes

This is real MOIL site data (no synthesis): it gives the Management "Production
Trends" section the regional context around Balaghat, while the Balaghat weekly
trend (generate_weekly_trend.py) stays clearly labelled as illustrative.

Run:  python backend/prepare_regional_trends.py
"""

import os

import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
HISTORY_XLSX = os.path.join(DATA_DIR, "manganese_historical_data.xlsx")
OUT_CSV = os.path.join(DATA_DIR, "regional_trends.csv")

SHEET_NAME = "Historical_Data"
TOP_N_SITES = 15
RESERVE_COLUMN = "Estimated_Reserves_tonnes"
OUT_COLUMNS = ["Site_ID", "Region", "Historical_Production_tonnes",
               "Estimated_Reserves_tonnes"]


def load_top_sites():
    """Top N sites by estimated reserves, richest first."""
    df = pd.read_excel(HISTORY_XLSX, sheet_name=SHEET_NAME)

    missing = [c for c in OUT_COLUMNS if c not in df.columns]
    if missing:
        raise KeyError(f"Missing expected columns in {HISTORY_XLSX}: {missing}")

    top = df.nlargest(TOP_N_SITES, RESERVE_COLUMN)[OUT_COLUMNS].copy()
    top["Site_ID"] = top["Site_ID"].astype(int)
    top["Historical_Production_tonnes"] = (
        top["Historical_Production_tonnes"].round().astype(int)
    )
    top["Estimated_Reserves_tonnes"] = (
        top["Estimated_Reserves_tonnes"].round().astype(int)
    )
    return top.reset_index(drop=True)


def main():
    sites = load_top_sites()
    sites.to_csv(OUT_CSV, index=False)

    print(f"Loaded sheet '{SHEET_NAME}' from {HISTORY_XLSX}")
    print(f"Selected top {TOP_N_SITES} sites by {RESERVE_COLUMN}\n")

    print("=" * 72)
    print("REGIONAL PRODUCTION VS RESERVES - TOP 15 SITES")
    print("=" * 72)
    with pd.option_context("display.width", 200):
        print(sites.to_string(index=False))

    prod = sites["Historical_Production_tonnes"]
    res = sites["Estimated_Reserves_tonnes"]
    print("\nDescriptive stats (tonnes):")
    print(f"  Historical production : min {prod.min():,}  "
          f"max {prod.max():,}  mean {prod.mean():,.0f}")
    print(f"  Estimated reserves    : min {res.min():,}  "
          f"max {res.max():,}  mean {res.mean():,.0f}")
    print(f"  Regions covered       : {sites['Region'].nunique()}")

    print(f"\nSaved: {OUT_CSV} ({len(sites)} rows)")


if __name__ == "__main__":
    main()
