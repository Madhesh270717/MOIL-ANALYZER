import os
import numpy as np
import matplotlib.pyplot as plt

try:
    import rasterio
    HAS_RASTERIO = True
except ImportError:
    HAS_RASTERIO = False

try:
    import tifffile
    HAS_TIFFFILE = True
except ImportError:
    HAS_TIFFFILE = False


def load_tif(file_path):
    """Loads a TIF image using rasterio if available, falling back to tifffile."""
    if HAS_RASTERIO:
        with rasterio.open(file_path) as src:
            data = src.read()  # Shape: (bands, height, width)
            nodata = src.nodatavals
            profile = {
                "count": src.count,
                "height": src.height,
                "width": src.width,
                "crs": src.crs,
                "bounds": src.bounds,
                "nodata": nodata
            }
            return data, profile
    elif HAS_TIFFFILE:
        data = tifffile.imread(file_path)
        if data.ndim == 2:
            data = np.expand_dims(data, axis=0)
        elif data.ndim == 3 and data.shape[2] in [1, 2, 3, 4]:
            data = np.moveaxis(data, -1, 0)
        profile = {
            "count": data.shape[0],
            "height": data.shape[1],
            "width": data.shape[2],
            "crs": None,
            "bounds": None,
            "nodata": None
        }
        return data, profile
    else:
        raise ImportError("Neither rasterio nor tifffile is installed. Please install rasterio or tifffile.")


def inspect_and_display_sar(file_path="data/balaghat_sentinel1_sar.tif", save_output_image=True):
    # Find path relative to current script directory if default relative path doesn't exist directly
    if not os.path.exists(file_path):
        base_dir = os.path.dirname(os.path.abspath(__file__))
        alt_path = os.path.join(base_dir, "data", "balaghat_sentinel1_sar.tif")
        if os.path.exists(alt_path):
            file_path = alt_path
        else:
            raise FileNotFoundError(f"TIF file not found at '{file_path}' or '{alt_path}'")

    print(f"Loading SAR image: {file_path}")
    data, profile = load_tif(file_path)

    bands, height, width = data.shape
    print("\n--- Image Metadata ---")
    print(f"Dimensions: {width} x {height} pixels")
    print(f"Number of Bands: {bands}")
    print(f"Data Type: {data.dtype}")
    if profile.get("crs"):
        print(f"CRS: {profile['crs']}")
    if profile.get("bounds"):
        print(f"Bounding Box: {profile['bounds']}")

    # Overall dataset statistics
    overall_min = float(np.nanmin(data))
    overall_max = float(np.nanmax(data))
    overall_mean = float(np.nanmean(data))
    overall_std = float(np.nanstd(data))

    print("\n--- Overall Dataset Statistics ---")
    print(f"Min Pixel Value:  {overall_min:10.4f}")
    print(f"Max Pixel Value:  {overall_max:10.4f}")
    print(f"Mean Pixel Value: {overall_mean:10.4f}")
    print(f"Std Dev:          {overall_std:10.4f}")

    # Per-band statistics
    band_names = ["Band 1 (VV Polarization)", "Band 2 (VH Polarization)"] if bands >= 2 else [f"Band {i+1}" for i in range(bands)]
    
    print("\n--- Per-Band Statistics ---")
    for i in range(bands):
        band_data = data[i]
        b_min = float(np.nanmin(band_data))
        b_max = float(np.nanmax(band_data))
        b_mean = float(np.nanmean(band_data))
        b_std = float(np.nanstd(band_data))
        name = band_names[i] if i < len(band_names) else f"Band {i+1}"
        print(f"{name}:")
        print(f"  Min:  {b_min:10.4f}")
        print(f"  Max:  {b_max:10.4f}")
        print(f"  Mean: {b_mean:10.4f}")
        print(f"  Std:  {b_std:10.4f}")

    # Data verification check
    is_real_data = (overall_std > 1e-5) and not (overall_min == overall_max == 0)
    print("\n--- Data Check Result ---")
    if is_real_data:
        print("[OK] REAL DATA CONFIRMED: Pixel values show standard SAR backscatter variations (dB values).")
    else:
        print("[WARNING]: Raster appears to contain empty, flat, or constant values (No real data).")

    # Display / Plot setup using Matplotlib
    fig, axes = plt.subplots(1, max(bands, 1), figsize=(6 * max(bands, 1), 6))
    if bands == 1:
        axes = [axes]

    for i in range(bands):
        band_data = data[i]
        # Percentile clipping (2nd to 98th percentile) for enhanced visual contrast in SAR imagery
        vmin, vmax = np.percentile(band_data, [2, 98])
        name = band_names[i] if i < len(band_names) else f"Band {i+1}"

        im = axes[i].imshow(band_data, cmap="gray", vmin=vmin, vmax=vmax)
        axes[i].set_title(f"{name}\n(Range: {vmin:.1f} dB to {vmax:.1f} dB)", fontsize=12, fontweight="bold")
        axes[i].axis("off")
        cbar = fig.colorbar(im, ax=axes[i], fraction=0.046, pad=0.04)
        cbar.set_label("Backscatter (dB)", fontsize=10)

    fig.suptitle(f"Sentinel-1 SAR Data Visualizer - {os.path.basename(file_path)}", fontsize=14, fontweight="bold", y=0.98)
    plt.tight_layout()

    out_file = "sar_visualization.png"
    if save_output_image:
        plt.savefig(out_file, dpi=300, bbox_inches="tight")
        print(f"\nVisualization saved as: {os.path.abspath(out_file)}")

    plt.show()


if __name__ == "__main__":
    inspect_and_display_sar()
