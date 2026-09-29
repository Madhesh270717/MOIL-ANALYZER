"""Fetch live CHIRPS daily rainfall for the Balaghat AOI.

Exports two artifacts from the same CHIRPS (UCSB-CHG/CHIRPS/DAILY) fetch over
the last 90 days:

* /data/live_rainfall.csv   - per-month totals used by train_shortfall_model.py
* /data/balaghat_live_rainfall.json - the most recent full month's total, as
  {"monthly_rainfall_mm": <value>, "fetched_at": "<timestamp>"}, consumed by the
  Production Manager simulator (/api/production-simulator).

Each day's rainfall over the ~10 km Balaghat AOI is reduced with a region mean
(mm/day), then the daily means are summed per calendar month.

Run:  python backend/fetch_live_rainfall.py
"""

import json
import os
from datetime import datetime, timedelta, timezone

import ee
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
from gee_features import init_ee

OUT_CSV = os.path.join(DATA_DIR, "live_rainfall.csv")
OUT_JSON = os.path.join(DATA_DIR, "balaghat_live_rainfall.json")

# Balaghat mine center (matches the /api/balaghat-zone AOI used by app.py)
AOI_LAT, AOI_LON = 21.83, 80.23
AOI_RADIUS_M = 10000
DAYS_BACK = 90

# CHIRPS collection
CHIRPS_COLLECTION = "UCSB-CHG/CHIRPS/DAILY"


def fetch_daily_rainfall(start, end, aoi):
    """Return a pandas DataFrame of date -> daily mean rainfall (mm) over aoi."""
    daily = (
        ee.ImageCollection(CHIRPS_COLLECTION)
        .filterBounds(aoi)
        .filterDate(start.isoformat(), end.isoformat())
    )
    count = int(daily.size().getInfo())
    if count == 0:
        raise RuntimeError("No CHIRPS daily images found for the Balaghat AOI "
                           "in the requested period.")

    def day_mean(img):
        # Region mean of the 'precipitation' band gives a representative mm/day
        # for the whole ~10 km AOI.
        mean = img.select("precipitation").reduceRegion(
            reducer=ee.Reducer.mean(), geometry=aoi, scale=5500, bestEffort=True
        )
        return img.set("date", img.date().format("YYYY-MM-dd")).set(
            "rain_mm", mean.get("precipitation")
        )

    # One server round-trip: ImageCollection.getInfo() returns each image's
    # properties (including the date/rain_mm we just set).
    features = daily.map(day_mean).getInfo()["features"]

    records = []
    for feature in features:
        props = feature["properties"]
        date_str = props.get("date")
        rain = props.get("rain_mm")
        if date_str and rain is not None:
            records.append({"date": date_str, "rain_mm": float(rain)})
    df = pd.DataFrame(records)
    df["date"] = pd.to_datetime(df["date"])
    return df.sort_values("date").reset_index(drop=True)


def monthly_summary(df):
    """Aggregate daily rainfall rows into per-month totals (live rainfall)."""
    out = (
        df.assign(month=df["date"].dt.to_period("M").astype(str))
        .groupby("month", as_index=False)
        .agg(
            Monthly_Rainfall_mm=("rain_mm", "sum"),
            Rainfall_24h_mm=("rain_mm", "max"),
            Rainy_Days_per_Month=("rain_mm", lambda s: int((s >= 1.0).sum())),
        )
    )
    return out


def latest_full_month_total(monthly, reference=None):
    """Return (month_str, total_mm) for the most recent COMPLETE calendar month.

    The current month is excluded because it is still partial. If the target
    month is missing from the fetched window (CHIRPS publishing lag), the latest
    complete month actually present is used instead.
    """
    ref = reference or datetime.now(timezone.utc)
    this_month = ref.strftime("%Y-%m")
    complete = monthly[monthly["month"] < this_month]
    if complete.empty:
        raise RuntimeError("No complete calendar month found in the fetched "
                           "window; extend DAYS_BACK.")
    target = (ref.replace(day=1) - timedelta(days=1)).strftime("%Y-%m")
    match = complete[complete["month"] == target]
    row = match.iloc[0] if not match.empty else complete.iloc[-1]
    return row["month"], float(row["Monthly_Rainfall_mm"])


def main():
    init_ee()

    end = datetime.now(timezone.utc)
    start = end - timedelta(days=DAYS_BACK)
    print(f"Fetching CHIRPS daily rainfall {start.date()} .. {end.date()} "
          f"({DAYS_BACK} days) over Balaghat AOI "
          f"({AOI_LAT}, {AOI_LON} +/- {AOI_RADIUS_M / 1000:.0f} km).")

    aoi = ee.Geometry.Point([AOI_LON, AOI_LAT]).buffer(AOI_RADIUS_M)
    daily = fetch_daily_rainfall(start, end, aoi)
    print(f"Daily records fetched: {len(daily)}  "
          f"(range {daily['date'].min().date()} .. {daily['date'].max().date()})")
    print(f"\nDaily rainfall stats (mm):")
    print(f"  min: {daily['rain_mm'].min():.2f}  max: {daily['rain_mm'].max():.2f}"
          f"  mean: {daily['rain_mm'].mean():.2f}")

    monthly = monthly_summary(daily)
    print(f"\nMonthly totals (mm):")
    for _, row in monthly.iterrows():
        print(f"  {row['month']}: {row['Monthly_Rainfall_mm']:.1f}  "
              f"(rainy days >= 1mm: {row['Rainy_Days_per_Month']}, "
              f"max 24h: {row['Rainfall_24h_mm']:.1f})")

    # Build the CSV in the same shape as 04_Rainfall_Data.csv so the shortfall
    # model can read it without schema changes.
    rows = []
    for _, row in monthly.iterrows():
        month_end = (pd.Period(row["month"], freq="M").end_time).date()
        rows.append({
            "Site_ID": "Balaghat",
            "Latitude": AOI_LAT,
            "Longitude": AOI_LON,
            "Observation_Date": month_end.isoformat(),
            "Annual_Rainfall_mm": daily["rain_mm"].sum(),
            "Monthly_Rainfall_mm": round(float(row["Monthly_Rainfall_mm"]), 2),
            "Rainfall_24h_mm": round(float(row["Rainfall_24h_mm"]), 2),
            "Rainy_Days_per_Month": int(row["Rainy_Days_per_Month"]),
            "Max_24h_Rainfall_mm": round(float(row["Rainfall_24h_mm"]), 2),
            "Drought_Index": "",
            "Rainfall_Anomaly_pct": "",
        })
    live = pd.DataFrame(rows)
    live.to_csv(OUT_CSV, index=False)
    print(f"\nSaved: {OUT_CSV} ({len(live)} rows)")

    # Most recent full month's total -> JSON for the production simulator.
    month_str, monthly_mm = latest_full_month_total(monthly)
    payload = {
        "monthly_rainfall_mm": round(monthly_mm, 2),
        "fetched_at": datetime.now(timezone.utc).isoformat(),
    }
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)
    print(f"Most recent full month: {month_str} -> "
          f"{payload['monthly_rainfall_mm']} mm")
    print(f"Saved: {OUT_JSON}")


if __name__ == "__main__":
    main()
