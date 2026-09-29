"""
Shared Google Earth Engine feature helpers for the MOIL satellite pipeline.

Both point sampling (300 training sites) and the Balaghat full-grid prediction
use the SAME imagery definitions here so the model sees consistent features:
  - iron_oxide_ratio : Sentinel-2 SR_HARMONIZED Red/Blue (B4/B2) median composite
  - sar_vv_db / sar_vh_db : Sentinel-1 GRD IW VV/VH median backscatter (dB)
  - elevation_m : SRTM
All three imagery sources are filtered to the same date window and AOI style as
the existing fetch_reserve_data.py exports so values stay comparable.
"""

import json
import os
from datetime import datetime, timedelta, timezone

import ee

def get_ee_credentials():
    """Load Earth Engine credentials from environment variables.

    Supports:
      1. GEE_SERVICE_ACCOUNT_JSON (raw JSON string or file path)
      2. GOOGLE_APPLICATION_CREDENTIALS (file path)
    """
    raw_json = os.environ.get("GEE_SERVICE_ACCOUNT_JSON")
    if raw_json:
        if os.path.isfile(raw_json):
            try:
                with open(raw_json, encoding="utf-8") as f:
                    info = json.load(f)
                return ee.ServiceAccountCredentials(info.get("client_email"), raw_json)
            except Exception:
                pass
        try:
            info = json.loads(raw_json)
            email = info.get("client_email")
            return ee.ServiceAccountCredentials(email, key_data=raw_json)
        except Exception:
            pass

    cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if cred_path and os.path.isfile(cred_path):
        try:
            with open(cred_path, encoding="utf-8") as f:
                info = json.load(f)
            return ee.ServiceAccountCredentials(info.get("client_email"), cred_path)
        except Exception:
            pass

    return None

# Same window the original Balaghat rasters were exported over.
DATE_START = "2024-01-01"
DATE_END = "2026-12-31"

# Balaghat Live Zone center/bounds (must match /api/balaghat-zone in app.py so
# the probability ImageOverlay lines up with the AOI box drawn on the map).
ZONE_LAT, ZONE_LON = 21.83, 80.23
ZONE_RADIUS_M = 10000

# Window for the environmental indicators: the most recent year up to today.
ENV_END = datetime.now(timezone.utc)
ENV_START = (ENV_END - timedelta(days=365)).strftime("%Y-%m-%d")
ENV_END = ENV_END.strftime("%Y-%m-%d")


def init_ee():
    """Authenticate with Earth Engine (environment variable, fallback)."""
    creds = get_ee_credentials()
    if creds:
        try:
            ee.Initialize(creds)
            print("Earth Engine authentication successful (service account).")
            return
        except Exception as exc:
            print(f"Service account initialization warning: {exc}")
    try:
        ee.Initialize()
        print("Earth Engine authentication successful (default/interactive credentials).")
    except Exception as exc:
        raise RuntimeError(
            "Could not initialize Earth Engine. Set GOOGLE_APPLICATION_CREDENTIALS or "
            "GEE_SERVICE_ACCOUNT_JSON environment variable."
        ) from exc


