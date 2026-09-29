import { useEffect, useMemo, useState } from "react";
import { apiGet } from "../api";
import {
  AlertBanner,
  DataBadge,
  EmptyState,
  ErrorState,
  KpiCard,
  Loader,
  Section,
} from "../ui";
import { SafetyCompliancePanel } from "./SafetyCompliancePanel";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";

const STATUS_COLORS = {
  Active: { bg: "#e6f4ea", text: "#137333", border: "#ceead6", dot: "#198754" },
  Idle: { bg: "#e8f0fe", text: "#1a73e8", border: "#d2e3fc", dot: "#0d6efd" },
  Maintenance: { bg: "#fef7e0", text: "#b06000", border: "#fce8b2", dot: "#fd7e14" },
  Breakdown: { bg: "#fce8e6", text: "#c5221f", border: "#fad2cf", dot: "#dc3545" },
};

const EQUIPMENT_ICONS = {
  Excavator: "🚜",
  "Haul Truck": "🚛",
  Crusher: "⚙️",
  Loader: "🏗️",
  "Drill Rig": "⛏️",
};

export function OperationsView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("All");
  const [typeFilter, setTypeFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [displayLimit, setDisplayLimit] = useState(24);

  // Sub-navigation tab
  const [activeSection, setActiveSection] = useState("fleet");

  // Interactive dispatch action simulation
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
        setError(err.message || "Failed to load fleet status data.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchFleet();
  }, []);

  const summary = data?.summary;
  const rawFleet = data?.fleet || [];
  const recommendations = data?.recommendations || [];

  // Filter fleet based on user selection
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

  const visibleFleet = filteredFleet.slice(0, displayLimit);

  const toggleDispatch = (recId) => {
    setDispatchedIds((prev) => {
      const next = new Set(prev);
      if (next.has(recId)) {
        next.delete(recId);
      } else {
        next.add(recId);
      }
      return next;
    });
  };

  return (
    <main className="view operations-view" id="operations-view">
      <div className="view-header">
        <div>
          <h2>Fleet & Equipment Operations Hub</h2>
          <p className="view-subtitle">
            Telemetry metrics, OEE health tracking, and heuristic fleet redeployment
            recommendations across MOIL mining assets.
          </p>
        </div>
        <div className="view-actions">
          <DataBadge kind="real" label="Asset Telemetry" />
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

      <div className="view-subtabs" style={{ marginBottom: "1.5rem" }}>
        <button
          type="button"
          className={`subtab-btn ${activeSection === "fleet" ? "active" : ""}`}
          onClick={() => setActiveSection("fleet")}
        >
          🚜 Fleet & Equipment Operations
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeSection === "approvals" ? "active" : ""}`}
          onClick={() => setActiveSection("approvals")}
        >
          📋 Pending Approvals & Directives
        </button>
        <button
          type="button"
          className={`subtab-btn ${activeSection === "compliance" ? "active" : ""}`}
          onClick={() => setActiveSection("compliance")}
        >
          🛡️ DGMS Safety & ESZ Compliance
        </button>
      </div>

      {activeSection === "compliance" ? (
        <SafetyCompliancePanel />
      ) : activeSection === "approvals" ? (
        <PendingApprovalsPanel userRole="Operations Manager" />
      ) : (
        <>
          {loading && !data && <Loader message="Loading fleet and equipment telemetry…" />}
          {error && <ErrorState message="Could not fetch fleet status." hint={error} />}

          {summary && (
            <>
              {/* Top KPI Cards */}
              <div className="kpi-grid">
            <KpiCard
              value={summary.total_units}
              label="Total Monitored Fleet"
              hint="Standard heavy mining units"
            />
            <KpiCard
              value={summary.active_units}
              label="Active Fleet"
              hint={`${Math.round((summary.active_units / summary.total_units) * 100)}% active utilization`}
              tone="good"
            />
            <KpiCard
              value={summary.idle_units}
              label="Idle Units"
              hint="Available for redeployment"
            />
            <KpiCard
              value={summary.maintenance_units}
              label="In Maintenance"
              hint="Scheduled & ongoing servicing"
              tone="warning"
            />
            <KpiCard
              value={summary.breakdown_units}
              label="Breakdown Alerts"
              hint="Mechanical failure requiring triage"
              tone="bad"
            />
            <KpiCard
              value={`${summary.avg_oee_pct}%`}
              label="Fleet Avg OEE"
              hint={`Avail: ${summary.avg_availability_pct}% | Fuel: ${summary.avg_fuel_pct}%`}
            />
          </div>

          {/* AI Fleet Redeployment Recommendations Section */}
          <Section
            step="ACTION ENGINE"
            title="AI Fleet Redeployment Recommendations"
            subtitle="Heuristic dispatch logic matching idle equipment at low-risk sites to production deficit zones"
            actions={<DataBadge kind="illustrative" label="Rule-Based (Non-ML)" />}
          >
            <AlertBanner severity="info" title="Rule-Based Heuristic Optimization">
              {data.disclaimer}
            </AlertBanner>

            {recommendations.length === 0 ? (
              <EmptyState>No redeployment actions currently required.</EmptyState>
            ) : (
              <div className="recommendations-container">
                <div className="recommendations-grid">
                  {recommendations.slice(0, 6).map((rec) => {
                    const isDispatched = dispatchedIds.has(rec.id);
                    return (
                      <div
                        key={rec.id}
                        className={`recommendation-card ${isDispatched ? "dispatched" : ""}`}
                      >
                        <div className="rec-header">
                          <span className={`priority-tag ${rec.priority.toLowerCase()}`}>
                            {rec.priority} Priority
                          </span>
                          <span className="rec-id">{rec.id}</span>
                        </div>

                        <div className="rec-flow">
                          <div className="rec-site-box source">
                            <span className="site-label">Source (Idle/Maint)</span>
                            <strong>{rec.source_site}</strong>
                            <span className="site-sub">Status: {rec.source_status}</span>
                          </div>
                          <div className="rec-arrow">➔</div>
                          <div className="rec-site-box target">
                            <span className="site-label">Target (Shortfall)</span>
                            <strong>{rec.target_site}</strong>
                            <span className="site-sub">{rec.target_issue}</span>
                          </div>
                        </div>

                        <div className="rec-asset-info">
                          <span className="asset-name">
                            {EQUIPMENT_ICONS[rec.equipment_type] || "🚜"}{" "}
                            <strong>{rec.equipment_id}</strong> ({rec.equipment_type})
                          </span>
                          <span className="asset-uplift">
                            +{rec.estimated_uplift_tph} t/h expected
                          </span>
                        </div>

                        <p className="rec-reason">{rec.reason}</p>

                        <div className="rec-footer">
                          <button
                            type="button"
                            className={`btn ${isDispatched ? "btn-outline" : "btn-primary"} btn-sm`}
                            onClick={() => toggleDispatch(rec.id)}
                          >
                            {isDispatched ? "✓ Dispatch Queued" : "Simulate Redeployment"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </Section>

          {/* Equipment Status & Performance Grid */}
          <Section
            step="FLEET TELEMETRY"
            title="Equipment Performance & Downtime Roster"
            subtitle={`Showing ${filteredFleet.length} of ${summary.total_units} heavy assets across all MOIL sites`}
          >
            {/* Filter and Search Bar */}
            <div className="fleet-controls-bar">
              <div className="filter-group">
                <label htmlFor="fleet-status-filter">Status:</label>
                <div className="filter-chips">
                  {["All", "Active", "Idle", "Maintenance", "Breakdown"].map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`chip-btn ${statusFilter === s ? "active" : ""}`}
                      onClick={() => {
                        setStatusFilter(s);
                        setDisplayLimit(24);
                      }}
                    >
                      {s}
                      {s === "All"
                        ? ` (${summary.total_units})`
                        : s === "Active"
                        ? ` (${summary.active_units})`
                        : s === "Idle"
                        ? ` (${summary.idle_units})`
                        : s === "Maintenance"
                        ? ` (${summary.maintenance_units})`
                        : ` (${summary.breakdown_units})`}
                    </button>
                  ))}
                </div>
              </div>

              <div className="filter-group">
                <label htmlFor="fleet-type-select">Type:</label>
                <select
                  id="fleet-type-select"
                  className="filter-select"
                  value={typeFilter}
                  onChange={(e) => {
                    setTypeFilter(e.target.value);
                    setDisplayLimit(24);
                  }}
                >
                  <option value="All">All Types</option>
                  <option value="Excavator">Excavator</option>
                  <option value="Haul Truck">Haul Truck</option>
                  <option value="Crusher">Crusher</option>
                  <option value="Loader">Loader</option>
                  <option value="Drill Rig">Drill Rig</option>
                </select>
              </div>

              <div className="filter-group search-group">
                <input
                  type="text"
                  placeholder="Search Equipment ID or Site…"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setDisplayLimit(24);
                  }}
                  className="search-input"
                />
                {searchQuery && (
                  <button
                    type="button"
                    className="clear-search-btn"
                    onClick={() => setSearchQuery("")}
                  >
                    ×
                  </button>
                )}
              </div>
            </div>

            {/* Equipment Cards Grid */}
            {filteredFleet.length === 0 ? (
              <EmptyState>No equipment matching the selected filter criteria.</EmptyState>
            ) : (
              <>
                <div className="equipment-grid">
                  {visibleFleet.map((unit) => {
                    const statusStyle =
                      STATUS_COLORS[unit.status] || STATUS_COLORS.Active;
                    return (
                      <div className="equipment-card" key={unit.equipment_id}>
                        <div className="eq-card-header">
                          <div className="eq-id-wrap">
                            <span className="eq-icon">
                              {EQUIPMENT_ICONS[unit.equipment_type] || "🚜"}
                            </span>
                            <div>
                              <strong className="eq-id">{unit.equipment_id}</strong>
                              <span className="eq-type">{unit.equipment_type}</span>
                            </div>
                          </div>
                          <span
                            className="status-pill"
                            style={{
                              backgroundColor: statusStyle.bg,
                              color: statusStyle.text,
                              borderColor: statusStyle.border,
                            }}
                          >
                            <span
                              className="status-dot"
                              style={{ backgroundColor: statusStyle.dot }}
                            />
                            {unit.status}
                          </span>
                        </div>

                        <div className="eq-site-badge">
                          <span>📍 {unit.site_id}</span>
                          <span className="eq-prod">
                            {unit.productivity_tonnes_per_hr} t/h
                          </span>
                        </div>

                        {/* OEE Metric */}
                        <div className="eq-metric-block">
                          <div className="eq-metric-head">
                            <span>Overall Effectiveness (OEE)</span>
                            <strong>{unit.oee_pct}%</strong>
                          </div>
                          <div className="progress-bar-bg">
                            <div
                              className="progress-bar-fill"
                              style={{
                                width: `${Math.min(100, unit.oee_pct)}%`,
                                backgroundColor:
                                  unit.oee_pct >= 65
                                    ? "#198754"
                                    : unit.oee_pct >= 45
                                    ? "#fd7e14"
                                    : "#dc3545",
                              }}
                            />
                          </div>
                          <div className="eq-submetric">
                            <span>Availability: {unit.availability_pct}%</span>
                            <span>Target: 65 t/h</span>
                          </div>
                        </div>

                        {/* Fuel Level */}
                        <div className="eq-metric-block">
                          <div className="eq-metric-head">
                            <span>Fuel Level</span>
                            <strong>{unit.fuel_pct}%</strong>
                          </div>
                          <div className="progress-bar-bg">
                            <div
                              className="progress-bar-fill"
                              style={{
                                width: `${unit.fuel_pct}%`,
                                backgroundColor:
                                  unit.fuel_pct >= 50
                                    ? "#0d6efd"
                                    : unit.fuel_pct >= 25
                                    ? "#fd7e14"
                                    : "#dc3545",
                              }}
                            />
                          </div>
                          <div className="eq-submetric">
                            <span>Burn: {unit.fuel_consumption_l_per_hr} L/h</span>
                            <span>Op: {unit.operating_hours} h</span>
                          </div>
                        </div>

                        {/* Downtime Breakdown Details */}
                        <div className="eq-details-footer">
                          <span>Downtime: {unit.downtime_hours}h</span>
                          <span>Maint: {unit.maintenance_hours}h</span>
                          <span>Mech Fail: {unit.mechanical_failure_hours}h</span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {filteredFleet.length > displayLimit && (
                  <div className="load-more-wrap">
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setDisplayLimit((prev) => prev + 24)}
                    >
                      Load More Equipment ({filteredFleet.length - displayLimit} remaining)
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setDisplayLimit(filteredFleet.length)}
                    >
                      Show All ({filteredFleet.length})
                    </button>
                  </div>
                )}
              </>
            )}
          </Section>

          <PendingApprovalsPanel userRole="Operations Manager" />
        </>
      )}
        </>
      )}
    </main>
  );
}
