"""Tests for MOIL Manganese Dashboard Flask API."""

import os
import sys
import pytest

# Add backend directory to sys.path so app and gee_features can be imported
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

import app as app_module
from app import app


@pytest.fixture
def client():
    """Create Flask test client."""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


# ============================================================================
# Happy Path Tests (every /api/* route)
# ============================================================================

def test_health(client):
    """Test root health endpoint."""
    res = client.get("/")
    assert res.status_code == 200
    assert b"API is running" in res.data


def test_mines_list(client):
    """Test /api/mines returns the registry with Balaghat and Ukwa."""
    res = client.get("/api/mines")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert len(data) == 2
    mine_ids = [m["id"] for m in data]
    assert "balaghat" in mine_ids
    assert "ukwa" in mine_ids
    bgt = next(m for m in data if m["id"] == "balaghat")
    assert bgt["latitude"] == 21.83
    assert bgt["longitude"] == 80.23
    ukw = next(m for m in data if m["id"] == "ukwa")
    assert ukw["latitude"] == 21.97
    assert ukw["longitude"] == 80.47


def test_mine_detail(client):
    """Test /api/mines/<id> returns single mine metadata."""
    res = client.get("/api/mines/balaghat")
    assert res.status_code == 200
    data = res.get_json()
    assert data["id"] == "balaghat"
    assert "Balaghat" in data["name"]

    res_ukwa = client.get("/api/mines/ukwa")
    assert res_ukwa.status_code == 200
    assert res_ukwa.get_json()["id"] == "ukwa"

    res_invalid = client.get("/api/mines/nonexistent_mine")
    assert res_invalid.status_code == 404


def test_mine_hierarchy(client):
    """Test /api/mines/<id>/hierarchy returns blocks, zones, and cells."""
    res = client.get("/api/mines/balaghat/hierarchy")
    assert res.status_code == 200
    data = res.get_json()
    assert data["mine_id"] == "balaghat"
    assert data["total_cells"] > 0
    assert len(data["blocks"]) > 0
    # verify cell IDs have BGT prefix
    first_block = data["blocks"][0]
    first_zone = first_block["zones"][0]
    assert first_zone["cells"][0]["cell_id"].startswith("BGT-")


def test_mine_geological_grid(client):
    """Test /api/mines/<id>/geological-grid returns cell-level geological data."""
    res = client.get("/api/mines/balaghat/geological-grid")
    assert res.status_code == 200
    data = res.get_json()
    assert "mine" in data
    assert "cells" in data
    assert len(data["cells"]) > 0
    first = data["cells"][0]
    assert "cell_id" in first
    assert "rock_type" in first
    assert "mn_grade_pct" in first
    assert "synthetic" in first.get("data_type", "").lower()


def test_mine_equipment_telemetry(client):
    """Test /api/mines/<id>/equipment-telemetry returns periodic IoT readings."""
    res = client.get("/api/mines/balaghat/equipment-telemetry")
    assert res.status_code == 200
    data = res.get_json()
    assert "mine" in data
    assert "telemetry" in data
    assert len(data["telemetry"]) > 0
    first = data["telemetry"][0]
    assert "equipment_id" in first
    assert "timestamp" in first
    assert "operating_hours" in first


def test_mine_blasting_logs(client):
    """Test /api/mines/<id>/blasting-logs returns stage delays."""
    res = client.get("/api/mines/balaghat/blasting-logs")
    assert res.status_code == 200
    data = res.get_json()
    assert "mine" in data
    assert "blasts" in data
    assert len(data["blasts"]) > 0
    first = data["blasts"][0]
    assert "blast_id" in first
    assert "drill_delay_hrs" in first
    assert "total_cycle_delay_hrs" in first


def test_mine_seismic_stations(client):
    """Test /api/mines/<id>/seismic-stations returns Geode proxy readings."""
    res = client.get("/api/mines/balaghat/seismic-stations")
    assert res.status_code == 200
    data = res.get_json()
    assert "mine" in data
    assert "stations" in data
    assert len(data["stations"]) > 0
    first = data["stations"][0]
    assert "station_id" in first
    assert "vp_m_s" in first
    assert "vs_m_s" in first
    assert "vp_vs_ratio" in first
    assert "synthetic" in first.get("data_type", "").lower()


