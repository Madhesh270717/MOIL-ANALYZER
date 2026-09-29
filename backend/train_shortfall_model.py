"""
MOIL Production Shortfall / Risk Model
Loads equipment performance downtime + rainfall data, merges per site,
and applies a two-tier rule-based risk score:
  High   = rainfall > p95 OR downtime > p95   (extreme on either axis)
  Medium = rainfall > p85 OR downtime > p85   (elevated on either axis)
  Low    = neither
The thresholds are percentiles of the merged rainfall_mm / downtime_pct
columns (not hardcoded mm / % cutoffs), so the High/Medium/Low split stays
meaningful and roughly constant as the source data changes.

Balaghat (the only site with a live Earth Engine pipeline) uses the live CHIRPS
rainfall exported to /data/live_rainfall.csv by fetch_live_rainfall.py; the
other 299 synthetic sites keep using 04_Rainfall_Data.csv.
Outputs /data/production_risk.csv for the Production Manager dashboard.
"""
import os
import shutil

import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
EQ_CSV = os.path.join(DATA_DIR, "02_Equipment_Performance_Downtime.csv")
RAIN_CSV = os.path.join(DATA_DIR, "04_Rainfall_Data.csv")
LIVE_RAIN_CSV = os.path.join(DATA_DIR, "live_rainfall.csv")
OUT_CSV = os.path.join(DATA_DIR, "production_risk.csv")

# Balaghat is the 301st site, backed by live CHIRPS rainfall.
BALAGHAT_SITE = "Balaghat"
BALAGHAT_LAT, BALAGHAT_LON = 21.83, 80.23

# Where the raw CSVs actually live (user Downloads folder)
RAW_DIR = os.path.join(os.path.expanduser("~"), "Downloads")
EQ_RAW = os.path.join(RAW_DIR, "02_Equipment_Performance_Downtime.csv")
RAIN_RAW = os.path.join(RAW_DIR, "04_Rainfall_Data.csv")


def ensure_source_csvs():
    """Copy the raw CSVs into /data if they are not there yet."""
    for raw, dest in [(EQ_RAW, EQ_CSV), (RAIN_RAW, RAIN_CSV)]:
        if not os.path.exists(dest):
            if not os.path.exists(raw):
                raise FileNotFoundError(f"Missing source CSV: {raw}")
            shutil.copy2(raw, dest)
            print(f"Copied {os.path.basename(raw)} -> {dest}")

# Risk thresholds are re-derived from the merged data on every run (see below);
# these constants control which percentile of each column becomes the cutoff.
HIGH_PCTL = 0.95      # extreme tier -> "High"
MEDIUM_PCTL = 0.85    # elevated tier -> "Medium"


def _load_equipment():
    """Load equipment rows (300 SYN sites) and append a representative
    Balaghat row so the inner merge keeps the live site."""
    equipment = pd.read_csv(EQ_CSV)
    # Representative Balaghat row = regional mean operating/downtime hours.
    balaghat_eq = pd.DataFrame([{
        "Site_ID": BALAGHAT_SITE,
        "Latitude": BALAGHAT_LAT,
        "Longitude": BALAGHAT_LON,
        "Equipment_Type": "Representative",
        "Operating_Hours": equipment["Operating_Hours"].mean(),
        "Downtime_Hours": equipment["Downtime_Hours"].mean(),
        "Equipment_Availability_pct": equipment["Equipment_Availability_pct"].mean(),
        "Mechanical_Failure_Hours": equipment["Mechanical_Failure_Hours"].mean(),
        "Weather_Delay_Hours": equipment["Weather_Delay_Hours"].mean(),
        "Maintenance_Hours": equipment["Maintenance_Hours"].mean(),
        "Fuel_Consumption_L_per_hr": equipment["Fuel_Consumption_L_per_hr"].mean(),
        "Productivity_tonnes_per_hr": equipment["Productivity_tonnes_per_hr"].mean(),
        "Data_Type": "Live",
    }])
    return pd.concat([equipment, balaghat_eq], ignore_index=True)


def _load_rainfall():
    """Load rainfall: the 299 synthetic sites from the old CSV plus Balaghat's
    live CHIRPS rows from live_rainfall.csv."""
    synthetic = pd.read_csv(RAIN_CSV)
    if not os.path.exists(LIVE_RAIN_CSV):
        raise FileNotFoundError(
            f"Missing live rainfall CSV: {LIVE_RAIN_CSV}. Run "
            "backend/fetch_live_rainfall.py first."
        )
    live = pd.read_csv(LIVE_RAIN_CSV)
    live = live[live["Site_ID"] == BALAGHAT_SITE]
    if live.empty:
        raise ValueError(f"No Balaghat rows in {LIVE_RAIN_CSV}.")
    # Keep only the most recent complete month so Balaghat contributes exactly
    # one row to the risk dashboard (mirrors one-observation-per-site format).
    live["_month"] = pd.to_datetime(live["Observation_Date"]).dt.to_period("M")
    latest = live.sort_values("_month").groupby("Site_ID", as_index=False).tail(1)
    latest = latest.drop(columns=["_month"])
    return synthetic, latest


