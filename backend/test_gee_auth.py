"""Test Google Earth Engine service account authentication and data access."""

import json
import os

import ee

from gee_features import init_ee

init_ee()
print("Authentication successful: Earth Engine initialized.")

# Sample SRTM elevation at a point (e.g., near MOIL's Balaghat mine, Madhya Pradesh)
srtm = ee.Image("USGS/SRTMGL1_003")
point = ee.Geometry.Point([80.19, 21.78])
elevation = srtm.sample(point, scale=30).first().get("elevation").getInfo()

print(f"Data access confirmed: SRTM elevation at sample point is {elevation} m")