def test_mine_live_rainfall(client):
    """Test /api/mines/<id>/live-rainfall returns CHIRPS weather data."""
    res = client.get("/api/mines/balaghat/live-rainfall")
    assert res.status_code == 200
    data = res.get_json()
    assert data["mine_id"] == "balaghat"
    assert "rainfall_mm" in data


def test_mine_grid(client):
    """Test GET /api/mines/<mine_id>/grid returns unified Block/Zone/Cell hierarchy with joined data."""
    # Balaghat
    res = client.get("/api/mines/balaghat/grid")
    assert res.status_code == 200
    data = res.get_json()
    assert data["mine_id"] == "balaghat"
    assert "Balaghat" in data["mine_name"]
    assert data["total_cells"] > 0
    assert len(data["blocks"]) > 0
    assert len(data["cells"]) == data["total_cells"]
    assert "summary" in data
    assert "weather" in data
    assert "provenance" in data

    first_cell = data["cells"][0]
    assert "cell_id" in first_cell
    assert "geology" in first_cell
    assert "equipment" in first_cell
    assert "blasting" in first_cell
    assert "seismic" in first_cell
    assert "mn_pct" in first_cell["geology"]
    assert "total_units" in first_cell["equipment"]
    assert "vp_m_s" in first_cell["seismic"]

    # Ukwa
    res_ukwa = client.get("/api/mines/ukwa/grid")
    assert res_ukwa.status_code == 200
    ukwa_data = res_ukwa.get_json()
    assert ukwa_data["mine_id"] == "ukwa"
    assert ukwa_data["total_cells"] > 0

    # 404 for unknown mine
    res_invalid = client.get("/api/mines/invalid_mine/grid")
    assert res_invalid.status_code == 404


def test_mine_zone_detail(client):
    """Test GET /api/mines/<mine_id>/zones/<zone_id> drill-down detail."""
    res = client.get("/api/mines/balaghat/zones/BGT-B1-Z1")
    assert res.status_code == 200
    data = res.get_json()
    assert data["mine_id"] == "balaghat"
    assert data["zone_id"] == "BGT-B1-Z1"
    assert len(data["cells"]) > 0
    assert "equipment_telemetry" in data
    assert "blasting_logs" in data
    assert "seismic_stations" in data
    assert "summary" in data

    # 404 for invalid zone
    res_inv = client.get("/api/mines/balaghat/zones/NON_EXISTENT_ZONE")
    assert res_inv.status_code == 404


def test_mine_zone_metadata(client):
    """Test GET /api/mines/<mine_id>/zone returns AOI and band ratio metadata."""
    res = client.get("/api/mines/balaghat/zone")
    assert res.status_code == 200
    data = res.get_json()
    assert data["mine_id"] == "balaghat"
    assert "bounds" in data["zone"]
    assert "center" in data["zone"]
    assert "band_ratio" in data

    res_ukwa = client.get("/api/mines/ukwa/zone")
    assert res_ukwa.status_code == 200
    assert res_ukwa.get_json()["mine_id"] == "ukwa"


def test_data_quality(client):
    """Test /api/data-quality returns verification scores for all datasets."""
    res = client.get("/api/data-quality")
    assert res.status_code == 200
    data = res.get_json()
    assert "overall_quality_score" in data
    assert data["overall_quality_score"] >= 90.0
    assert "datasets" in data
    assert "geological_grid" in data["datasets"]
    assert "geode_seismic_stations" in data["datasets"]
    for name, report in data["datasets"].items():
        assert report.get("synthetic") is True
        assert "checks" in report


def test_balaghat_prediction_grid(client):
    """Test /api/balaghat-prediction-grid returns pixel nodes."""
    res = client.get("/api/balaghat-prediction-grid")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    if data:
        assert "latitude" in data[0]
        assert "longitude" in data[0]
        assert "probability" in data[0]


def test_balaghat_zone(client):
    """Test /api/balaghat-zone returns AOI bounds and metadata."""
    res = client.get("/api/balaghat-zone")
    assert res.status_code == 200
    data = res.get_json()
    assert "zone" in data
    assert "bounds" in data["zone"]
    assert "band_ratio" in data


def test_production_risk(client):
    """Test /api/production-risk returns risk records."""
    res = client.get("/api/production-risk")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    if data:
        assert "date_or_site" in data[0]
        assert "risk_level" in data[0]


def test_production_risk_summary(client):
    """Test /api/production-risk/summary returns count summaries."""
    res = client.get("/api/production-risk/summary")
    assert res.status_code == 200
    data = res.get_json()
    assert "High" in data
    assert "Medium" in data
    assert "Low" in data