def main():
    ensure_source_csvs()

    # 1. Load equipment (300 SYN + representative Balaghat) and rainfall
    #    (299 synthetic from old CSV + Balaghat live from CHIRPS).
    equipment = _load_equipment()
    synthetic_rain, balaghat_rain = _load_rainfall()
    rainfall = pd.concat([synthetic_rain, balaghat_rain], ignore_index=True)

    print("=" * 60)
    print("PRODUCTION SHORTFALL RISK MODEL")
    print("=" * 60)
    print(f"Equipment rows: {len(equipment)}  |  Rainfall rows: {len(rainfall)}")

    # 2. Merge: equipment has no date column (one summary row per site), rainfall has
    #    one monthly Observation_Date per site -> 1:1 join on Site_ID.
    rain_month = pd.to_datetime(rainfall["Observation_Date"]).dt.to_period("M")
    rainfall["Month"] = rain_month.astype(str)

    monthly = (
        equipment.groupby("Site_ID", as_index=False)
        .agg(
            latitude=("Latitude", "mean"),
            longitude=("Longitude", "mean"),
            Operating_Hours=("Operating_Hours", "sum"),
            Downtime_Hours=("Downtime_Hours", "sum"),
        )
    )

    merged = monthly.merge(
        rainfall[["Site_ID", "Month", "Monthly_Rainfall_mm"]],
        on="Site_ID",
        how="inner",
    )

    # downtime_pct = share of scheduled operating time lost
    merged["downtime_pct"] = (
        merged["Downtime_Hours"] / merged["Operating_Hours"] * 100.0
    )
    merged["rainfall_mm"] = merged["Monthly_Rainfall_mm"]
    merged["date_or_site"] = merged["Site_ID"] + " (" + merged["Month"] + ")"

    print("\nBalaghat live rainfall row(s) feeding the model:")
    print(balaghat_rain[["Observation_Date", "Monthly_Rainfall_mm"]].to_string(index=False))

    # 2.5. Descriptive stats for threshold tuning (percentiles drive the cutoffs)
    print("\nColumn stats (rainfall_mm):")
    print(f"  min: {merged['rainfall_mm'].min():.2f}  max: {merged['rainfall_mm'].max():.2f}"
          f"  mean: {merged['rainfall_mm'].mean():.2f}"
          f"  75th pct: {merged['rainfall_mm'].quantile(0.75):.2f}")
    print("Column stats (downtime_pct):")
    print(f"  min: {merged['downtime_pct'].min():.2f}  max: {merged['downtime_pct'].max():.2f}"
          f"  mean: {merged['downtime_pct'].mean():.2f}"
          f"  75th pct: {merged['downtime_pct'].quantile(0.75):.2f}")

    # 3. Two-tier risk scoring. Thresholds come from the merged distribution
    #    (percentiles), not hardcoded mm / % values.
    rain_hi = merged["rainfall_mm"].quantile(HIGH_PCTL)
    down_hi = merged["downtime_pct"].quantile(HIGH_PCTL)
    rain_med = merged["rainfall_mm"].quantile(MEDIUM_PCTL)
    down_med = merged["downtime_pct"].quantile(MEDIUM_PCTL)

    print(f"\nHigh thresholds  (p{HIGH_PCTL * 100:.0f}):"
          f" rainfall > {rain_hi:.2f} mm | downtime > {down_hi:.2f}%")
    print(f"Medium thresholds (p{MEDIUM_PCTL * 100:.0f}):"
          f" rainfall > {rain_med:.2f} mm | downtime > {down_med:.2f}%")

    high_rain = merged["rainfall_mm"] > rain_hi
    high_down = merged["downtime_pct"] > down_hi
    med_rain = merged["rainfall_mm"] > rain_med
    med_down = merged["downtime_pct"] > down_med

    def score(row):
        if row["high_rain"] or row["high_down"]:
            return "High"
        if row["med_rain"] or row["med_down"]:
            return "Medium"
        return "Low"

    merged["high_rain"] = high_rain
    merged["high_down"] = high_down
    merged["med_rain"] = med_rain
    merged["med_down"] = med_down
    merged["risk_level"] = merged.apply(score, axis=1)

    # 4. Recommended action per the tier the row fell into
    def action(row):
        if row["high_rain"] and row["high_down"]:
            return "Reschedule blasting and redeploy equipment"
        if row["high_rain"]:
            return "Delay outdoor operations and inspect drainage"
        if row["high_down"]:
            return "Prioritize equipment maintenance"
        if row["med_rain"]:
            return "Delay outdoor operations"
        if row["med_down"]:
            return "Prioritize equipment maintenance"
        return "Normal operations"

    merged["recommended_action"] = merged.apply(action, axis=1)

    out = merged[["date_or_site", "rainfall_mm", "downtime_pct",
                  "risk_level", "recommended_action"]]
    out.to_csv(OUT_CSV, index=False)
    print(f"Saved: {OUT_CSV} ({len(out)} rows)")

    # 5. Summary counts
    counts = out["risk_level"].value_counts()
    print("\nRisk summary:")
    for level in ["High", "Medium", "Low"]:
        print(f"  {level}: {int(counts.get(level, 0))}")

    balaghat_row = out[out["date_or_site"].str.startswith(BALAGHAT_SITE)]
    if not balaghat_row.empty:
        print("\nBalaghat risk row:")
        print(balaghat_row.to_string(index=False))


if __name__ == "__main__":
    main()