def get_feature_stack_image(region):
    """Return a single multi-band ee.Image with the 4 satellite features.

    region is used only to filter the S2/S1 collections (so the same function
    works for point-cloud bounds and for the Balaghat AOI grid).
    """
    # --- Sentinel-2 iron oxide band ratio (Red/Blue), median composite ---
    s2 = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(DATE_START, DATE_END)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))
    )
    b4_med = s2.select("B4").median()
    b2_med = s2.select("B2").median()
    ratio = b4_med.divide(b2_med).rename("iron_oxide_ratio")

    # --- Sentinel-1 SAR VV/VH (already dB in the COPERNICUS/S1_GRD product) ---
    s1 = (
        ee.ImageCollection("COPERNICUS/S1_GRD")
        .filterBounds(region)
        .filterDate(DATE_START, DATE_END)
        .filter(ee.Filter.eq("instrumentMode", "IW"))
        .filter(ee.Filter.eq("orbitProperties_pass", "DESCENDING"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
        .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    )
    vv = s1.select("VV").median().rename("sar_vv_db")
    vh = s1.select("VH").median().rename("sar_vh_db")

    # --- SRTM elevation (static) ---
    elevation = ee.Image("USGS/SRTMGL1_003").select("elevation").rename("elevation_m")

    return ratio.addBands(vv).addBands(vh).addBands(elevation)


def balaghat_zone_geometry():
    """ee.Geometry rectangle matching the Balaghat Live Zone AOI box.

    Replicates the ~10 km equirectangular box computed in app.py so the exported
    prediction grid covers exactly the box the map draws.
    """
    deg_per_m_lat = 360.0 / 40075017.0
    import math
    deg_per_m_lon = deg_per_m_lat / abs(math.cos(math.radians(ZONE_LAT)))
    dlat = ZONE_RADIUS_M * deg_per_m_lat
    dlon = ZONE_RADIUS_M * deg_per_m_lon
    return ee.Geometry.Rectangle(
        [ZONE_LON - dlon, ZONE_LAT - dlat, ZONE_LON + dlon, ZONE_LAT + dlat]
    )


def sample_at_points(points_fc, scale=20, buffer_m=100, chunk_size=50, verbose=True):
    """Sample the 4 satellite features at each point using a ~buffer_m radius.

    Points are reduced with ee.Reducer.mean() over the buffered area (speckle /
    pixel averaging) at the given scale. Queries are chunked (default 50
    features per EE call) so large point sets stay fast, with optional progress
    output. Returns a list of dicts with the buffered point geometry (lon/lat)
    plus the sampled feature values.
    """
    stack = get_feature_stack_image(points_fc.geometry())
    ids = points_fc.aggregate_array("Site_ID").getInfo()

    rows = []
    total = len(ids)
    for start in range(0, total, chunk_size):
        chunk_ids = ids[start:start + chunk_size]
        chunk = points_fc.filter(ee.Filter.inList("Site_ID", chunk_ids))
        # Carry lon/lat as properties (buffering turns points into polygons)
        chunk = chunk.map(
            lambda f: f.set({
                "Longitude": f.geometry().coordinates().get(0),
                "Latitude": f.geometry().coordinates().get(1),
            })
        )
        buffered = chunk.map(lambda f: f.buffer(buffer_m))
        sampled = stack.reduceRegions(
            collection=buffered,
            reducer=ee.Reducer.mean(),
            scale=scale,
        )
        features = sampled.getInfo()["features"]
        for feature in features:
            props = feature["properties"]
            rows.append({
                "Site_ID": props["Site_ID"],
                "Longitude": props.get("Longitude"),
                "Latitude": props.get("Latitude"),
                "band_ratio": props.get("iron_oxide_ratio"),
                "sar_vv": props.get("sar_vv_db"),
                "sar_vh": props.get("sar_vh_db"),
                "elevation_m": props.get("elevation_m"),
            })
        if verbose:
            print(f"  sampled {min(start + chunk_size, total)}/{total} sites")
    return rows


# ---------------------------------------------------------------------------
# Environmental indicators (geobotanical stress / surface anomaly features)
# ---------------------------------------------------------------------------

# MODIS 16-day NDVI composite (scaled int16, x0.0001 -> -0.2..1.0)
NDVI_COLLECTION = "MODIS/061/MOD13Q1"
NDVI_BAND = "NDVI"
NDVI_SCALE = 0.0001
NDVI_SPACING_M = 250

# MODIS 8-day land-surface temperature (scaled int16 Kelvin x0.02 -> deg C)
LST_COLLECTION = "MODIS/061/MOD11A2"
LST_BAND = "LST_Day_1km"
LST_KELVIN_SCALE = 0.02
LST_SPACING_M = 1000

# USDA/SMAP soil moisture. The originally named NASA_USDA/HSL/SMAP10KM_soil_moisture
# is deprecated (data ends Aug 2022); its successor SPL4SMGP has live data.
SM_COLLECTION = "NASA/SMAP/SPL4SMGP/008"
SM_BAND = "sm_surface"
SM_SPACING_M = 9000


def _recent_mosaic(collection_id, band_name, region, transform=None,
                   start=None, end=None):
    """Newest per-pixel observation (qualityMosaic on time) over the window.

    MODIS composites are 8-16 day products and SMAP L4 is global/near-daily, so
    a short recency window keeps the mosaic light while still picking the most
    recent valid pixel per location (a single newest image can be masked there).
    Returns the mosaic image or None if the window has no images.
    """
    col = (
        ee.ImageCollection(collection_id)
        .filterBounds(region)
        .filterDate(start or ENV_START, end or ENV_END)
        .select(band_name)
    )
    size = int(col.size().getInfo())
    if size == 0:
        return None
    # Add a constant time band so qualityMosaic can pick the newest pixel.
    col = col.map(
        lambda img: img.addBands(
            img.metadata("system:time_start").rename("time_idx")
        )
    )
    image = col.qualityMosaic("time_idx").select(band_name)
    if transform:
        image = transform(image)
    return image


def _window_days(days):
    """Start date string `days` before today (UTC)."""
    start = datetime.now(timezone.utc) - timedelta(days=days)
    return start.strftime("%Y-%m-%d")


def ndvi_image(region):
    """MODIS NDVI (most recent 16-day composite within the last year)."""
    img = _recent_mosaic(
        NDVI_COLLECTION, NDVI_BAND, region,
        transform=lambda x: x.multiply(NDVI_SCALE),
        start=_window_days(365), end=ENV_END,
    )
    return img.rename("ndvi") if img else None


def lst_image(region):
    """MODIS daytime LST (most recent clear-sky composite within the year).

    Recent weeks can be masked by clouds at a site, so a year-long window lets
    qualityMosaic pick the newest valid pixel (only ~46 images/year -> light).
    """
    def to_celsius(x):
        return x.multiply(LST_KELVIN_SCALE).subtract(273.15)
    img = _recent_mosaic(
        LST_COLLECTION, LST_BAND, region,
        transform=to_celsius,
        start=_window_days(365), end=ENV_END,
    )
    return img.rename("lst_celsius") if img else None


def soil_moisture_image(region):
    """SMAP L4 surface soil moisture (most recent ~2 weeks).

    SMAP has near-daily global images (~3000/yr), so the mosaic must stay in a
    short window to avoid the EE user-memory limit.
    """
    img = _recent_mosaic(
        SM_COLLECTION, SM_BAND, region,
        start=_window_days(14), end=ENV_END,
    )
    return img.rename("soil_moisture") if img else None


def _sample_band_chunked(image, points_fc, out_name, scale, chunk_size=50,
                         verbose=True, buffer_m=None):
    """Chunked reduceRegions sampling of a single-band image at each point.

    Points are buffered before reducing (mean over the ~pixel-area footprint);
    an unbuffered point returns null from reduceRegions.
    """
    if buffer_m is None:
        buffer_m = max(100.0, scale / 2.0)
    ids = points_fc.aggregate_array("Site_ID").getInfo()
    # Force the reducer output name to out_name (single-band reduceRegions would
    # otherwise name the property 'mean').
    reducer = ee.Reducer.mean().setOutputs([out_name])
    rows = []
    total = len(ids)
    for start in range(0, total, chunk_size):
        chunk_ids = ids[start:start + chunk_size]
        chunk = points_fc.filter(ee.Filter.inList("Site_ID", chunk_ids))
        buffered = chunk.map(lambda f: f.buffer(buffer_m))
        sampled = image.reduceRegions(
            collection=buffered,
            reducer=reducer,
            scale=scale,
        )
        for feature in sampled.getInfo()["features"]:
            props = feature["properties"]
            rows.append({
                "Site_ID": props["Site_ID"],
                out_name: props.get(out_name),
            })
        if verbose:
            print(f"  {out_name}: sampled {min(start + chunk_size, total)}/{total} sites")
    return rows


def sample_env_features(points_fc, chunk_size=50, verbose=True):
    """Sample ndvi, lst_celsius and soil_moisture at each point (batched).

    Each indicator is taken from its most recent available composite and
    reduced with the mean reducer over the point (native ~250 m / 1 km / 9 km
    resolution respectively). Returns a list of dicts keyed by Site_ID.
    """
    region = points_fc.geometry()

    ndvi = ndvi_image(region)
    lst = lst_image(region)
    sm = soil_moisture_image(region)

    merged = {}
    if ndvi is not None:
        for row in _sample_band_chunked(ndvi, points_fc, "ndvi",
                                        NDVI_SPACING_M, chunk_size, verbose):
            merged.setdefault(row["Site_ID"], {})["ndvi"] = row.get("ndvi")
    if lst is not None:
        for row in _sample_band_chunked(lst, points_fc, "lst_celsius",
                                        LST_SPACING_M, chunk_size, verbose):
            merged.setdefault(row["Site_ID"], {})["lst_celsius"] = row.get("lst_celsius")
    if sm is not None:
        for row in _sample_band_chunked(sm, points_fc, "soil_moisture",
                                        SM_SPACING_M, chunk_size, verbose):
            merged.setdefault(row["Site_ID"], {})["soil_moisture"] = row.get("soil_moisture")

    return [{"Site_ID": sid, **vals} for sid, vals in sorted(merged.items())]