def test_fleet_status(client):
    """Test /api/fleet-status returns equipment status, summary metrics, and redeployment recommendations."""
    res = client.get("/api/fleet-status")
    assert res.status_code == 200
    data = res.get_json()
    assert "summary" in data
    assert "fleet" in data
    assert "recommendations" in data
    assert data.get("is_rule_based") is True
    assert "disclaimer" in data

    summary = data["summary"]
    assert "total_units" in summary
    assert "active_units" in summary
    assert "idle_units" in summary
    assert "maintenance_units" in summary
    assert "breakdown_units" in summary
    assert "avg_oee_pct" in summary
    assert summary["total_units"] > 0

    fleet = data["fleet"]
    assert len(fleet) > 0
    item = fleet[0]
    assert "equipment_id" in item
    assert "equipment_type" in item
    assert "site_id" in item
    assert "status" in item
    assert "fuel_pct" in item
    assert "oee_pct" in item

    recs = data["recommendations"]
    assert len(recs) > 0
    rec = recs[0]
    assert "id" in rec
    assert "equipment_id" in rec
    assert "source_site" in rec
    assert "target_site" in rec
    assert "reason" in rec
    assert rec.get("is_rule_based") is True


def test_fleet_status_filters(client):
    """Test /api/fleet-status query parameter filtering."""
    res_status = client.get("/api/fleet-status?status=Active")
    assert res_status.status_code == 200
    data_status = res_status.get_json()
    assert all(e["status"] == "Active" for e in data_status["fleet"])

    res_type = client.get("/api/fleet-status?type=Excavator")
    assert res_type.status_code == 200
    data_type = res_type.get_json()
    assert all(e["equipment_type"] == "Excavator" for e in data_type["fleet"])


def test_ore_grade_summary(client):
    """Test /api/ore-grade-summary returns 4 grade bands, tonnage, counts, and indicative suitability."""
    res = client.get("/api/ore-grade-summary")
    assert res.status_code == 200
    data = res.get_json()
    assert "bands" in data
    assert "summary" in data
    assert "disclaimer" in data
    assert "data_source" in data

    bands = data["bands"]
    assert len(bands) == 4
    band_keys = [b["key"] for b in bands]
    assert "gt_44" in band_keys
    assert "35_44" in band_keys
    assert "25_35" in band_keys
    assert "lt_25" in band_keys

    for band in bands:
        assert "label" in band
        assert "count" in band
        assert "tonnage_tonnes" in band
        assert "indicative_suitability" in band
        assert "color" in band
        assert len(band["indicative_suitability"]) > 20

    summary = data["summary"]
    assert summary["total_sites"] > 0
    assert summary["economic_sites_count"] > 0
    assert summary["total_tonnage_tonnes"] > 0
    assert summary["economic_tonnage_tonnes"] > 0


def test_active_alerts(client):
    """Test /api/active-alerts returns live weather anomaly and production risks."""
    res = client.get("/api/active-alerts")
    assert res.status_code == 200
    data = res.get_json()
    assert "alerts" in data
    assert "live_weather" in data
    assert "high_severity_count" in data
    assert "total_alerts" in data
    assert len(data["alerts"]) > 0
    alert = data["alerts"][0]
    assert "id" in alert
    assert "title" in alert
    assert "severity" in alert
    assert "action" in alert


def test_safety_compliance(client):
    """Test /api/safety-compliance returns DGMS safety and ESZ buffer checks."""
    res = client.get("/api/safety-compliance")
    assert res.status_code == 200
    data = res.get_json()
    assert "checks" in data
    assert "overall_status" in data
    assert "summary" in data
    assert "reference_thresholds" in data
    assert "disclaimer" in data

    checks = data["checks"]
    check_names = [c["name"].lower() for c in checks]
    assert any("blasting" in n for n in check_names)
    assert any("slope" in n for n in check_names)
    assert any("eco-sensitive" in n or "esz" in n for n in check_names)

    valid_statuses = {"Compliant", "Needs Attention", "Non-compliant"}
    for c in checks:
        assert c["status"] in valid_statuses
        assert "reference_threshold" in c
        assert "recommended_action" in c
        assert c.get("is_reference_threshold") is True

    summary = data["summary"]
    assert "compliant" in summary
    assert "needs_attention" in summary
    assert "non_compliant" in summary


