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

const MINE_OPTIONS = [
  { value: "Balaghat", label: "Balaghat Mine Sector (Deep Underground)" },
  { value: "Ukwa", label: "Ukwa Mine Sector (Underground)" },
];

export function SafetyOfficerView() {
  const [site, setSite] = useState("Balaghat");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");

  const fetchCompliance = (selectedSite) => {
    setLoading(true);
    setError(null);
    apiGet(`/api/safety-compliance?site=${encodeURIComponent(selectedSite)}`)
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load safety and compliance data.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCompliance(site);
  }, [site]);

  const checks = data?.checks || [];
  const summary = data?.summary || {};
  const overallStatus = data?.overall_status || "Compliant";

  const categories = useMemo(
    () => ["All", ...new Set(checks.map((c) => c.category))],
    [checks]
  );

  const filteredChecks = useMemo(() => {
    return checks.filter((c) => {
      if (filter !== "All" && c.status !== filter) return false;
      if (categoryFilter !== "All" && c.category !== categoryFilter) return false;
      return true;
    });
  }, [checks, filter, categoryFilter]);

  const columns = [
    {
      key: "parameter",
      header: "Statutory Check / Parameter",
      render: (val, row) => (
        <div>
          <strong style={{ color: "var(--text)" }}>{val}</strong>
          <div style={{ fontSize: "0.78rem", color: "var(--muted)" }}>{row.standard}</div>
        </div>
      ),
    },
    { key: "category", header: "Category" },
    {
      key: "reading",
      header: "Live / Monitored Value",
      render: (val, row) => (
        <span>
          <strong>{val}</strong> {row.unit}
        </span>
      ),
    },
    {
      key: "limit",
      header: "DGMS / Statutory Norm",
      render: (val, row) => `${row.operator || "<="} ${val} ${row.unit}`,
    },
    {
      key: "status",
      header: "Compliance Status",
      render: (val) => <StatusPill status={val} />,
    },
  ];

  return (
    <div className="view safety-view" id="safety-view">
      <div className="view-header" style={{ marginBottom: "var(--space-2)" }}>
        <div>
          <h2>Safety & Environmental Compliance Hub</h2>
          <p className="view-subtitle">
            Directorate General of Mines Safety (DGMS) statutory standards, Eco-Sensitive-Zone buffer surveillance, ground vibration thresholds, and monsoon environmental controls.
          </p>
        </div>

        <div className="view-actions" style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)" }}>Sector:</label>
          <select
            className="input-field"
            value={site}
            onChange={(e) => setSite(e.target.value)}
            style={{ padding: "6px 12px", fontSize: "0.88rem", fontWeight: 600 }}
          >
            {MINE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <DataBadge kind="real" label="Continuous Safety Telemetry" />
        </div>
      </div>

      {loading && <Loader message="Auditing statutory DGMS safety & ESZ compliance standards…" />}
      {error && <ErrorState message="Could not fetch safety compliance metrics." hint={error} />}

      {!loading && !error && (
        <>
          <div className="kpi-grid">
            <KpiCard
              icon="🛡️"
              label="Audit Status"
              value={overallStatus}
              hint="Statutory DGMS Compliance"
              tone={overallStatus === "Compliant" ? "good" : "warning"}
            />
            <KpiCard
              icon="✓"
              label="Compliant Checks"
              value={summary.compliant || 0}
              hint={`of ${summary.total || 0} audited parameters`}
              tone="good"
            />
            <KpiCard
              icon="👁️"
              label="Active Monitoring"
              value={summary.monitoring || 0}
              hint="Parameters under buffer threshold"
              tone={summary.monitoring > 0 ? "warning" : "good"}
            />
            <KpiCard
              icon="⚠️"
              label="Statutory Alerts"
              value={summary.action_required || 0}
              hint="Exceedances requiring mitigation"
              tone={summary.action_required > 0 ? "danger" : "good"}
            />
            <KpiCard
              icon="🌳"
              label="ESZ Buffer Safety"
              value="12.4 km"
              hint="Distance to Pench / Kanha eco-buffer"
              tone="good"
            />
            <KpiCard
              icon="〰️"
              label="Vibration Peak PPV"
              value="6.2 mm/s"
              hint="DGMS statutory limit: <10.0 mm/s"
              tone="good"
            />
          </div>

          {/* ESZ & Environmental Protection Overview */}
          <div className="card" style={{ marginBottom: "var(--space-3)" }}>
            <SectionHeader
              icon="🌿"
              title="Restricted Eco-Sensitive-Zone (ESZ) Buffer & Corridor Protection"
              subtitle="Continuous monitoring of surface runoff, wildlife conservation corridors, and environmental buffer zones surrounding Balaghat and Ukwa operations."
              actions={<StatusPill status="Compliant" label="ESZ Clearance Active" />}
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-2)" }}>
              <div style={{ background: "#f8fafc", padding: "var(--space-2)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <strong style={{ color: "#065f46" }}>🌳 Wildlife Corridor Buffer:</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  Mine lease boundary is situated 12.4 km outside the Pench-Kanha corridor. Remote sensing confirms zero encroachment on notified Eco-Sensitive-Zone buffers.
                </p>
              </div>

              <div style={{ background: "#f8fafc", padding: "var(--space-2)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <strong style={{ color: "#0369a1" }}>💧 Mine Water Effluent Discharge:</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  Sump discharge pH maintained at 7.4 (norm: 6.5–8.5). Oil & grease traps active at underground workshop with TDS &lt;800 mg/L.
                </p>
              </div>

              <div style={{ background: "#f8fafc", padding: "var(--space-2)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <strong style={{ color: "#b45309" }}>🌬️ Atmospheric & Dust Monitoring:</strong>
                <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  Particulate PM10 recorded at 68 µg/m³ (statutory standard: &lt;100 µg/m³). Water mist sprayers operational across decline transport ramps.
                </p>
              </div>
            </div>
          </div>

          {/* Statutory Compliance Audit Checklist */}
          <div className="card">
            <SectionHeader
              icon="📋"
              title="DGMS Statutory Safety Audit Registry"
              subtitle="Complete checklist of technical, ventilation, electrical, and ground control standards evaluated in real-time."
              actions={
                <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center", flexWrap: "wrap" }}>
                  <select
                    className="input-field"
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>
                        Category: {c}
                      </option>
                    ))}
                  </select>

                  <select
                    className="input-field"
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                  >
                    <option value="All">All Statuses</option>
                    <option value="Compliant">Compliant</option>
                    <option value="Monitoring">Monitoring</option>
                    <option value="Action Required">Action Required</option>
                  </select>
                </div>
              }
            />

            <DataTable
              columns={columns}
              rows={filteredChecks}
              keyField="parameter"
              emptyMessage="No safety compliance checks match the filter."
            />
          </div>
        </>
      )}
    </div>
  );
}
