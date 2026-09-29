import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import {
  AlertBanner,
  DataBadge,
  DataTable,
  ErrorState,
  KpiCard,
  Loader,
  SectionHeader,
  StatusPill,
} from "../ui";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";

const EQUIPMENT_ICONS = {
  Excavator: "🚜",
  "Haul Truck": "🚛",
  Crusher: "⚙️",
  Loader: "🏗️",
  "Drill Rig": "⛏️",
  "Load-Haul-Dump Loader": "🚜",
};

export function EquipmentMaintenanceView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUnit, setSelectedUnit] = useState(null);
  const [dispatchedIds, setDispatchedIds] = useState(new Set());

  const fetchFleet = () => {
    setLoading(true);
    setError(null);
    apiGet("/api/fleet-status")
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load equipment telemetry.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchFleet();
  }, []);

  const summary = data?.summary;
  const rawFleet = data?.fleet || [];
  const recommendations = data?.recommendations || [];

  const filteredFleet = useMemo(() => {
    return rawFleet.filter((unit) => {
      if (statusFilter !== "All" && unit.status !== statusFilter) return false;
      if (typeFilter !== "All" && unit.equipment_type !== typeFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesId = unit.equipment_id.toLowerCase().includes(q);
        const matchesSite = unit.site_id.toLowerCase().includes(q);
        const matchesType = unit.equipment_type.toLowerCase().includes(q);
        if (!matchesId && !matchesSite && !matchesType) return false;
      }
      return true;
    });
  }, [rawFleet, statusFilter, typeFilter, searchQuery]);

  const toggleDispatch = (recId) => {
    setDispatchedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recId)) next.delete(recId);
      else next.add(recId);
      return next;
    });
  };

  const columns = [
    {
      key: "equipment_id",
      header: "Unit ID",
      render: (val, row) => (
        <button
          type="button"
          onClick={() => setSelectedUnit(row)}
          style={{
            background: "none",
            border: "none",
            color: "var(--primary)",
            fontWeight: 700,
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
          }}
        >
          {EQUIPMENT_ICONS[row.equipment_type] || "🚜"} {val}
        </button>
      ),
    },
    { key: "equipment_type", header: "Equipment Type" },
    {
      key: "site_id",
      header: "Assigned Mine / Zone",
      render: (val) => (val?.toLowerCase() === "balaghat" ? "Balaghat Mine" : val?.toLowerCase() === "ukwa" ? "Ukwa Mine" : val),
    },
    {
      key: "operating_hours",
      header: "Operating Hrs",
      numeric: true,
      render: (val) => `${Number(val || 0).toFixed(1)}h`,
    },
    {
      key: "downtime_hours",
      header: "Downtime Hrs",
      numeric: true,
      render: (val) => {
        const d = Number(val || 0);
        return <span style={{ color: d >= 6.0 ? "#dc2626" : "inherit", fontWeight: d >= 6.0 ? 600 : 400 }}>{d.toFixed(1)}h</span>;
      },
    },
    {
      key: "availability_pct",
      header: "Availability",
      numeric: true,
      render: (val) => `${Number(val || 0).toFixed(1)}%`,
    },
    {
      key: "oee_pct",
      header: "OEE Index",
      numeric: true,
      render: (val) => `${Number(val || 0).toFixed(1)}%`,
    },
    {
      key: "fuel_pct",
      header: "Energy Level",
      numeric: true,
      render: (val) => `${Number(val || 0).toFixed(0)}%`,
    },
    {
      key: "status",
      header: "Status",
      render: (val) => <StatusPill status={val} />,
    },
  ];

  return (
    <div className="view equipment-view" id="equipment-view">
      <div className="view-header" style={{ marginBottom: "var(--space-2)" }}>
        <div>
          <h2>Equipment & Maintenance Hub</h2>
          <p className="view-subtitle">
            IoT sensor telemetry, OEE tracking, mechanical breakdown triage, and rule-based fleet redeployment across MOIL assets.
          </p>
        </div>

        <div className="view-actions" style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
          <DataBadge kind="real" label="Asset IoT Telemetry" />
          <button
            type="button"
            className="btn btn-outline"
            onClick={fetchFleet}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "↻ Refresh Fleet Data"}
          </button>
        </div>
      </div>

      {loading && !data && <Loader message="Loading fleet and equipment telemetry…" />}
      {error && <ErrorState message="Could not fetch equipment telemetry." hint={error} />}

      {summary && (
        <>
          <div className="kpi-grid">
            <KpiCard
              icon="🚜"
              label="Total Monitored Fleet"
              value={summary.total_units}
              hint="Heavy underground mining units"
            />
            <KpiCard
              icon="⚡"
              label="Active Fleet"
              value={summary.active_units}
              hint={`${Math.round((summary.active_units / summary.total_units) * 100)}% utilization`}
              tone="good"
            />
            <KpiCard
              icon="⏸️"
              label="Idle Buffer"
              value={summary.idle_units}
              hint="Available for redeployment"
            />
            <KpiCard
              icon="🔧"
              label="In Maintenance"
              value={summary.maintenance_units}
              hint="Scheduled servicing"
              tone={summary.maintenance_units > 0 ? "warning" : "good"}
            />
            <KpiCard
              icon="⚠️"
              label="Breakdown Alerts"
              value={summary.breakdown_units}
              hint="Mechanical failure triage"
              tone={summary.breakdown_units > 0 ? "danger" : "good"}
            />
            <KpiCard
              icon="📊"
              label="Fleet Avg OEE"
              value={`${summary.avg_oee_pct}%`}
              hint={`Avail: ${summary.avg_availability_pct}% | Fuel: ${summary.avg_fuel_pct}%`}
            />
          </div>

          {/* AI Redeployment Recommendations */}
          <div className="card" style={{ marginBottom: "var(--space-3)" }}>
            <SectionHeader
              icon="🔄"
              title="Rule-Based Fleet Redeployment Recommendations"
              subtitle="Heuristic dispatch logic pairing idle buffer units at healthy sites with high-risk shortfall zones."
              actions={<DataBadge kind="illustrative" label="Constraint Engine Rules" />}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--space-2)" }}>
              {recommendations.slice(0, 4).map((rec) => {
                const isDispatched = dispatchedIds.has(rec.id);
                return (
                  <div
                    key={rec.id}
                    style={{
                      background: "#f8fafc",
                      border: `1px solid ${isDispatched ? "#10b981" : "var(--border)"}`,
                      borderRadius: "10px",
                      padding: "var(--space-2)",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "space-between",
                    }}
                  >
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "6px" }}>
                        <StatusPill status={rec.priority === "High" ? "Critical" : "Warning"} label={`${rec.priority} Priority`} />
                        <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>{rec.id}</span>
                      </div>

                      <div style={{ display: "flex", alignItems: "center", gap: "8px", margin: "6px 0", fontSize: "0.85rem" }}>
                        <span style={{ background: "#e0f2fe", color: "#0369a1", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                          {rec.source_site}
                        </span>
                        <span>➔</span>
                        <span style={{ background: "#fef2f2", color: "#991b1b", padding: "2px 6px", borderRadius: "4px", fontWeight: 600 }}>
                          {rec.target_site}
                        </span>
                      </div>

                      <div style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--text)", margin: "4px 0" }}>
                        {EQUIPMENT_ICONS[rec.equipment_type] || "🚜"} {rec.equipment_id} ({rec.equipment_type})
                        <span style={{ color: "#059669", marginLeft: "6px" }}>+{rec.estimated_uplift_tph} t/h expected</span>
                      </div>

                      <p style={{ fontSize: "0.8rem", color: "var(--muted)", margin: "4px 0 0 0", lineHeight: 1.4 }}>
                        {rec.reason}
                      </p>
                    </div>

                    <div style={{ marginTop: "var(--space-2)", borderTop: "1px solid var(--border)", paddingTop: "8px", display: "flex", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        className={`btn ${isDispatched ? "btn-outline" : "btn-primary"}`}
                        onClick={() => toggleDispatch(rec.id)}
                        style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                      >
                        {isDispatched ? "✓ Dispatch Queued" : "Simulate Redeployment"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Telemetry and Fleet Registry */}
          <div className="card" style={{ marginBottom: "var(--space-3)" }}>
            <SectionHeader
              icon="📋"
              title="Fleet Health & Sensor Telemetry Registry"
              subtitle={`Complete IoT telemetry status for ${filteredFleet.length} heavy mining units across Balaghat and Ukwa.`}
              actions={
                <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", flexWrap: "wrap" }}>
                  <input
                    type="text"
                    className="input-field"
                    placeholder="Search unit ID or type..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.82rem", width: "160px" }}
                  />
                  <select
                    className="input-field"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Active">Active</option>
                    <option value="Idle">Idle</option>
                    <option value="Maintenance">Maintenance</option>
                    <option value="Breakdown">Breakdown</option>
                  </select>
                </div>
              }
            />

            <DataTable
              columns={columns}
              rows={filteredFleet}
              keyField="equipment_id"
              emptyMessage="No equipment matches the filter."
            />

            {selectedUnit && (
              <div
                style={{
                  marginTop: "var(--space-2)",
                  padding: "var(--space-2)",
                  background: "#f0f9ff",
                  border: "1px solid #bae6fd",
                  borderRadius: "8px",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  fontSize: "0.85rem",
                }}
              >
                <div>
                  <strong>Inspecting: {selectedUnit.equipment_type} {selectedUnit.equipment_id}</strong>
                  <span style={{ color: "var(--muted)", marginLeft: "var(--space-2)" }}>
                    Location: {selectedUnit.site_id} • Status: <StatusPill status={selectedUnit.status} />
                  </span>
                </div>
                <div>
                  Availability: <strong>{selectedUnit.availability_pct}%</strong> • Operating: <strong>{selectedUnit.operating_hours}h</strong>
                </div>
              </div>
            )}
          </div>

          {/* Pending Approvals Panel */}
          <PendingApprovalsPanel userRole="Equipment & Maintenance" />
        </>
      )}
    </div>
  );
}
