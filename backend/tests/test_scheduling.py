"""
Tests for Phase 4: Constraint Engine and Manager Approval Workflow.

Verifies:
  1. Constraint & Risk detection emits the 7 typed constraints matching the architecture diagram:
     - equipment_downtime
     - blast_delay
     - weather_restriction
     - production_deviation
     - ore_availability
     - safety_restriction
     - exploration_priority
  2. Candidate action generation creates structured heuristic proposals.
  3. SQLite store (backend/data/scheduling.db) persistence in schedule_actions and mine_command_messages.
  4. REST API routes:
     - GET /api/schedule/proposals
     - POST /api/schedule/proposals/<id>/decision
     - GET /api/schedule/commands
  5. Error handling and input validation (invalid decision, missing proposal).
"""

import os
import sys
import tempfile
import pytest

# Ensure backend directory is in sys.path
BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from app import app
from constraint_engine import (
    detect_constraints,
    generate_candidate_actions,
    init_db,
    sync_proposals_to_db,
    get_proposals,
    decide_proposal,
    get_command_messages,
    get_db_connection,
)


@pytest.fixture
def client():
    """Create Flask test client with TESTING flag enabled."""
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client


@pytest.fixture
def temp_db(tmp_path):
    """Provide a temporary SQLite database path for isolated unit testing."""
    db_file = str(tmp_path / "test_scheduling.db")
    init_db(db_file)
    return db_file


# ============================================================================
# Stage 1: Constraint Detection Unit Tests
# ============================================================================

def test_detect_all_seven_constraint_types():
    """Verify that detect_constraints detects all 7 typed constraints from architecture diagram."""
    constraints = detect_constraints()
    assert isinstance(constraints, list)
    assert len(constraints) > 0

    detected_types = {c["constraint_type"] for c in constraints}
    expected_types = {
        "equipment_downtime",
        "blast_delay",
        "weather_restriction",
        "production_deviation",
        "ore_availability",
        "safety_restriction",
        "exploration_priority",
    }
    assert expected_types.issubset(detected_types), (
        f"Missing constraint types: {expected_types - detected_types}"
    )

    # Verify required spatial references and severity
    for c in constraints:
        assert "constraint_type" in c
        assert "mine_id" in c and c["mine_id"] in ("balaghat", "ukwa")
        assert "severity" in c and c["severity"] in ("critical", "high", "medium", "low")
        assert "description" in c and len(c["description"]) > 5
        # Must reference at least Block_ID or Zone_ID
        assert c.get("block_id") or c.get("zone_id") or c.get("cell_id")


def test_candidate_action_generation():
    """Verify that candidate action proposals are generated for constraints."""
    constraints = detect_constraints()
    proposals = generate_candidate_actions(constraints)
    assert len(proposals) == len(constraints)

    for p in proposals:
        assert p["id"].startswith("PROP-")
        assert p["status"] == "proposed"
        assert p["mine_id"] in ("balaghat", "ukwa")
        assert len(p["proposed_change"]) > 15
        assert len(p["description"]) > 5
        assert "created_at" in p


# ============================================================================
# Stage 3: SQLite Store & Persistence Tests
# ============================================================================

def test_sqlite_sync_and_get_proposals(temp_db):
    """Verify proposals sync into SQLite and preserve state."""
    synced = sync_proposals_to_db(temp_db)
    assert synced > 0

    props = get_proposals(status="proposed", db_path=temp_db)
    assert len(props) == synced

    # Second sync should not duplicate rows
    synced_second = sync_proposals_to_db(temp_db)
    assert synced_second == 0


def test_manager_decision_accept(temp_db):
    """Verify accepting a proposal updates status and inserts into mine_command_messages."""
    sync_proposals_to_db(temp_db)
    props = get_proposals(status="proposed", db_path=temp_db)
    target = props[0]

    result = decide_proposal(target["id"], "accept", manager_name="General Manager (Mining)", db_path=temp_db)
    assert result["success"] is True
    assert result["action"]["status"] == "accepted"
    assert result["action"]["decided_by"] == "General Manager (Mining)"
    assert result["action"]["decided_at"] is not None

    # Check mine_command_messages entry
    cmd = result["command_message"]
    assert cmd is not None
    assert cmd["action_id"] == target["id"]
    assert cmd["issued_by"] == "General Manager (Mining)"
    assert cmd["status"] == "broadcast"
    assert "DIRECTIVE ISSUED" in cmd["message"]

    # Verify query for commands
    all_cmds = get_command_messages(db_path=temp_db)
    assert len(all_cmds) >= 1
    assert all_cmds[0]["action_id"] == target["id"]


