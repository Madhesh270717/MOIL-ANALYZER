"""Fetch Sentinel-2 (iron oxide ratio) and Sentinel-1 (SAR) data for the
Balaghat, MP reserve area and export both as GeoTIFFs to the /data folder."""

import json
import os

import ee
import geemap

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.abspath(os.path.join(SCRIPT_DIR, "..", "data"))
from gee_features import init_ee

# --- Authenticate with Earth Engine ---
init_ee()
print("Authentication successful.")

# --- Area of Interest: Balaghat, MP with 10 km buffer ---
aoi = ee.Geometry.Point([80.2, 21.8]).buffer(10000)
print(f"AOI created around Balaghat (21.8N, 80.2E) with 10 km buffer.")

# --- Sentinel-2: most recent cloud-free image (clouds < 10%) ---
s2 = (
    ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(aoi)
    .filterDate("2024-01-01", "2026-12-31")
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 10))
    .sort("system:time_start", False)
)
s2_count = s2.size().getInfo()
print(f"Cloud-free Sentinel-2 images found: {s2_count}")

s2_image = s2.first()
if s2_image is None:
    raise RuntimeError("No cloud-free Sentinel-2 image found for the AOI.")

s2_date = ee.Date(s2_image.get("system:time_start")).format("YYYY-MM-dd").getInfo()
print(f"Using Sentinel-2 image {s2_image.id().getInfo()} acquired {s2_date}.")

# Iron oxide band ratio: Red (B4) / Blue (B2)
ratio = s2_image.select("B4").divide(s2_image.select("B2")).rename("iron_oxide_ratio")
print("Calculated iron oxide band ratio (Red/Blue).")

# --- Sentinel-1 SAR: most recent GRD pass for the AOI ---
s1 = (
    ee.ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(aoi)
    .filterDate("2024-01-01", "2026-12-31")
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.eq("orbitProperties_pass", "DESCENDING"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VH"))
    .sort("system:time_start", False)
)
s1_count = s1.size().getInfo()
print(f"Sentinel-1 SAR images found: {s1_count}")

s1_image = s1.first().select(["VV", "VH"]).clip(aoi)
s1_date = ee.Date(s1_image.get("system:time_start")).format("YYYY-MM-dd").getInfo()
print(f"Using Sentinel-1 image {s1_image.id().getInfo()} acquired {s1_date}.")

# --- Export both to /data as GeoTIFFs ---
os.makedirs(DATA_DIR, exist_ok=True)

s2_path = os.path.join(DATA_DIR, "balaghat_iron_oxide_ratio.tif")
geemap.ee_export_image(
    ee_object=ratio.clip(aoi),
    filename=s2_path,
    scale=10,
    region=aoi,
)
if not os.path.exists(s2_path):
    raise RuntimeError("Sentinel-2 export failed: no file produced.")
print(f"Exported Sentinel-2 iron oxide ratio -> {s2_path}")

s1_path = os.path.join(DATA_DIR, "balaghat_sentinel1_sar.tif")
# Native S1 GRD is ~10 m, but a ~20 km AOI with 2 bands exceeds the
# thumbnail download limit (~48 MB); resample to 20 m to stay under it.
geemap.ee_export_image(
    ee_object=s1_image,
    filename=s1_path,
    scale=20,
    region=aoi,
)
if not os.path.exists(s1_path):
    raise RuntimeError("Sentinel-1 export failed: no file produced.")
print(f"Exported Sentinel-1 SAR -> {s1_path}")

print("All exports complete.")
