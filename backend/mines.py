"""
Central MOIL Mine Registry for the two active operating mines:
1. Balaghat (Bharveli) Mine (Madhya Pradesh)
2. Ukwa Mine (Madhya Pradesh)

Every new dataset (geology, IoT equipment, blasting logs, seismic stations,
and rainfall) is keyed by this registry.
"""

import json
import os

MINES = {
    "balaghat": {
        "id": "balaghat",
        "name": "Balaghat (Bharveli) Mine",
        "short_name": "Balaghat",
        "code": "BGT",
        "district": "Balaghat, Madhya Pradesh",
        "state": "Madhya Pradesh",
        "type": "Underground",
        "lat": 21.83,
        "lon": 80.23,
        "latitude": 21.83,
        "longitude": 80.23,
        "center": [21.83, 80.23],
        "bounds": [[21.78, 80.18], [21.88, 80.28]],
        "radius_m": 5000,
        "real_world_fact": (
            "Largest and deepest underground manganese mine operated by MOIL. "
            "Real-world reference location in Bharveli, Balaghat district."
        ),
        "note": "Numeric cell readings, equipment logs and sensor values are synthetic / simulated for dashboard use.",
    },
    "ukwa": {
        "id": "ukwa",
        "name": "Ukwa Mine",
        "short_name": "Ukwa",
        "code": "UKW",
        "district": "Balaghat, Madhya Pradesh",
        "state": "Madhya Pradesh",
        "type": "Underground",
        "lat": 21.97,
        "lon": 80.47,
        "latitude": 21.97,
        "longitude": 80.47,
        "center": [21.97, 80.47],
        "bounds": [[21.92, 80.42], [22.02, 80.52]],
        "radius_m": 5000,
        "real_world_fact": (
            "Opened in 1962, historical reserve estimate ~8.6 MT as of 2012 per public IBM records. "
            "Features a continuous manganese ore body extending over a 5 km strike length. Real-world reference fact."
        ),
        "note": "Numeric cell readings, equipment logs and sensor values are synthetic / simulated for dashboard use.",
    },
}

def get_mine(mine_id, default=None):
    """Retrieve mine configuration by ID or default (None) if not found."""
    if not mine_id:
        return default
    return MINES.get(str(mine_id).lower(), default)

def list_mines():
    """Return list of mine summary objects."""
    return list(MINES.values())

def export_mines_json(output_path):
    """Export the registry to a JSON file."""
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(MINES, f, indent=2)

if __name__ == "__main__":
    current_dir = os.path.dirname(os.path.abspath(__file__))
    data_dir = os.path.join(current_dir, "..", "data")
    export_mines_json(os.path.join(data_dir, "mines.json"))
    print("Exported data/mines.json successfully.")