def test_regional_trends(client):
    """Test /api/regional-trends returns regional reference overview."""
    res = client.get("/api/regional-trends")
    assert res.status_code == 200
    data = res.get_json()
    assert data.get("data_type") == "synthetic_reference_dataset"
    assert "sites" in data
    assert isinstance(data["sites"], list)


def test_balaghat_weekly_trend(client):
    """Test /api/balaghat-weekly-trend returns 8-week trend."""
    res = client.get("/api/balaghat-weekly-trend")
    assert res.status_code == 200
    data = res.get_json()
    assert data.get("data_type") == "illustrative"
    assert "weeks" in data
    assert len(data["weeks"]) > 0


def test_refresh_reserve_data(client):
    """Test /api/refresh-reserve-data returns structured JSON response."""
    res = client.post("/api/refresh-reserve-data")
    assert res.status_code in (200, 502)
    data = res.get_json()
    assert "success" in data
    assert "message" in data
    assert "rebuilds_grid" in data


def test_production_simulator(client):
    """Test /api/production-simulator returns simulated monthly production."""
    res = client.post(
        "/api/production-simulator",
        json={"equipment_downtime_pct": 10, "blast_delay_hours": 6, "use_live_rainfall": False},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "expected_production" in data
    assert "risk_level" in data
    assert "explanation" in data


def test_production_simulator_cells(client):
    """Test /api/production-simulator-cells returns 36-cell risk grid."""
    res = client.post(
        "/api/production-simulator-cells",
        json={"equipment_downtime_pct": 10, "blast_delay_hours": 6, "use_live_rainfall": False},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "pits" in data
    assert "counts" in data
    assert len(data["pits"]) == 36


def test_weekly_target_prediction(client):
    """Test /api/weekly-target-prediction predicts gap and achievement."""
    res = client.post(
        "/api/weekly-target-prediction",
        json={
            "target_tonnes": 10000,
            "equipment_downtime_pct": 10,
            "blast_delay_hours": 6,
            "use_live_rainfall": False,
        },
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "predicted_weekly_production" in data
    assert "target_tonnes" in data
    assert "achievement_pct" in data


def test_current_forecast(client):
    """Test /api/current-forecast returns baseline forecast."""
    res = client.post("/api/current-forecast", json={"use_live_rainfall": False})
    assert res.status_code == 200
    data = res.get_json()
    assert "predicted_weekly_production" in data
    assert data.get("mode") == "current_forecast"


def test_shortfall_redeployment_plan(client):
    """Test /api/shortfall-redeployment-plan generates valid heuristic suggestions."""
    payload = {
        "target_tonnes": 10000,
        "predicted_tonnes": 8000,
        "current_pit_results": [
            {"pit_id": "Cell 01", "expected_production": 600, "risk_level": "High"},
            {"pit_id": "Cell 02", "expected_production": 4000, "risk_level": "Low"},
        ],
    }
    res = client.post("/api/shortfall-redeployment-plan", json=payload)
    assert res.status_code == 200
    data = res.get_json()
    assert "moves" in data
    assert "total_estimated_recovery_tonnes" in data
    assert "disclaimer" in data


def test_system_info(client):
    """Test /api/system-info returns data sources and model validation metrics."""
    res = client.get("/api/system-info")
    assert res.status_code == 200
    data = res.get_json()
    assert "data_sources" in data
    assert "models" in data
    assert "synthetic_notes" in data


def test_system_status(client):
    """Test /api/system-status returns EE_READY and grid timestamp."""
    res = client.get("/api/system-status")
    assert res.status_code == 200
    data = res.get_json()
    assert "ee_ready" in data
    assert "grid_timestamp" in data
    assert "satellite_source" in data
    assert "status" in data


def test_satellite_layer_valid(client):
    """Test /api/satellite-layer/<name> returns PNG image for all 4 layers."""
    for layer in ["iron-oxide", "sar-vv", "ndvi", "soil-moisture"]:
        res = client.get(f"/api/satellite-layer/{layer}")
        assert res.status_code == 200
        assert res.content_type == "image/png"
        assert len(res.data) > 0


def test_satellite_layer_invalid(client):
    """Test /api/satellite-layer/<name> returns 404 for unknown layer."""
    res = client.get("/api/satellite-layer/invalid-nonexistent-layer")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


# ============================================================================
# Missing Data / Error Handling Tests (Verify clean error JSON, no 500 crash)
# ============================================================================

def test_invalid_mine_hierarchy(client):
    """Verify /api/mines/<id>/hierarchy returns clean 404 for unknown mine."""
    res = client.get("/api/mines/unknown_mine/hierarchy")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_invalid_mine_telemetry(client):
    """Verify /api/mines/<id>/equipment-telemetry returns clean 404 for unknown mine."""
    res = client.get("/api/mines/unknown_mine/equipment-telemetry")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_missing_production_risk_csv(client, monkeypatch):
    """Verify /api/production-risk returns clean 404 when file is missing."""
    monkeypatch.setattr(app_module, "RISK_CSV_PATH", "c:/non_existent_file.csv")
    res = client.get("/api/production-risk")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_missing_production_risk_summary_csv(client, monkeypatch):
    """Verify /api/production-risk/summary returns clean 404 when file is missing."""
    monkeypatch.setattr(app_module, "RISK_CSV_PATH", "c:/non_existent_file.csv")
    res = client.get("/api/production-risk/summary")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_missing_balaghat_prediction_grid(client, monkeypatch):
    """Verify /api/balaghat-prediction-grid returns clean 404 when file is missing."""
    monkeypatch.setattr(app_module, "GRID_CSV_PATH", "c:/non_existent_grid.csv")
    res = client.get("/api/balaghat-prediction-grid")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_missing_regional_trends(client, monkeypatch):
    """Verify /api/regional-trends returns clean 404 when file is missing."""
    monkeypatch.setattr(app_module, "REGIONAL_TRENDS_CSV", "c:/non_existent_trends.csv")
    res = client.get("/api/regional-trends")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_missing_balaghat_weekly_trend(client, monkeypatch):
    """Verify /api/balaghat-weekly-trend returns clean 404 when file is missing."""
    monkeypatch.setattr(app_module, "BALAGHAT_WEEKLY_TREND_CSV", "c:/non_existent_trend.csv")
    res = client.get("/api/balaghat-weekly-trend")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_missing_pits_json(client, monkeypatch):
    """Verify cell and weekly forecast endpoints return clean 404 when pits.json is missing."""
    monkeypatch.setattr(app_module, "PITS_JSON", "c:/non_existent_pits.json")
    
    res1 = client.post("/api/production-simulator-cells", json={})
    assert res1.status_code == 404
    assert "error" in res1.get_json()

    res2 = client.post("/api/weekly-target-prediction", json={"target_tonnes": 5000})
    assert res2.status_code == 404
    assert "error" in res2.get_json()

    res3 = client.post("/api/current-forecast", json={})
    assert res3.status_code == 404
    assert "error" in res3.get_json()


def test_invalid_payload_weekly_target(client):
    """Verify /api/weekly-target-prediction returns 400 for negative or invalid target."""
    res = client.post("/api/weekly-target-prediction", json={"target_tonnes": -100})
    assert res.status_code == 400
    assert "error" in res.get_json()


def test_invalid_payload_redeployment(client):
    """Verify /api/shortfall-redeployment-plan returns 400 for invalid cell results."""
    res = client.post("/api/shortfall-redeployment-plan", json={"target_tonnes": 1000, "predicted_tonnes": 800, "current_pit_results": "invalid"})
    assert res.status_code == 400
    assert "error" in res.get_json()


def test_missing_equipment_csv(client, monkeypatch):
    """Verify /api/fleet-status returns clean 404 when equipment CSV is missing."""
    monkeypatch.setattr(app_module, "EQUIPMENT_CSV", "c:/non_existent_equipment.csv")
    res = client.get("/api/fleet-status")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_missing_geology_csv(client, monkeypatch):
    """Verify /api/ore-grade-summary returns clean 404 when geology CSV is missing."""
    monkeypatch.setattr(app_module, "GEOLOGY_CSV", "c:/non_existent_geology.csv")
    res = client.get("/api/ore-grade-summary")
    assert res.status_code == 404
    data = res.get_json()
    assert "error" in data


def test_assistant_valid_query(client):
    """Verify /api/assistant handles standard English queries with grounded context."""
    res = client.post(
        "/api/assistant",
        json={"message": "What is the current shortfall in Balaghat?", "site": "Balaghat"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "reply" in data
    assert len(data["reply"]) > 20
    assert data.get("language_detected") == "English"
    assert "grounded_context" in data
    ctx = data["grounded_context"]
    assert "production" in ctx
    assert "rainfall" in ctx
    assert "safety_compliance" in ctx
    assert "model_used" in data


def test_assistant_hindi_query(client):
    """Verify /api/assistant detects Devanagari Hindi and responds in Hindi."""
    res = client.post(
        "/api/assistant",
        json={"message": "बालाघाट खदान की सुरक्षा स्थिति क्या है?", "site": "Balaghat"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "reply" in data
    assert data.get("language_detected") == "Hindi"
    assert "MOIL" in data["reply"] or "बालाघाट" in data["reply"]


def test_assistant_tamil_query(client):
    """Verify /api/assistant detects Tamil script and responds in Tamil."""
    res = client.post(
        "/api/assistant",
        json={"message": "சுரங்க உற்பத்தி விவரம் என்ன?", "site": "Balaghat"},
    )
    assert res.status_code == 200
    data = res.get_json()
    assert "reply" in data
    assert data.get("language_detected") == "Tamil"
    assert "MOIL" in data["reply"] or "பாலாக்கட்" in data["reply"]


def test_assistant_missing_message(client):
    """Verify /api/assistant returns HTTP 400 when message is missing or empty."""
    res = client.post("/api/assistant", json={})
    assert res.status_code == 400
    assert "error" in res.get_json()

    res_empty = client.post("/api/assistant", json={"message": "   "})
    assert res_empty.status_code == 400
    assert "error" in res_empty.get_json()


def test_assistant_non_json(client):
    """Verify /api/assistant returns HTTP 400 when request payload is not JSON."""
    res = client.post("/api/assistant", data="plain text message")
    assert res.status_code == 400
    assert "error" in res.get_json()


def test_aoi_summary_full_zone(client):
    """Verify /api/aoi-summary captures all grid points when polygon covers the whole zone."""
    # Whole zone envelope: lat ~21.785..21.875, lon ~80.182..80.278
    full_polygon = [
        [21.70, 80.10],
        [21.70, 80.35],
        [21.95, 80.35],
        [21.95, 80.10],
    ]
    res = client.post("/api/aoi-summary", json={"polygon": full_polygon})
    assert res.status_code == 200
    data = res.get_json()
    assert data["point_count"] == 2601
    assert data["area_km2"] > 0
    assert data["perimeter_km"] > 0
    assert isinstance(data["avg_probability"], float)
    assert 0.0 <= data["avg_probability"] <= 1.0
    zb = data["zone_breakdown"]
    assert "High" in zb and "Medium" in zb and "Low" in zb
    assert zb["High"]["count"] + zb["Medium"]["count"] + zb["Low"]["count"] == 2601
    assert "note" in data
    assert "disclaimer" in data


def test_aoi_summary_outside_zone(client):
    """Verify /api/aoi-summary returns 0 points and valid metadata when polygon is outside."""
    outside_polygon = [
        [21.50, 80.00],
        [21.50, 80.01],
        [21.51, 80.01],
        [21.51, 80.00],
    ]
    res = client.post("/api/aoi-summary", json={"polygon": outside_polygon})
    assert res.status_code == 200
    data = res.get_json()
    assert data["point_count"] == 0
    assert data["avg_probability"] is None
    zb = data["zone_breakdown"]
    assert zb["High"]["count"] == 0
    assert zb["Medium"]["count"] == 0
    assert zb["Low"]["count"] == 0
    assert "no prediction pixels" in data["note"].lower()


def test_aoi_summary_malformed_request(client):
    """Verify /api/aoi-summary returns HTTP 400 when polygon has fewer than 3 points or is invalid."""
    # Fewer than 3 points
    res = client.post("/api/aoi-summary", json={"polygon": [[21.8, 80.2], [21.81, 80.21]]})
    assert res.status_code == 400
    assert "error" in res.get_json()

    # Empty polygon
    res_empty = client.post("/api/aoi-summary", json={"polygon": []})
    assert res_empty.status_code == 400
    assert "error" in res_empty.get_json()

    # Non-list polygon
    res_str = client.post("/api/aoi-summary", json={"polygon": "invalid"})
    assert res_str.status_code == 400
    assert "error" in res_str.get_json()

    # Non-JSON payload
    res_text = client.post("/api/aoi-summary", data="not json")
    assert res_text.status_code == 400
    assert "error" in res_text.get_json()



