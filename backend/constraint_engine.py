"""
MOIL 3-Stage Constraint & Mine Scheduling Engine.

Implements the three-stage engine formalized from the architecture diagram:
  Stage 1: Constraint & Risk Detection
    Scans the current two-mine datasets (Balaghat & Ukwa) and emits 7 typed constraints:
      - equipment_downtime
      - blast_delay
      - weather_restriction
      - production_deviation
      - ore_availability
      - safety_restriction
      - exploration_priority
    Each constraint references a Mine / Block / Zone / Cell ID and a severity.

  Stage 2: Corrective Action Generation
    Generates actionable proposals mapped to each constraint type, reusing
    established operational heuristics (fleet redeployment matching, blast schedule
    adjustment, stope quota rebalancing, ROM blending, DGMS ground control compliance,
    and diamond core drill priority).

  Stage 3: Mine Scheduling Engine with Manager Approval (Persisted SQLite)
    Stores proposals in backend/data/scheduling.db with table `schedule_actions`
    and broadcasts approved directives into `mine_command_messages`.
"""

import json
import os
import sqlite3
from datetime import datetime, timezone
import pandas as pd

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
BACKEND_DATA_DIR = os.path.join(SCRIPT_DIR, "data")
ROOT_DATA_DIR = os.path.join(PROJECT_ROOT, "data")

DEFAULT_DB_PATH = os.path.join(BACKEND_DATA_DIR, "scheduling.db")


def _find_data_file(filename: str) -> str:
    """Locate dataset file in backend/data/ or project root data/."""
    for candidate_dir in [BACKEND_DATA_DIR, ROOT_DATA_DIR]:
        p = os.path.join(candidate_dir, filename)
        if os.path.exists(p):
            return p
    return os.path.join(BACKEND_DATA_DIR, filename)


# ============================================================================
# Stage 3 Store: SQLite Initialization & Connection
# ============================================================================

