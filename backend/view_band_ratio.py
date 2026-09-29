"""Display the Balaghat iron oxide band ratio GeoTIFF as an image."""

import os

import matplotlib
matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import rasterio

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
TIF_PATH = os.path.join(
    SCRIPT_DIR, "..", "data", "balaghat_iron_oxide_ratio.tif"
)

with rasterio.open(TIF_PATH) as src:
    band_ratio = src.read(1)
    extent = rasterio.plot.plotting_extent(src)

# Stretch to the 2nd-98th percentiles
p2, p98 = np.nanpercentile(band_ratio, (2, 98))

fig, ax = plt.subplots(figsize=(10, 10))

im = ax.imshow(
    band_ratio,
    extent=extent,
    cmap="RdBu_r",
    vmin=p2,
    vmax=p98,
    interpolation="nearest",
)

ax.set_title("Balaghat Iron Oxide Band Ratio (Red/Blue)")
ax.set_xlabel("Easting (m)")
ax.set_ylabel("Northing (m)")

fig.colorbar(im, ax=ax, label="Band ratio")

plt.tight_layout()

output_path = os.path.join(
    SCRIPT_DIR, "..", "data", "balaghat_iron_oxide_ratio.png"
)

plt.savefig(output_path, dpi=150, bbox_inches="tight")
plt.close()

print(f"Plot saved successfully: {output_path}")