def test_manager_decision_reject(temp_db):
    """Verify rejecting a proposal updates status and does not broadcast directive."""
    sync_proposals_to_db(temp_db)
    props = get_proposals(status="proposed", db_path=temp_db)
    target = props[1]

    result = decide_proposal(target["id"], "reject", manager_name="Shift Supervisor", db_path=temp_db)
    assert result["success"] is True
    assert result["action"]["status"] == "rejected"
    assert result["action"]["decided_by"] == "Shift Supervisor"
    assert result["command_message"] is None


def test_manager_decision_invalid_input(temp_db):
    """Verify error handling on invalid decisions and nonexistent proposals."""
    sync_proposals_to_db(temp_db)

    with pytest.raises(ValueError, match="Decision must be 'accept' or 'reject'"):
        decide_proposal("PROP-FAKE-001", "postpone", db_path=temp_db)

    with pytest.raises(ValueError, match="does not exist"):
        decide_proposal("PROP-NONEXISTENT-9999", "accept", db_path=temp_db)


# ============================================================================
# Flask REST Routes Integration Tests
# ============================================================================

def test_api_schedule_proposals_list(client):
    """Verify GET /api/schedule/proposals returns open proposals list."""
    res = client.get("/api/schedule/proposals")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
    assert len(data) > 0

    first = data[0]
    assert "id" in first
    assert "constraint_type" in first
    assert "mine_id" in first
    assert "zone_id" in first
    assert "description" in first
    assert "proposed_change" in first
    assert first["status"] == "proposed"


def test_api_schedule_proposals_envelope(client):
    """Verify GET /api/schedule/proposals?envelope=true returns envelope with summary counts."""
    res = client.get("/api/schedule/proposals?envelope=true")
    assert res.status_code == 200
    data = res.get_json()
    assert "status" in data
    assert "proposals" in data
    assert "summary" in data
    assert data["summary"]["total"] >= len(data["proposals"])


def test_api_schedule_decision_accept(client):
    """Verify POST /api/schedule/proposals/<id>/decision processes acceptance."""
    # Fetch first proposal to test
    list_res = client.get("/api/schedule/proposals")
    assert list_res.status_code == 200
    proposals = list_res.get_json()
    assert len(proposals) > 0
    prop = proposals[0]

    # Accept proposal
    dec_res = client.post(
        f"/api/schedule/proposals/{prop['id']}/decision",
        json={"decision": "accept", "manager": "Operations Manager Test"},
    )
    assert dec_res.status_code == 200
    dec_data = dec_res.get_json()
    assert dec_data["success"] is True
    assert dec_data["action"]["status"] == "accepted"
    assert dec_data["action"]["decided_by"] == "Operations Manager Test"
    assert dec_data["command_message"] is not None
    assert dec_data["command_message"]["action_id"] == prop["id"]


def test_api_schedule_decision_reject(client):
    """Verify POST /api/schedule/proposals/<id>/decision processes rejection."""
    list_res = client.get("/api/schedule/proposals")
    proposals = list_res.get_json()
    assert len(proposals) > 1
    prop = proposals[1]

    dec_res = client.post(
        f"/api/schedule/proposals/{prop['id']}/decision",
        json={"decision": "reject", "manager": "Safety Compliance Officer"},
    )
    assert dec_res.status_code == 200
    dec_data = dec_res.get_json()
    assert dec_data["success"] is True
    assert dec_data["action"]["status"] == "rejected"
    assert dec_data["command_message"] is None


def test_api_schedule_decision_validation_errors(client):
    """Verify 400 and 404 responses on bad decision payloads."""
    # Bad decision string
    res_bad = client.post(
        "/api/schedule/proposals/PROP-SOME-ID/decision",
        json={"decision": "maybe"},
    )
    assert res_bad.status_code == 400

    # Missing decision field
    res_missing = client.post(
        "/api/schedule/proposals/PROP-SOME-ID/decision",
        json={"manager": "Manager Name"},
    )
    assert res_missing.status_code == 400

    # Non-existent proposal ID
    res_404 = client.post(
        "/api/schedule/proposals/PROP-NON-EXISTENT-XYZ/decision",
        json={"decision": "accept"},
    )
    assert res_404.status_code == 404


def test_api_schedule_commands_list(client):
    """Verify GET /api/schedule/commands returns broadcasted command messages."""
    res = client.get("/api/schedule/commands")
    assert res.status_code == 200
    data = res.get_json()
    assert isinstance(data, list)