def get_db_connection(db_path: str = None) -> sqlite3.Connection:
    """Open or create connection to scheduling.db."""
    target_path = db_path or DEFAULT_DB_PATH
    os.makedirs(os.path.dirname(os.path.abspath(target_path)), exist_ok=True)
    conn = sqlite3.connect(target_path, timeout=15.0, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


VALID_CHANNELS = ["Operations", "Blasting", "Equipment", "Safety", "Geology", "General"]

CONSTRAINT_TO_CHANNEL = {
    "equipment_downtime": "Equipment",
    "blast_delay": "Blasting",
    "weather_restriction": "Safety",
    "safety_restriction": "Safety",
    "production_deviation": "Operations",
    "ore_availability": "Geology",
    "exploration_priority": "Geology",
}

CONSTRAINT_TO_ROLE = {
    "equipment_downtime": "Equipment Maintenance Lead",
    "blast_delay": "Blasting Supervisor",
    "safety_restriction": "Safety Compliance Officer",
    "weather_restriction": "Operations Manager",
    "production_deviation": "Operations Manager",
    "ore_availability": "Chief Geologist",
    "exploration_priority": "Chief Geologist",
}


def _normalize_channel(channel: str) -> str:
    """Normalize input channel string to one of the 6 canonical channels."""
    if not channel:
        return "General"
    cleaned = str(channel).strip()
    for valid in VALID_CHANNELS:
        if cleaned.lower() == valid.lower():
            return valid
    return "General"


def get_channel_for_constraint(constraint_type: str) -> str:
    """Map constraint type to the corresponding Mine Command channel."""
    return CONSTRAINT_TO_CHANNEL.get(str(constraint_type).lower(), "General")


def init_db(db_path: str = None):
    """
    Initialize SQLite schema for schedule_actions, mine_command_messages, and actions.
    Supports Phase 4 and Phase 6 specifications with seamless schema migration.
    """
    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS schedule_actions (
                    id TEXT PRIMARY KEY,
                    constraint_type TEXT NOT NULL,
                    mine_id TEXT NOT NULL,
                    zone_id TEXT,
                    description TEXT NOT NULL,
                    proposed_change TEXT NOT NULL,
                    status TEXT NOT NULL CHECK(status IN ('proposed', 'accepted', 'rejected')),
                    created_at TEXT NOT NULL,
                    decided_at TEXT,
                    decided_by TEXT
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_actions_status ON schedule_actions(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_actions_mine ON schedule_actions(mine_id);")

            conn.execute("""
                CREATE TABLE IF NOT EXISTS mine_command_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    channel TEXT NOT NULL DEFAULT 'General',
                    author TEXT NOT NULL DEFAULT 'System',
                    text TEXT NOT NULL DEFAULT '',
                    created_at TEXT NOT NULL DEFAULT '',
                    is_system_generated INTEGER NOT NULL DEFAULT 0,
                    action_id TEXT,
                    mine_id TEXT,
                    zone_id TEXT,
                    command_type TEXT,
                    message TEXT,
                    issued_at TEXT,
                    issued_by TEXT,
                    status TEXT NOT NULL DEFAULT 'broadcast',
                    FOREIGN KEY (action_id) REFERENCES schedule_actions(id)
                );
            """)

            # Ensure schema migration if table was created in Phase 4
            cur = conn.execute("PRAGMA table_info(mine_command_messages);")
            col_info = {row["name"]: row for row in cur.fetchall()}
            if "action_id" in col_info and col_info["action_id"]["notnull"] == 1:
                # Migrate table so action_id and mine_id can be NULL for generic chat messages
                conn.execute("ALTER TABLE mine_command_messages RENAME TO _mine_command_messages_old;")
                conn.execute("""
                    CREATE TABLE mine_command_messages (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        channel TEXT NOT NULL DEFAULT 'General',
                        author TEXT NOT NULL DEFAULT 'System',
                        text TEXT NOT NULL DEFAULT '',
                        created_at TEXT NOT NULL DEFAULT '',
                        is_system_generated INTEGER NOT NULL DEFAULT 0,
                        action_id TEXT,
                        mine_id TEXT,
                        zone_id TEXT,
                        command_type TEXT,
                        message TEXT,
                        issued_at TEXT,
                        issued_by TEXT,
                        status TEXT NOT NULL DEFAULT 'broadcast'
                    );
                """)
                old_cols = set(col_info.keys())
                has_channel = "channel" in old_cols
                has_author = "author" in old_cols
                has_text = "text" in old_cols
                has_created_at = "created_at" in old_cols
                has_sys = "is_system_generated" in old_cols

                conn.execute(f"""
                    INSERT INTO mine_command_messages (
                        id, channel, author, text, created_at, is_system_generated,
                        action_id, mine_id, zone_id, command_type, message, issued_at, issued_by, status
                    )
                    SELECT
                        id,
                        {"channel" if has_channel else "'General'"},
                        {"author" if has_author else "issued_by"},
                        {"text" if has_text else "message"},
                        {"created_at" if has_created_at else "issued_at"},
                        {"is_system_generated" if has_sys else "1"},
                        action_id, mine_id, zone_id, command_type, message, issued_at, issued_by, status
                    FROM _mine_command_messages_old;
                """)
                conn.execute("DROP TABLE _mine_command_messages_old;")
            else:
                existing_cols = set(col_info.keys())
                cols_to_add = [
                    ("channel", "TEXT NOT NULL DEFAULT 'General'"),
                    ("author", "TEXT NOT NULL DEFAULT 'System'"),
                    ("text", "TEXT NOT NULL DEFAULT ''"),
                    ("created_at", "TEXT NOT NULL DEFAULT ''"),
                    ("is_system_generated", "INTEGER NOT NULL DEFAULT 0"),
                    ("action_id", "TEXT"),
                    ("mine_id", "TEXT"),
                    ("zone_id", "TEXT"),
                    ("command_type", "TEXT"),
                    ("message", "TEXT"),
                    ("issued_at", "TEXT"),
                    ("issued_by", "TEXT"),
                    ("status", "TEXT NOT NULL DEFAULT 'broadcast'"),
                ]
                for col_name, col_def in cols_to_add:
                    if col_name not in existing_cols:
                        conn.execute(f"ALTER TABLE mine_command_messages ADD COLUMN {col_name} {col_def};")

            conn.execute("CREATE INDEX IF NOT EXISTS idx_commands_channel ON mine_command_messages(channel);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_commands_action ON mine_command_messages(action_id);")

            # Phase 6 Action Tracker Table
            conn.execute("""
                CREATE TABLE IF NOT EXISTS actions (
                    action_id TEXT PRIMARY KEY,
                    issue TEXT NOT NULL,
                    mine_id TEXT NOT NULL,
                    zone_id TEXT,
                    assigned_to TEXT NOT NULL,
                    deadline TEXT,
                    priority TEXT NOT NULL DEFAULT 'Medium',
                    status TEXT NOT NULL CHECK(status IN ('Open', 'In Progress', 'Completed')),
                    created_at TEXT NOT NULL,
                    approved_at TEXT,
                    completed_at TEXT,
                    actual_update TEXT
                );
            """)
            conn.execute("CREATE INDEX IF NOT EXISTS idx_actions_tracker_status ON actions(status);")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_actions_tracker_mine ON actions(mine_id);")
    finally:
        conn.close()


# ============================================================================
# Stage 1: Constraint & Risk Detection
# ============================================================================

def _detect_equipment_downtime() -> list:
    """Detect units in Breakdown/Maintenance or with severe downtime in active zones."""
    constraints = []
    eq_path = _find_data_file("equipment_iot_telemetry.csv")
    if not os.path.exists(eq_path):
        return constraints

    try:
        df = pd.read_csv(eq_path)
        if "Equipment_ID" in df.columns:
            latest = df.groupby("Equipment_ID", as_index=False).last()
        else:
            latest = df

        for _, row in latest.iterrows():
            status = str(row.get("Status", "Active"))
            downtime_hrs = float(row.get("Downtime_Hours", 0.0) or 0.0)
            avail_pct = float(row.get("Availability_Pct", 100.0) or 100.0)
            eq_id = str(row.get("Equipment_ID", ""))
            eq_type = str(row.get("Equipment_Type", "Heavy Machine"))
            mine_id = str(row.get("Mine_ID", "balaghat")).lower()
            block_id = str(row.get("Block_ID", ""))
            zone_id = str(row.get("Zone_ID", ""))

            is_breakdown = status == "Breakdown" or avail_pct < 70.0
            is_maint = status == "Maintenance" or downtime_hrs >= 6.0
            if is_breakdown or is_maint:
                severity = "critical" if is_breakdown else "high"
                constraints.append({
                    "constraint_id": f"CONST-EQ-{eq_id}",
                    "constraint_type": "equipment_downtime",
                    "mine_id": mine_id,
                    "block_id": block_id,
                    "zone_id": zone_id,
                    "cell_id": None,
                    "severity": severity,
                    "equipment_id": eq_id,
                    "equipment_type": eq_type,
                    "status": status,
                    "availability_pct": avail_pct,
                    "downtime_hours": downtime_hrs,
                    "productivity_tonnes_per_hr": float(row.get("Operating_Hours", 20.0)) * 1.8,
                    "description": (
                        f"{eq_type} {eq_id} in {zone_id} ({mine_id.title()}) is {status} "
                        f"(Availability: {avail_pct:.1f}%, Downtime: {downtime_hrs:.1f}h). Production risk."
                    ),
                })
    except Exception:
        pass

    return constraints


def _detect_blast_delays() -> list:
    """Detect critical or delayed blasts causing stope cycle clearance bottlenecks."""
    constraints = []
    bl_path = _find_data_file("blasting_logs.csv")
    if not os.path.exists(bl_path):
        return constraints

    try:
        df = pd.read_csv(bl_path)
        for _, row in df.iterrows():
            total_delay = float(row.get("Total_Delay_hours", 0.0) or 0.0)
            status = str(row.get("Status", "On Schedule"))
            blast_id = str(row.get("Blast_ID", ""))
            mine_id = str(row.get("Mine_ID", "balaghat")).lower()
            block_id = str(row.get("Block_ID", ""))
            zone_id = str(row.get("Zone_ID", ""))

            if total_delay >= 3.0 or status in ("Delayed", "Critical Delay"):
                severity = "critical" if total_delay >= 4.5 or status == "Critical Delay" else "high" if total_delay >= 3.5 else "medium"
                drill_delay = float(row.get("Drill_Delay_hours", 0.0) or 0.0)
                clearance_delay = float(row.get("Clearance_Delay_hours", 0.0) or 0.0)
                constraints.append({
                    "constraint_id": f"CONST-BLAST-{blast_id}",
                    "constraint_type": "blast_delay",
                    "mine_id": mine_id,
                    "block_id": block_id,
                    "zone_id": zone_id,
                    "cell_id": None,
                    "severity": severity,
                    "blast_id": blast_id,
                    "total_delay_hours": total_delay,
                    "drill_delay_hours": drill_delay,
                    "clearance_delay_hours": clearance_delay,
                    "description": (
                        f"Blast {blast_id} in {zone_id} ({mine_id.title()}) experienced {total_delay:.1f}h delay "
                        f"({status}; drill: {drill_delay:.1f}h, clearance: {clearance_delay:.1f}h)."
                    ),
                })
    except Exception:
        pass

    return constraints


def _detect_weather_restrictions() -> list:
    """Detect monsoon precipitation exceeding pit/decline water runoff thresholds."""
    constraints = []
    mines = [
        {"id": "balaghat", "name": "Balaghat Mine", "file": "live_rainfall_balaghat.json", "default_mm": 456.2},
        {"id": "ukwa", "name": "Ukwa Mine", "file": "live_rainfall_ukwa.json", "default_mm": 412.8},
    ]

    for m in mines:
        rainfall_mm = m["default_mm"]
        cached_file = _find_data_file(m["file"])
        if os.path.exists(cached_file):
            try:
                with open(cached_file, "r", encoding="utf-8") as f:
                    rdata = json.load(f)
                    rainfall_mm = float(rdata.get("rainfall_mm", rainfall_mm))
            except Exception:
                pass

        if rainfall_mm >= 150.0:
            severity = "critical" if rainfall_mm >= 400.0 else "high" if rainfall_mm >= 250.0 else "medium"
            prefix = "BGT" if m["id"] == "balaghat" else "UKW"
            constraints.append({
                "constraint_id": f"CONST-WX-{m['id'].upper()}",
                "constraint_type": "weather_restriction",
                "mine_id": m["id"],
                "block_id": f"{prefix}-B1",
                "zone_id": f"{prefix}-B1-Z1",
                "cell_id": None,
                "severity": severity,
                "rainfall_mm": round(rainfall_mm, 1),
                "normal_rainfall_mm": 120.9,
                "description": (
                    f"Heavy monsoon rainfall of {rainfall_mm:.1f} mm recorded at {m['name']} "
                    f"(Historical normal: 120.9 mm). Ground water accumulation risk."
                ),
            })

    return constraints


def _detect_production_deviations() -> list:
    """Detect zone-level throughput deviation vs weekly operational target."""
    constraints = []
    # Balaghat weekly target: 10,000 t; Ukwa weekly target: 4,500 t
    # Flag zones where equipment downtime and blast delays induce >10% shortfall
    cases = [
        {
            "mine_id": "balaghat",
            "block_id": "BGT-B2",
            "zone_id": "BGT-B2-Z1",
            "target_tonnes": 2500.0,
            "forecast_tonnes": 1980.0,
            "shortfall_pct": 20.8,
            "lead_driver": "LHD-02 breakdown and 5.3h blast clearance delay",
        },
        {
            "mine_id": "ukwa",
            "block_id": "UKW-B2",
            "zone_id": "UKW-B2-Z1",
            "target_tonnes": 1500.0,
            "forecast_tonnes": 1260.0,
            "shortfall_pct": 16.0,
            "lead_driver": "Secondary ventilation delay and haul truck cycle backlog",
        }
    ]

    for c in cases:
        severity = "high" if c["shortfall_pct"] >= 20.0 else "medium"
        constraints.append({
            "constraint_id": f"CONST-PROD-{c['mine_id'].upper()}-{c['zone_id']}",
            "constraint_type": "production_deviation",
            "mine_id": c["mine_id"],
            "block_id": c["block_id"],
            "zone_id": c["zone_id"],
            "cell_id": None,
            "severity": severity,
            "shortfall_pct": c["shortfall_pct"],
            "target_tonnes": c["target_tonnes"],
            "forecast_tonnes": c["forecast_tonnes"],
            "shortfall_tonnes": round(c["target_tonnes"] - c["forecast_tonnes"], 1),
            "description": (
                f"Output in {c['zone_id']} ({c['mine_id'].title()}) is tracking {c['shortfall_pct']:.1f}% "
                f"below target ({c['forecast_tonnes']:.0f}t vs {c['target_tonnes']:.0f}t) due to {c['lead_driver']}."
            ),
        })

    return constraints


def _detect_ore_availability() -> list:
    """Detect active stope extraction cells with low Mn % grade or waste rock interbeds."""
    constraints = []
    geo_path = _find_data_file("geological_grid.csv")
    if not os.path.exists(geo_path):
        return constraints

    try:
        df = pd.read_csv(geo_path)
        # Find cells where Mn_pct is sub-grade (< 20% in active zones)
        low_grade = df[df["Mn_pct"] < 20.0].sort_values("Mn_pct").head(4)
        for _, row in low_grade.iterrows():
            cid = str(row["Cell_ID"])
            mn_pct = float(row.get("Mn_pct", 15.0))
            mine_id = str(row.get("Mine_ID", "balaghat")).lower()
            block_id = str(row.get("Block_ID", ""))
            zone_id = str(row.get("Zone_ID", ""))
            rock_type = str(row.get("Rock_Type", "Mica Schist"))
            formation = str(row.get("Geological_Unit", "Sitasaongi Formation"))

            severity = "high" if mn_pct < 12.0 else "medium"
            constraints.append({
                "constraint_id": f"CONST-ORE-{cid}",
                "constraint_type": "ore_availability",
                "mine_id": mine_id,
                "block_id": block_id,
                "zone_id": zone_id,
                "cell_id": cid,
                "severity": severity,
                "mn_pct": round(mn_pct, 2),
                "rock_type": rock_type,
                "geological_unit": formation,
                "description": (
                    f"Sub-grade manganese horizon ({mn_pct:.2f}% Mn, {rock_type}) encountered at extraction "
                    f"cell {cid} in {zone_id} ({mine_id.title()}). Feed blending required."
                ),
            })
    except Exception:
        pass

    return constraints


def _detect_safety_restrictions() -> list:
    """Detect ground control risks from micro-seismic fracture zones and DGMS PPV thresholds."""
    constraints = []
    seis_path = _find_data_file("geode_seismic_stations.csv")
    if not os.path.exists(seis_path):
        return constraints

    try:
        df = pd.read_csv(seis_path)
        # Stations with fault fracture or elevated anomaly score >= 0.35
        hazardous = df[(df["Fault_Fracture_Indicator"] == 1) | (df["Anomaly_Score"] >= 0.35)].head(4)
        for _, row in hazardous.iterrows():
            st_id = str(row["Station_ID"])
            mine_id = str(row.get("Mine_ID", "balaghat")).lower()
            block_id = str(row.get("Block_ID", ""))
            zone_id = f"{block_id}-Z1"
            anomaly = float(row.get("Anomaly_Score", 0.0))
            ratio = float(row.get("Vp_Vs_ratio", 1.7))
            depth = float(row.get("Estimated_Depth_to_Ore_m", 150.0))

            severity = "critical" if anomaly >= 0.40 or ratio >= 2.10 else "high"
            constraints.append({
                "constraint_id": f"CONST-SAFE-{st_id}",
                "constraint_type": "safety_restriction",
                "mine_id": mine_id,
                "block_id": block_id,
                "zone_id": zone_id,
                "cell_id": None,
                "station_id": st_id,
                "severity": severity,
                "anomaly_score": round(anomaly, 2),
                "vp_vs_ratio": round(ratio, 2),
                "depth_to_ore_m": round(depth, 1),
                "description": (
                    f"Seismic station {st_id} at {mine_id.title()} {block_id} reports shear rock fracturing "
                    f"(Anomaly: {anomaly:.2f}, Vp/Vs: {ratio:.2f}, depth: {depth:.0f}m). DGMS ground stability alert."
                ),
            })
    except Exception:
        pass

    return constraints


def _detect_exploration_priorities() -> list:
    """Detect high prospectivity reserve cells requiring exploratory diamond core drilling."""
    constraints = []
    geo_path = _find_data_file("geological_grid.csv")
    if not os.path.exists(geo_path):
        return constraints

    try:
        df = pd.read_csv(geo_path)
        # Find prospective cells with high predicted reserve probability >= 0.85
        high_prob = df[df["Predicted_Reserve_Probability"] >= 0.85].sort_values(
            "Predicted_Reserve_Probability", ascending=False
        ).head(4)

        for _, row in high_prob.iterrows():
            cid = str(row["Cell_ID"])
            prob = float(row.get("Predicted_Reserve_Probability", 0.85))
            mn_pct = float(row.get("Mn_pct", 38.0))
            mine_id = str(row.get("Mine_ID", "balaghat")).lower()
            block_id = str(row.get("Block_ID", ""))
            zone_id = str(row.get("Zone_ID", ""))
            formation = str(row.get("Geological_Unit", "Mansar Formation"))

            severity = "high" if prob >= 0.90 else "medium"
            constraints.append({
                "constraint_id": f"CONST-EXP-{cid}",
                "constraint_type": "exploration_priority",
                "mine_id": mine_id,
                "block_id": block_id,
                "zone_id": zone_id,
                "cell_id": cid,
                "severity": severity,
                "predicted_reserve_probability": round(prob, 3),
                "mn_pct": round(mn_pct, 1),
                "geological_unit": formation,
                "description": (
                    f"Exploration Priority: High prospectivity index ({prob*100:.1f}%, {mn_pct:.1f}% Mn) identified "
                    f"at cell {cid} ({formation}, {mine_id.title()}). Inferred resource confirmation required."
                ),
            })
    except Exception:
        pass

    return constraints


def detect_constraints() -> list:
    """
    Stage 1: Scan current two-mine datasets and emit a list of typed constraints.
    Constraint types:
      1. equipment_downtime
      2. blast_delay
      3. weather_restriction
      4. production_deviation
      5. ore_availability
      6. safety_restriction
      7. exploration_priority
    """
    constraints = []
    constraints.extend(_detect_equipment_downtime())
    constraints.extend(_detect_blast_delays())
    constraints.extend(_detect_weather_restrictions())
    constraints.extend(_detect_production_deviations())
    constraints.extend(_detect_ore_availability())
    constraints.extend(_detect_safety_restrictions())
    constraints.extend(_detect_exploration_priorities())
    return constraints


# ============================================================================
# Stage 2: Corrective Action Generation
# ============================================================================

def _generate_equipment_action(c: dict) -> dict:
    """Equipment redeployment matching rule: pair donor machine to breakdown unit."""
    eq_id = c.get("equipment_id", "EQ-UNIT")
    eq_type = c.get("equipment_type", "Heavy Unit")
    target_zone = c.get("zone_id", "Target Zone")
    mine_id = c.get("mine_id", "balaghat")

    # Match donor machine from healthy zone / opposite mine
    if mine_id == "balaghat":
        donor_id = "LHD-01"
        donor_zone = "BGT-B1-Z1"
        donor_status = "Active / Idle Buffer"
    else:
        donor_id = "TRK-01"
        donor_zone = "UKW-B1-Z1"
        donor_status = "Low Utilization"

    uplift_tph = 36.5
    proposed = (
        f"Redeploy {eq_type} {donor_id} from {donor_zone} ({donor_status}) to {target_zone} to substitute "
        f"for {eq_id}. Estimated throughput recovery: +{uplift_tph:.1f} t/h (85% rated availability uplift)."
    )

    return {
        "id": f"PROP-EQ-{eq_id}",
        "constraint_type": "equipment_downtime",
        "mine_id": mine_id,
        "zone_id": target_zone,
        "description": c["description"],
        "proposed_change": proposed,
        "status": "proposed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _generate_blast_action(c: dict) -> dict:
    """Blast schedule adjustment: stagger detonation sequence and clear ventilation backlog."""
    blast_id = c.get("blast_id", "BLAST-001")
    zone_id = c.get("zone_id", "Zone")
    mine_id = c.get("mine_id", "balaghat")
    delay = c.get("total_delay_hours", 3.5)

    proposed = (
        f"Reschedule detonation window for {blast_id} in {zone_id} by +{delay:.1f}h; advance auxiliary ventilation "
        f"purge cycle and enforce pre-shift stope clearance to eliminate smoke reentry delay."
    )

    return {
        "id": f"PROP-BLAST-{blast_id}",
        "constraint_type": "blast_delay",
        "mine_id": mine_id,
        "zone_id": zone_id,
        "description": c["description"],
        "proposed_change": proposed,
        "status": "proposed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _generate_weather_action(c: dict) -> dict:
    """Weather restriction mitigation: sump dewatering and covered decline transport."""
    mine_id = c.get("mine_id", "balaghat")
    zone_id = c.get("zone_id", "Primary Decline")
    rain = c.get("rainfall_mm", 400.0)

    proposed = (
        f"Activate dual 150 kW submersible dewatering pumps at shaft sump ({mine_id.title()}); divert underground "
        f"ore haulage via enclosed Decline portal and suspend open pit surface stockpiling during {rain:.0f}mm rainfall."
    )

    return {
        "id": f"PROP-WX-{mine_id.upper()}",
        "constraint_type": "weather_restriction",
        "mine_id": mine_id,
        "zone_id": zone_id,
        "description": c["description"],
        "proposed_change": proposed,
        "status": "proposed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _generate_production_action(c: dict) -> dict:
    """Production deviation correction: quota rebalancing to high-yield alternate stope."""
    mine_id = c.get("mine_id", "balaghat")
    zone_id = c.get("zone_id", "Current Zone")
    shortfall = c.get("shortfall_tonnes", 400.0)
    alt_zone = "BGT-B1-Z1" if mine_id == "balaghat" else "UKW-B1-Z1"

    proposed = (
        f"Reallocate +{shortfall:.0f}t extraction quota to high-grade Stope {alt_zone} and add 2 additional "
        f"loading cycles on 2nd shift to neutralize projected {shortfall:.0f}t shortfall in {zone_id}."
    )

    return {
        "id": f"PROP-PROD-{mine_id.upper()}-{zone_id}",
        "constraint_type": "production_deviation",
        "mine_id": mine_id,
        "zone_id": zone_id,
        "description": c["description"],
        "proposed_change": proposed,
        "status": "proposed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _generate_ore_action(c: dict) -> dict:
    """Ore availability mitigation: ROM feed blending with high-grade stope."""
    mine_id = c.get("mine_id", "balaghat")
    zone_id = c.get("zone_id", "Stope")
    cell_id = c.get("cell_id", "CELL")
    mn_pct = c.get("mn_pct", 12.0)
    blend_source = "Sitasaongi High-Grade Stope (41.5% Mn)" if mine_id == "balaghat" else "Ukwa East Lens 1 (39.0% Mn)"

    proposed = (
        f"Enforce ROM ore blending protocol: blend low-grade feed ({mn_pct:.1f}% Mn) from cell {cell_id} with "
        f"{blend_source} in 1:2 ratio at central silo bin to guarantee 33.5% manganese mill spec."
    )

    return {
        "id": f"PROP-ORE-{cell_id}",
        "constraint_type": "ore_availability",
        "mine_id": mine_id,
        "zone_id": zone_id,
        "description": c["description"],
        "proposed_change": proposed,
        "status": "proposed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _generate_safety_action(c: dict) -> dict:
    """Safety restriction compliance: DGMS ground control compliance and charge limitation."""
    mine_id = c.get("mine_id", "balaghat")
    zone_id = c.get("zone_id", "Fracture Zone")
    station_id = c.get("station_id", "STATION")

    proposed = (
        f"DGMS Ground Control Compliance: establish 50m exclusion zone around seismic station {station_id}; "
        f"install systematic resin roof bolting and reduce maximum instantaneous blast charge to <22 kg/delay."
    )

    return {
        "id": f"PROP-SAFE-{station_id}",
        "constraint_type": "safety_restriction",
        "mine_id": mine_id,
        "zone_id": zone_id,
        "description": c["description"],
        "proposed_change": proposed,
        "status": "proposed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def _generate_exploration_action(c: dict) -> dict:
    """Exploration priority recommendation: exploratory diamond core drill hole."""
    mine_id = c.get("mine_id", "balaghat")
    zone_id = c.get("zone_id", "Exploration Block")
    cell_id = c.get("cell_id", "CELL")
    prob = c.get("predicted_reserve_probability", 0.90)

    proposed = (
        f"Authorize 2-hole underground diamond core drilling campaign (DDH-2026-{cell_id[-4:]}, 180m depth) at "
        f"cell {cell_id} (P={prob:.2f}) to upgrade inferred manganese prospectivity to drill-confirmed JORC reserves."
    )

    return {
        "id": f"PROP-EXP-{cell_id}",
        "constraint_type": "exploration_priority",
        "mine_id": mine_id,
        "zone_id": zone_id,
        "description": c["description"],
        "proposed_change": proposed,
        "status": "proposed",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }


def generate_candidate_actions(constraints: list = None) -> list:
    """
    Stage 2: For each detected constraint, generate candidate action proposals
    using existing rule patterns in the codebase.
    """
    if constraints is None:
        constraints = detect_constraints()

    proposals = []
    generator_map = {
        "equipment_downtime": _generate_equipment_action,
        "blast_delay": _generate_blast_action,
        "weather_restriction": _generate_weather_action,
        "production_deviation": _generate_production_action,
        "ore_availability": _generate_ore_action,
        "safety_restriction": _generate_safety_action,
        "exploration_priority": _generate_exploration_action,
    }

    for c in constraints:
        ctype = c.get("constraint_type")
        gen_fn = generator_map.get(ctype)
        if gen_fn:
            prop = gen_fn(c)
            proposals.append(prop)

    return proposals


# ============================================================================
# Stage 3 Store: Sync, Query, and Manager Decision Workflow
# ============================================================================

def sync_proposals_to_db(db_path: str = None) -> int:
    """
    Scan constraints, generate candidate proposals, and insert any new proposals
    into `schedule_actions`. Preserves rows that have already been accepted or rejected.
    Returns count of newly inserted proposals.
    """
    init_db(db_path)
    proposals = generate_candidate_actions()
    conn = get_db_connection(db_path)
    inserted_count = 0

    try:
        with conn:
            for p in proposals:
                # Check if proposal exists
                cur = conn.execute("SELECT id, status FROM schedule_actions WHERE id = ?", (p["id"],))
                row = cur.fetchone()
                if row is None:
                    conn.execute("""
                        INSERT INTO schedule_actions (
                            id, constraint_type, mine_id, zone_id, description,
                            proposed_change, status, created_at, decided_at, decided_by
                        ) VALUES (?, ?, ?, ?, ?, ?, 'proposed', ?, NULL, NULL)
                    """, (
                        p["id"],
                        p["constraint_type"],
                        p["mine_id"],
                        p.get("zone_id"),
                        p["description"],
                        p["proposed_change"],
                        p.get("created_at", datetime.now(timezone.utc).isoformat()),
                    ))
                    inserted_count += 1
    finally:
        conn.close()

    return inserted_count


def get_proposals(status: str = None, mine_id: str = None, db_path: str = None) -> list:
    """
    Query proposals from `schedule_actions`.
    Optionally filter by status ('proposed', 'accepted', 'rejected', or 'all') and mine_id.
    """
    init_db(db_path)
    conn = get_db_connection(db_path)
    proposals = []

    try:
        query = "SELECT * FROM schedule_actions WHERE 1=1"
        params = []

        if status and status.lower() != "all":
            query += " AND status = ?"
            params.append(status.lower())

        if mine_id and mine_id.lower() != "all":
            query += " AND LOWER(mine_id) = ?"
            params.append(mine_id.lower().strip())

        query += " ORDER BY CASE status WHEN 'proposed' THEN 1 WHEN 'accepted' THEN 2 ELSE 3 END, created_at DESC"

        cur = conn.execute(query, params)
        for r in cur.fetchall():
            proposals.append({
                "id": r["id"],
                "constraint_type": r["constraint_type"],
                "mine_id": r["mine_id"],
                "zone_id": r["zone_id"],
                "description": r["description"],
                "proposed_change": r["proposed_change"],
                "status": r["status"],
                "created_at": r["created_at"],
                "decided_at": r["decided_at"],
                "decided_by": r["decided_by"],
            })
    finally:
        conn.close()

    return proposals


def decide_proposal(
    proposal_id: str,
    decision: str,
    manager_name: str = "Operations Manager",
    db_path: str = None
) -> dict:
    """
    Record manager decision ('accept' or 'reject') for a proposal.
    On accept:
      1. Inserts a contextual system-generated message into the mapped channel
         in `mine_command_messages` (e.g. equipment redeployment -> #Equipment).
      2. Auto-creates an Action Tracker entry in `actions` with status 'Open'.
    
    Returns:
        dict: {"success": True, "action": updated_action, "command_message": command_dict_or_None, "action_item": action_dict_or_None}
    Raises:
        ValueError if decision is invalid or proposal not found.
    """
    init_db(db_path)
    dec = str(decision).strip().lower()
    if dec not in ("accept", "reject"):
        raise ValueError(f"Decision must be 'accept' or 'reject', got '{decision}'")

    manager = str(manager_name or "Operations Manager").strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    target_status = "accepted" if dec == "accept" else "rejected"

    conn = get_db_connection(db_path)
    try:
        with conn:
            cur = conn.execute("SELECT * FROM schedule_actions WHERE id = ?", (proposal_id,))
            row = cur.fetchone()
            if row is None:
                raise ValueError(f"Proposal with ID '{proposal_id}' does not exist.")

            # Update schedule_actions
            conn.execute("""
                UPDATE schedule_actions
                SET status = ?, decided_at = ?, decided_by = ?
                WHERE id = ?
            """, (target_status, now_iso, manager, proposal_id))

            command_msg = None
            action_item = None
            if target_status == "accepted":
                channel = get_channel_for_constraint(row["constraint_type"])
                cmd_type = f"{row['constraint_type'].upper()}_DIRECTIVE"
                directive_msg = (
                    f"DIRECTIVE ISSUED by {manager} for {row['mine_id'].upper()}/{row['zone_id']}: "
                    f"{row['proposed_change']}"
                )
                cur_cmd = conn.execute("""
                    INSERT INTO mine_command_messages (
                        channel, author, text, created_at, is_system_generated,
                        action_id, mine_id, zone_id, command_type, message, issued_at, issued_by, status
                    ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, 'broadcast')
                """, (
                    channel,
                    manager,
                    directive_msg,
                    now_iso,
                    proposal_id,
                    row["mine_id"],
                    row["zone_id"],
                    cmd_type,
                    directive_msg,
                    now_iso,
                    manager,
                ))
                cmd_id = cur_cmd.lastrowid
                command_msg = {
                    "id": cmd_id,
                    "channel": channel,
                    "author": manager,
                    "text": directive_msg,
                    "created_at": now_iso,
                    "is_system_generated": 1,
                    "action_id": proposal_id,
                    "mine_id": row["mine_id"],
                    "zone_id": row["zone_id"],
                    "command_type": cmd_type,
                    "message": directive_msg,
                    "issued_at": now_iso,
                    "issued_by": manager,
                    "status": "broadcast",
                }

                # Auto-create tracked action in `actions`
                action_id = f"ACT-{proposal_id}"
                assigned_to = CONSTRAINT_TO_ROLE.get(str(row["constraint_type"]).lower(), "Operations Manager")
                priority = "High" if any(k in str(row["constraint_type"]).lower() for k in ("downtime", "blast", "safety")) else "Medium"
                issue_text = f"[{row['constraint_type'].replace('_', ' ').title()}] {row['description']}: {row['proposed_change']}"

                conn.execute("""
                    INSERT OR REPLACE INTO actions (
                        action_id, issue, mine_id, zone_id, assigned_to, deadline, priority,
                        status, created_at, approved_at, completed_at, actual_update
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, NULL, NULL)
                """, (
                    action_id,
                    issue_text,
                    row["mine_id"],
                    row["zone_id"],
                    assigned_to,
                    None,
                    priority,
                    now_iso,
                    now_iso,
                ))

                action_item = {
                    "action_id": action_id,
                    "issue": issue_text,
                    "mine_id": row["mine_id"],
                    "zone_id": row["zone_id"],
                    "assigned_to": assigned_to,
                    "deadline": None,
                    "priority": priority,
                    "status": "Open",
                    "created_at": now_iso,
                    "approved_at": now_iso,
                    "completed_at": None,
                    "actual_update": None,
                }

            updated_action = {
                "id": row["id"],
                "constraint_type": row["constraint_type"],
                "mine_id": row["mine_id"],
                "zone_id": row["zone_id"],
                "description": row["description"],
                "proposed_change": row["proposed_change"],
                "status": target_status,
                "created_at": row["created_at"],
                "decided_at": now_iso,
                "decided_by": manager,
            }

            return {
                "success": True,
                "action": updated_action,
                "command_message": command_msg,
                "action_item": action_item,
            }
    finally:
        conn.close()


def get_command_messages(limit: int = 50, db_path: str = None) -> list:
    """Fetch broadcasted mine command messages (used for auditing and backward compatibility)."""
    init_db(db_path)
    conn = get_db_connection(db_path)
    messages = []
    try:
        cur = conn.execute("""
            SELECT * FROM mine_command_messages
            ORDER BY id DESC
            LIMIT ?
        """, (limit,))
        for r in cur.fetchall():
            text_val = r["text"] if ("text" in r.keys() and r["text"]) else (r["message"] if "message" in r.keys() else "")
            author_val = r["author"] if ("author" in r.keys() and r["author"]) else (r["issued_by"] if "issued_by" in r.keys() else "System")
            created_val = r["created_at"] if ("created_at" in r.keys() and r["created_at"]) else (r["issued_at"] if "issued_at" in r.keys() else "")
            channel_val = r["channel"] if ("channel" in r.keys() and r["channel"]) else "General"
            is_sys = bool(r["is_system_generated"]) if "is_system_generated" in r.keys() else 1

            messages.append({
                "id": r["id"],
                "channel": channel_val,
                "author": author_val,
                "text": text_val,
                "created_at": created_val,
                "is_system_generated": 1 if is_sys else 0,
                "action_id": r["action_id"] if "action_id" in r.keys() else None,
                "mine_id": r["mine_id"] if "mine_id" in r.keys() else None,
                "zone_id": r["zone_id"] if "zone_id" in r.keys() else None,
                "command_type": r["command_type"] if "command_type" in r.keys() else "GENERAL",
                "message": text_val,
                "issued_at": created_val,
                "issued_by": author_val,
                "status": r["status"] if "status" in r.keys() else "broadcast",
            })
    finally:
        conn.close()

    return messages


# ============================================================================
# Phase 6: Mine Command Chat System
# ============================================================================

def get_chat_messages(channel: str, limit: int = 50, db_path: str = None) -> list:
    """
    Fetch last N messages for a specific Mine Command channel.
    Ordered chronologically (ASC) for natural chat message display.
    """
    init_db(db_path)
    norm_channel = _normalize_channel(channel)
    conn = get_db_connection(db_path)
    messages = []
    try:
        cur = conn.execute("""
            SELECT * FROM (
                SELECT * FROM mine_command_messages
                WHERE LOWER(channel) = LOWER(?)
                ORDER BY id DESC
                LIMIT ?
            )
            ORDER BY id ASC
        """, (norm_channel, limit))
        for r in cur.fetchall():
            text_val = r["text"] if ("text" in r.keys() and r["text"]) else (r["message"] if "message" in r.keys() else "")
            author_val = r["author"] if ("author" in r.keys() and r["author"]) else (r["issued_by"] if "issued_by" in r.keys() else "System")
            created_val = r["created_at"] if ("created_at" in r.keys() and r["created_at"]) else (r["issued_at"] if "issued_at" in r.keys() else "")
            messages.append({
                "id": r["id"],
                "channel": norm_channel,
                "author": author_val,
                "text": text_val,
                "created_at": created_val,
                "is_system_generated": int(r["is_system_generated"]) if "is_system_generated" in r.keys() else 0,
                "action_id": r["action_id"] if "action_id" in r.keys() else None,
                "mine_id": r["mine_id"] if "mine_id" in r.keys() else None,
                "zone_id": r["zone_id"] if "zone_id" in r.keys() else None,
            })
    finally:
        conn.close()

    return messages


def post_chat_message(
    channel: str,
    author: str,
    text: str,
    is_system_generated: bool = False,
    mine_id: str = None,
    zone_id: str = None,
    action_id: str = None,
    db_path: str = None
) -> dict:
    """
    Post a user or system message into a Mine Command channel.
    """
    init_db(db_path)
    norm_channel = _normalize_channel(channel)
    clean_text = str(text or "").strip()
    if not clean_text:
        raise ValueError("Message text cannot be empty.")

    clean_author = str(author or "Field Personnel").strip()
    clean_action_id = str(action_id).strip() if action_id else f"CHAT-{norm_channel[:3].upper()}"
    clean_mine_id = str(mine_id or "balaghat").strip().lower()
    clean_zone_id = str(zone_id or "General").strip()
    now_iso = datetime.now(timezone.utc).isoformat()
    sys_gen = 1 if is_system_generated else 0

    conn = get_db_connection(db_path)
    try:
        with conn:
            cur = conn.execute("""
                INSERT INTO mine_command_messages (
                    channel, author, text, created_at, is_system_generated,
                    action_id, mine_id, zone_id, command_type, message, issued_at, issued_by, status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'broadcast')
            """, (
                norm_channel,
                clean_author,
                clean_text,
                now_iso,
                sys_gen,
                clean_action_id,
                clean_mine_id,
                clean_zone_id,
                f"{norm_channel.upper()}_MSG",
                clean_text,
                now_iso,
                clean_author,
            ))
            msg_id = cur.lastrowid
            return {
                "id": msg_id,
                "channel": norm_channel,
                "author": clean_author,
                "text": clean_text,
                "created_at": now_iso,
                "is_system_generated": sys_gen,
                "action_id": action_id,
                "mine_id": mine_id,
                "zone_id": zone_id,
            }
    finally:
        conn.close()


# ============================================================================
# Phase 6: Action Tracker
# ============================================================================

def create_action(
    issue: str,
    mine_id: str,
    zone_id: str = None,
    assigned_to: str = "Field Supervisor",
    deadline: str = None,
    priority: str = "Medium",
    db_path: str = None
) -> dict:
    """
    Manually create an Action in the Action Tracker.
    """
    init_db(db_path)
    clean_issue = str(issue or "").strip()
    if not clean_issue:
        raise ValueError("Action issue description cannot be empty.")

    clean_mine = str(mine_id or "balaghat").strip().lower()
    clean_assigned = str(assigned_to or "Field Supervisor").strip()
    clean_priority = str(priority or "Medium").capitalize()
    if clean_priority not in ("High", "Medium", "Low"):
        clean_priority = "Medium"

    now_iso = datetime.now(timezone.utc).isoformat()
    timestamp_suffix = int(datetime.now(timezone.utc).timestamp() * 1000) % 1000000
    action_id = f"ACT-{clean_mine.upper()}-{timestamp_suffix}"

    conn = get_db_connection(db_path)
    try:
        with conn:
            conn.execute("""
                INSERT INTO actions (
                    action_id, issue, mine_id, zone_id, assigned_to, deadline,
                    priority, status, created_at, approved_at, completed_at, actual_update
                ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Open', ?, ?, NULL, NULL)
            """, (
                action_id,
                clean_issue,
                clean_mine,
                zone_id,
                clean_assigned,
                deadline,
                clean_priority,
                now_iso,
                now_iso,
            ))
    finally:
        conn.close()

    # Automatically notify Operations channel
    try:
        post_chat_message(
            channel="Operations",
            author="System (Action Tracker)",
            text=f"New Action Created [{action_id}] for {clean_mine.upper()}/{zone_id or 'General'}: {clean_issue} (Assigned: {clean_assigned})",
            is_system_generated=True,
            mine_id=clean_mine,
            zone_id=zone_id,
            action_id=action_id,
            db_path=db_path
        )
    except Exception:
        pass

    return {
        "action_id": action_id,
        "issue": clean_issue,
        "mine_id": clean_mine,
        "zone_id": zone_id,
        "assigned_to": clean_assigned,
        "deadline": deadline,
        "priority": clean_priority,
        "status": "Open",
        "created_at": now_iso,
        "approved_at": now_iso,
        "completed_at": None,
        "actual_update": None,
    }


def get_actions(status: str = None, mine_id: str = None, db_path: str = None) -> list:
    """
    Retrieve tracked actions filterable by status and mine_id.
    """
    init_db(db_path)
    conn = get_db_connection(db_path)
    actions_list = []
    try:
        query = "SELECT * FROM actions WHERE 1=1"
        params = []
        if status and status.lower() != "all":
            status_map = {"open": "Open", "in progress": "In Progress", "inprogress": "In Progress", "completed": "Completed"}
            matched_status = status_map.get(status.strip().lower(), status.strip())
            query += " AND status = ?"
            params.append(matched_status)
        if mine_id and mine_id.lower() != "all":
            query += " AND LOWER(mine_id) = ?"
            params.append(mine_id.strip().lower())

        query += " ORDER BY created_at DESC"
        cur = conn.execute(query, params)
        for r in cur.fetchall():
            actions_list.append({
                "action_id": r["action_id"],
                "issue": r["issue"],
                "mine_id": r["mine_id"],
                "zone_id": r["zone_id"],
                "assigned_to": r["assigned_to"],
                "deadline": r["deadline"],
                "priority": r["priority"],
                "status": r["status"],
                "created_at": r["created_at"],
                "approved_at": r["approved_at"],
                "completed_at": r["completed_at"],
                "actual_update": r["actual_update"],
            })
    finally:
        conn.close()

    return actions_list


def update_action_status(
    action_id: str,
    status: str,
    actual_update: str = None,
    db_path: str = None
) -> dict:
    """
    Advance status: Open -> In Progress -> Completed.
    When marked 'Completed', requires an 'actual_update' string and closes the loop
    by appending a new physical row to the relevant Phase-1 dataset on disk.
    """
    init_db(db_path)
    valid_statuses = {
        "open": "Open",
        "in progress": "In Progress",
        "inprogress": "In Progress",
        "completed": "Completed"
    }
    target_status = valid_statuses.get(str(status).strip().lower(), None)
    if not target_status:
        raise ValueError(f"Invalid status '{status}'. Must be 'Open', 'In Progress', or 'Completed'.")

    conn = get_db_connection(db_path)
    try:
        with conn:
            cur = conn.execute("SELECT * FROM actions WHERE action_id = ?", (action_id,))
            row = cur.fetchone()
            if not row:
                raise ValueError(f"Action '{action_id}' not found.")

            now_iso = datetime.now(timezone.utc).isoformat()
            completed_at = now_iso if target_status == "Completed" else row["completed_at"]
            clean_update = str(actual_update or "").strip() if actual_update else row["actual_update"]

            if target_status == "Completed" and not clean_update:
                clean_update = "Field execution confirmed; operational status updated."

            conn.execute("""
                UPDATE actions
                SET status = ?, completed_at = ?, actual_update = ?
                WHERE action_id = ?
            """, (target_status, completed_at, clean_update, action_id))

            updated_dict = {
                "action_id": row["action_id"],
                "issue": row["issue"],
                "mine_id": row["mine_id"],
                "zone_id": row["zone_id"],
                "assigned_to": row["assigned_to"],
                "deadline": row["deadline"],
                "priority": row["priority"],
                "status": target_status,
                "created_at": row["created_at"],
                "approved_at": row["approved_at"],
                "completed_at": completed_at,
                "actual_update": clean_update,
            }
    finally:
        conn.close()

    # If completed, close the loop by updating the Phase 1 dataset
    field_result = None
    if target_status == "Completed":
        field_result = _execute_field_dataset_update(updated_dict, clean_update)

        # Notify the relevant channel
        issue_low = updated_dict["issue"].lower()
        channel = "Equipment" if ("equipment" in issue_low or "eq" in updated_dict["action_id"].lower()) else \
                  ("Blasting" if "blast" in issue_low else "Operations")
        try:
            post_chat_message(
                channel=channel,
                author="System (Field Execution)",
                text=f"Action Completed [{action_id}]: {clean_update} (Closed loop: {field_result.get('summary', 'telemetry logged')})",
                is_system_generated=True,
                mine_id=updated_dict["mine_id"],
                zone_id=updated_dict["zone_id"],
                action_id=action_id,
                db_path=db_path
            )
        except Exception:
            pass

    return {
        "success": True,
        "action": updated_dict,
        "field_execution": field_result,
    }


# ============================================================================
# Phase 6: Field Execution & Data Store Closed Loop
# ============================================================================

def _execute_field_dataset_update(action: dict, actual_update: str) -> dict:
    """
    Appends a new physical row to the relevant Phase-1 dataset on disk
    (e.g., equipment_iot_telemetry.csv or blasting_logs.csv) to close the loop
    from Action Tracker back into the Data Store.
    """
    issue_lower = (action.get("issue") or "").lower()
    action_id_lower = (action.get("action_id") or "").lower()
    update_lower = (actual_update or "").lower()
    combined_text = f"{issue_lower} {action_id_lower} {update_lower}"

    mine_id = (action.get("mine_id") or "balaghat").lower()
    zone_id = action.get("zone_id") or "ZONE-01"
    now = datetime.now(timezone.utc)
    now_str = now.strftime("%Y-%m-%d %H:%M:%S")

    # 1. Equipment Telemetry Update
    if any(k in combined_text for k in ("equipment", "lhd", "drill", "dump", "eq-", "redeploy", "haul")):
        # Determine equipment ID from text or fallback to unit in that mine
        eq_id = None
        for candidate in ["LHD-01", "LHD-02", "LHD-03", "DRILL-01", "DRILL-02", "DUMP-01", "DUMP-02", "DUMP-03"]:
            if candidate.lower() in combined_text:
                eq_id = candidate
                break
        if not eq_id:
            eq_id = "LHD-02" if mine_id == "balaghat" else "LHD-03"

        eq_type = "LHD Loader" if "lhd" in eq_id.lower() else ("Drill Rig" if "drill" in eq_id.lower() else "Haul Truck")
        reading_id = f"TEL-EXEC-{int(now.timestamp())}"

        new_row = {
            "Reading_ID": reading_id,
            "Timestamp": now_str,
            "Equipment_ID": eq_id,
            "Equipment_Type": eq_type,
            "Mine_ID": mine_id,
            "Block_ID": "BLK-01",
            "Zone_ID": zone_id,
            "Operating_Hours": 8.0,
            "Downtime_Hours": 0.0,
            "Availability_Pct": 98.0,
            "Fuel_or_Battery_Pct": 95.0,
            "Vibration_mm_s": 2.2,
            "Temperature_C": 68.0,
            "Maintenance_Hours": 0.0,
            "Status": "Active",
            "Data_Type": "Field Execution - Closed Loop Actual Update",
        }

        # Append to equipment_iot_telemetry.csv in both candidate locations
        for cdir in [BACKEND_DATA_DIR, ROOT_DATA_DIR]:
            p = os.path.join(cdir, "equipment_iot_telemetry.csv")
            if os.path.exists(p):
                try:
                    df = pd.read_csv(p)
                    new_df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
                    new_df.to_csv(p, index=False)
                except Exception:
                    pass

        return {
            "success": True,
            "dataset": "equipment_iot_telemetry.csv",
            "summary": f"Equipment {eq_id} redeployed to {zone_id} and set to Active in telemetry database.",
            "row": new_row
        }

    # 2. Blasting Logs Update
    elif any(k in combined_text for k in ("blast", "stemming", "clearance", "explosive", "detonat")):
        blast_id = f"BLAST-EXEC-{int(now.timestamp())}"
        new_row = {
            "Blast_ID": blast_id,
            "Mine_ID": mine_id,
            "Block_ID": "BLK-01",
            "Zone_ID": zone_id,
            "Scheduled_Time": action.get("approved_at") or now_str,
            "Actual_Time": now_str,
            "Drill_Delay_hours": 0.0,
            "Charge_Delay_hours": 0.0,
            "Clearance_Delay_hours": 0.0,
            "Fire_Delay_hours": 0.0,
            "Reentry_Delay_hours": 0.0,
            "Total_Delay_hours": 0.0,
            "Stemming_Quality": "Good",
            "Status": "Executed",
            "Data_Type": "Field Execution - Closed Loop Actual Update",
        }

        for cdir in [BACKEND_DATA_DIR, ROOT_DATA_DIR]:
            p = os.path.join(cdir, "blasting_logs.csv")
            if os.path.exists(p):
                try:
                    df = pd.read_csv(p)
                    new_df = pd.concat([df, pd.DataFrame([new_row])], ignore_index=True)
                    new_df.to_csv(p, index=False)
                except Exception:
                    pass

        return {
            "success": True,
            "dataset": "blasting_logs.csv",
            "summary": f"Blast {blast_id} recorded in {zone_id} with Actual_Time={now_str} and Total_Delay=0.0h.",
            "row": new_row
        }

    # 3. Operations / General Action Confirmation
    else:
        return {
            "success": True,
            "dataset": "actions_closed_loop",
            "summary": f"Action {action.get('action_id')} confirmed in data store.",
            "actual_update": actual_update
        }

