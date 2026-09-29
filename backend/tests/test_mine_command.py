"""
Unit and integration tests for Phase 6:
  1. Mine Command Chat (channels, posting, auto-notification on proposal accept)
  2. Action Tracker (manual creation, auto-creation on proposal accept, status progression)
  3. Field Execution & Closed-Loop Data Store Updates (telemetry / blast log appends)
  4. Flask REST API routes for /api/mine-command/<channel> and /api/actions
"""

import os
import sys
import tempfile
import pytest
import pandas as pd

BACKEND_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from constraint_engine import (
    init_db,
    sync_proposals_to_db,
    get_proposals,
    decide_proposal,
    post_chat_message,
    get_chat_messages,
    create_action,
    get_actions,
    update_action_status,
    VALID_CHANNELS,
)
from app import app


@pytest.fixture
def temp_db():
    """Create isolated temporary database for Phase 6 testing."""
    fd, path = tempfile.mkstemp(suffix="_scheduling_test.db")
    os.close(fd)
    init_db(path)
    yield path
    if os.path.exists(path):
        try:
            os.remove(path)
        except OSError:
            pass


@pytest.fixture
def client():
    """Flask test client."""
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


def test_mine_command_channels_posting_and_retrieval(temp_db):
    """Verify chat posting and retrieval across canonical channels."""
    for ch in VALID_CHANNELS:
        msg = post_chat_message(
            channel=ch,
            author="Field Operator",
            text=f"Check-in for {ch} channel",
            mine_id="balaghat",
            zone_id="ZONE-01",
            db_path=temp_db
        )
        assert msg["id"] is not None
        assert msg["channel"] == ch
        assert msg["author"] == "Field Operator"
        assert msg["text"] == f"Check-in for {ch} channel"
        assert msg["is_system_generated"] == 0

    # Retrieve messages for Equipment channel
    eq_messages = get_chat_messages(channel="equipment", limit=20, db_path=temp_db)
    assert len(eq_messages) >= 1
    assert eq_messages[0]["channel"] == "Equipment"
    assert eq_messages[0]["text"] == "Check-in for Equipment channel"


def test_empty_message_validation(temp_db):
    """Verify posting empty text raises ValueError."""
    with pytest.raises(ValueError, match="Message text cannot be empty"):
        post_chat_message(channel="Operations", author="User", text="   ", db_path=temp_db)


def test_proposal_acceptance_triggers_contextual_chat_and_action(temp_db):
    """
    Verify that accepting a proposal:
      1. Automatically inserts a system notification into the mapped channel.
      2. Automatically creates an Open action in the actions tracker table.
    """
    sync_proposals_to_db(temp_db)
    props = get_proposals(status="proposed", db_path=temp_db)
    assert len(props) > 0

    target = props[0]
    res = decide_proposal(target["id"], "accept", manager_name="General Manager", db_path=temp_db)
    assert res["success"] is True

    # 1. Check contextual chat message
    cmd = res["command_message"]
    assert cmd is not None
    assert cmd["is_system_generated"] == 1
    assert "DIRECTIVE ISSUED" in cmd["text"]

    # Verify message is present in the mapped channel
    channel_msgs = get_chat_messages(cmd["channel"], db_path=temp_db)
    assert any(m["id"] == cmd["id"] for m in channel_msgs)

    # 2. Check Action Tracker entry
    actions = get_actions(status="Open", mine_id=target["mine_id"], db_path=temp_db)
    assert len(actions) >= 1
    matching_action = next((a for a in actions if a["action_id"] == f"ACT-{target['id']}"), None)
    assert matching_action is not None
    assert matching_action["status"] == "Open"
    assert target["mine_id"] in matching_action["mine_id"]


def test_action_tracker_lifecycle_and_loop_closure(temp_db):
    """
    Verify manual action creation, status progression (Open -> In Progress -> Completed),
    and field execution data-store update upon completion.
    """
    # 1. Manual Creation
    created = create_action(
        issue="Equipment LHD-02 overheating in South Stope",
        mine_id="balaghat",
        zone_id="ZONE-02",
        assigned_to="Maintenance Lead",
        priority="High",
        db_path=temp_db
    )
    act_id = created["action_id"]
    assert act_id.startswith("ACT-BALAGHAT-")
    assert created["status"] == "Open"

    # 2. Advance to In Progress
    step1 = update_action_status(act_id, "In Progress", db_path=temp_db)
    assert step1["success"] is True
    assert step1["action"]["status"] == "In Progress"

    # 3. Advance to Completed with field execution update
    update_note = "LHD-02 radiator cleared, unit redeployed to ZONE-02 active haulage"
    step2 = update_action_status(act_id, "Completed", actual_update=update_note, db_path=temp_db)
    assert step2["success"] is True
    assert step2["action"]["status"] == "Completed"
    assert step2["action"]["actual_update"] == update_note
    assert step2["field_execution"] is not None
    assert step2["field_execution"]["success"] is True
    assert step2["field_execution"]["dataset"] == "equipment_iot_telemetry.csv"


def test_api_mine_command_routes(client):
    """Test GET and POST /api/mine-command/<channel> endpoints."""
    # Post a message
    post_res = client.post("/api/mine-command/Safety", json={
        "author": "Safety Inspector",
        "text": "Ventilation survey verified for Block-01",
        "mine_id": "balaghat",
        "zone_id": "ZONE-01"
    })
    assert post_res.status_code == 201
    post_data = post_res.get_json()
    assert post_data["success"] is True
    assert post_data["message"]["channel"] == "Safety"
    assert post_data["message"]["text"] == "Ventilation survey verified for Block-01"

    # Get messages
    get_res = client.get("/api/mine-command/Safety?limit=10")
    assert get_res.status_code == 200
    get_data = get_res.get_json()
    assert isinstance(get_data, list)
    assert any(m["text"] == "Ventilation survey verified for Block-01" for m in get_data)


def test_api_action_tracker_routes(client):
    """Test GET /api/actions, POST /api/actions, and POST /api/actions/<id>/status."""
    # Create action
    create_res = client.post("/api/actions", json={
        "issue": "Secondary blast clearance verification",
        "mine_id": "ukwa",
        "zone_id": "ZONE-03",
        "assigned_to": "Blasting Supervisor",
        "priority": "High"
    })
    assert create_res.status_code == 201
    created_act = create_res.get_json()["action"]
    action_id = created_act["action_id"]

    # Query actions
    list_res = client.get("/api/actions?mine_id=ukwa")
    assert list_res.status_code == 200
    acts = list_res.get_json()
    assert any(a["action_id"] == action_id for a in acts)

    # Advance to In Progress
    adv1 = client.post(f"/api/actions/{action_id}/status", json={"status": "In Progress"})
    assert adv1.status_code == 200
    assert adv1.get_json()["action"]["status"] == "In Progress"

    # Advance to Completed with actual status update (closing the loop)
    adv2 = client.post(f"/api/actions/{action_id}/status", json={
        "status": "Completed",
        "actual_update": "Secondary blast executed safely at 15:30. Zone cleared."
    })
    assert adv2.status_code == 200
    adv2_data = adv2.get_json()
    assert adv2_data["action"]["status"] == "Completed"
    assert adv2_data["action"]["actual_update"] == "Secondary blast executed safely at 15:30. Zone cleared."
    assert adv2_data["field_execution"] is not None
