import { useEffect, useState } from "react";
import { apiGet } from "../api";
import { AlertBanner, DataBadge, ErrorState, KpiCard, Loader } from "../ui";

export function SafetyCompliancePanel({ site = "Balaghat" }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showStandards, setShowStandards] = useState(false);
  const [acknowledgedActions, setAcknowledgedActions] = useState(new Set());

  const fetchCompliance = () => {
    setLoading(true);
    setError(null);
    apiGet(`/api/safety-compliance?site=${encodeURIComponent(site)}`)
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
    fetchCompliance();
  }, [site]);

  const toggleActionAcknowledge = (id) => {
    setAcknowledgedActions((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleExportJSON = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `MOIL_Safety_Compliance_${data.mine_site || "Mine"}_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) return <Loader message="Auditing DGMS safety & ESZ compliance standards…" />;
  if (error) return <ErrorState message={error} hint="Check Flask endpoint /api/safety-compliance" />;
  if (!data) return null;

  const checks = data.checks || [];
  const summary = data.summary || {};
  const overallStatus = data.overall_status || "Compliant";

  const categories = ["All", ...new Set(checks.map((c) => c.category))];

  const filteredChecks = checks.filter((c) => {
    if (filter !== "All" && c.status !== filter) return false;
    if (categoryFilter !== "All" && c.category !== categoryFilter) return false;
    return true;
  });

  return (
    <div className="safety-compliance-panel">
      {/* 1. Header Overview & Scorecard */}
      <div className="compliance-overview-header">
        <div className="compliance-title-group">
          <div className="compliance-site-badge">
            <span className="compliance-site-pin">📍</span>
            <strong>{data.mine_site || site} Sector</strong>
            <span className="compliance-eval-time">
              Audited: {data.evaluated_at ? new Date(data.evaluated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Live"}
            </span>
          </div>
          <h4>DGMS Safety & Environmental Protection Clearance</h4>
          <p className="compliance-subtitle">
            Continuous operational safety clearance evaluated against reference benchmarks and wildlife buffer norms.
          </p>
        </div>

        <div className="compliance-header-actions">
          <div className={`compliance-status-banner status-${overallStatus.toLowerCase().replace(/\s+/g, "-")}`}>
            <span className="status-indicator-dot" />
            <div className="status-banner-text">
              <span className="status-banner-caption">Overall Audit Status</span>
              <strong className="status-banner-val">{overallStatus}</strong>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm compliance-export-btn"
            onClick={handleExportJSON}
            title="Download structured compliance audit record"
          >
            📥 Export Report
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm compliance-refresh-btn"
            onClick={fetchCompliance}
            title="Refresh clearance calculations"
          >
            ↻ Re-evaluate
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Cards */}
      <div className="kpi-grid compliance-kpi-grid">
        <KpiCard
          value={`${summary.compliance_score_pct || 0}%`}
          label="Compliance Index"
          hint="Calculated score based on evaluated norms"
          tone={
            summary.compliance_score_pct >= 90
              ? "tone-good"
              : summary.compliance_score_pct >= 70
              ? "tone-warn"
              : "tone-bad"
          }
        />
        <KpiCard
          value={summary.compliant || 0}
          label="Fully Compliant"
          hint="Within reference thresholds"
          tone="tone-good"
        />
        <KpiCard
          value={summary.needs_attention || 0}
          label="Needs Attention"
          hint="Advisory threshold crossed"
          tone="tone-warn"
        />
        <KpiCard
          value={summary.non_compliant || 0}
          label="Non-compliant"
          hint="Action required immediately"
          tone={summary.non_compliant > 0 ? "tone-bad" : undefined}
        />
      </div>

      {/* 3. Mandatory Reference Disclaimer Banner */}
      <div className="compliance-disclaimer-wrapper">
        <AlertBanner
          severity="medium"
          title="Reference Demonstration Thresholds Notice"
        >
          <p className="compliance-disclaimer-body">
            {data.disclaimer}
          </p>
          <div className="compliance-disclaimer-meta">
            <DataBadge kind="illustrative" label="Reference Norms" />
            <span className="disclaimer-note-sub">
              DGMS Technical Circulars 1982/1997/2020 & MoEFCC Wildlife Corridor Guidelines cited for reference benchmarking.
            </span>
          </div>
        </AlertBanner>
      </div>

      {/* 4. Filter Bar */}
      <div className="compliance-filter-bar">
        <div className="compliance-status-tabs" role="tablist" aria-label="Filter compliance checks by status">
          {[
            { id: "All", label: `All Checks (${checks.length})` },
            { id: "Compliant", label: `Compliant (${summary.compliant || 0})` },
            { id: "Needs Attention", label: `Needs Attention (${summary.needs_attention || 0})` },
            { id: "Non-compliant", label: `Non-compliant (${summary.non_compliant || 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={filter === tab.id}
              className={`compliance-tab ${filter === tab.id ? "active" : ""}`}
              onClick={() => setFilter(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="compliance-category-select-wrap">
          <label htmlFor="comp-cat-select" className="compliance-filter-label">
            Category:
          </label>
          <select
            id="comp-cat-select"
            className="compliance-select"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 5. Compliance Cards Grid */}
      <div className="compliance-cards-grid">
        {filteredChecks.length === 0 ? (
          <div className="compliance-empty-state">
            <p>No safety checks match the selected filter criteria.</p>
          </div>
        ) : (
          filteredChecks.map((check) => {
            const isAcknowledged = acknowledgedActions.has(check.id);
            const statusClass = check.status.toLowerCase().replace(/\s+/g, "-");

            return (
              <div
                key={check.id}
                className={`compliance-card border-${statusClass} ${isAcknowledged ? "card-action-logged" : ""}`}
              >
                <div className="compliance-card-header">
                  <div className="compliance-card-tag-group">
                    <span className="compliance-card-id">{check.id}</span>
                    <span className="compliance-card-category">{check.category}</span>
                  </div>
                  <span className={`compliance-status-pill status-pill-${statusClass}`}>
                    {check.status === "Compliant" && "✓ "}
                    {check.status === "Needs Attention" && "⚠ "}
                    {check.status === "Non-compliant" && "✖ "}
                    {check.status}
                  </span>
                </div>

                <h5 className="compliance-check-name">{check.name}</h5>

                {/* Metrics Comparison Box */}
                <div className="compliance-metrics-compare">
                  <div className="metric-compare-col observed-box">
                    <span className="metric-compare-label">Observed Field Value</span>
                    <strong className="metric-compare-val">{check.observed_value}</strong>
                  </div>
                  <div className="metric-compare-divider">vs</div>
                  <div className="metric-compare-col threshold-box">
                    <span className="metric-compare-label">Reference Benchmark</span>
                    <strong className="metric-compare-val threshold-val">
                      {check.reference_threshold}
                    </strong>
                  </div>
                </div>

                {/* Regulatory Citation */}
                <div className="compliance-norm-citation">
                  <span className="citation-icon">📜</span>
                  <span className="citation-text">{check.benchmark_norm}</span>
                </div>

                {/* Observation Details */}
                <p className="compliance-details-text">{check.details}</p>

                {/* Recommended Action & Acknowledgment */}
                <div className="compliance-action-box">
                  <div className="action-box-head">
                    <strong className="action-box-title">
                      {check.status === "Compliant" ? "Maintenance Action" : "Corrective Action Required"}
                    </strong>
                    {isAcknowledged && (
                      <span className="action-logged-tag">✓ Action Logged</span>
                    )}
                  </div>
                  <p className="action-box-desc">{check.recommended_action}</p>

                  <div className="action-box-footer">
                    <button
                      type="button"
                      className={`btn btn-xs ${isAcknowledged ? "btn-outline" : "btn-primary"} action-ack-btn`}
                      onClick={() => toggleActionAcknowledge(check.id)}
                    >
                      {isAcknowledged ? "Mark as Pending Review" : "Acknowledge / Log Action"}
                    </button>
                    <span className="action-ref-tag">
                      Ref Standard
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 6. Collapsible Reference Standards Table */}
      <div className="compliance-standards-collapsible">
        <button
          type="button"
          className="compliance-standards-toggle"
          onClick={() => setShowStandards((prev) => !prev)}
          aria-expanded={showStandards}
        >
          <span>📋 View Reference DGMS & Environmental Clearance Benchmarks Guide</span>
          <span className="standards-toggle-arrow">{showStandards ? "▲ Hide" : "▼ Show"}</span>
        </button>

        {showStandards && (
          <div className="compliance-standards-content">
            <p className="standards-intro">
              The following reference thresholds are compiled from statutory DGMS circulars, Metalliferous Mines Regulations (MMR 1961), and MoEFCC Eco-Sensitive Zone guidelines to provide automated operational decision-support.
            </p>
            <div className="table-card standards-table-card">
              <table className="risk-table compliance-table">
                <thead>
                  <tr>
                    <th>Check Parameter</th>
                    <th>Standard / Circular Reference</th>
                    <th>Compliant Threshold (Reference)</th>
                    <th>Warning Threshold</th>
                    <th>Operational Frequency</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <strong>Blasting Danger Zone Clearance</strong>
                    </td>
                    <td>DGMS Circular No. 6 of 1982 / MMR 1961 Reg. 164</td>
                    <td><span className="text-good">≥ 500 m radial</span></td>
                    <td>300 m – 500 m</td>
                    <td>Per blast initiation</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Pit Highwall Factor of Safety (FoS)</strong>
                    </td>
                    <td>DGMS Technical Circular No. 2 of 2020</td>
                    <td><span className="text-good">≥ 1.30 FoS static</span></td>
                    <td>1.15 – 1.30 FoS</td>
                    <td>Continuous slope radar / Weekly prisms</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Eco-Sensitive-Zone Buffer Distance</strong>
                    </td>
                    <td>MoEFCC / NBWL Notified ESZ Wildlife Corridor Norms</td>
                    <td><span className="text-good">≥ 2.0 km corridor buffer</span></td>
                    <td>1.0 km – 2.0 km</td>
                    <td>Monthly GIS audit</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Ground Vibration PPV Limit</strong>
                    </td>
                    <td>DGMS (Tech) Circular No. 7 of 1997</td>
                    <td><span className="text-good">≤ 10.0 mm/s PPV</span></td>
                    <td>10.0 – 15.0 mm/s</td>
                    <td>Seismograph on every blast</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Pit Bench Sump Water Retention</strong>
                    </td>
                    <td>Mine Drainage & Monsoon Dewatering Protocol</td>
                    <td><span className="text-good">≤ 65% capacity</span></td>
                    <td>65% – 85% capacity</td>
                    <td>Daily during monsoon</td>
                  </tr>
                  <tr>
                    <td>
                      <strong>Haul Road Berm & Gradient</strong>
                    </td>
                    <td>DGMS Safety Berm Standard / MMR Reg. 176</td>
                    <td><span className="text-good">Max 1:16 grade / Berm ≥ tyre radius</span></td>
                    <td>1:14 to 1:16 grade</td>
                    <td>Bi-weekly survey inspection</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="standards-footnote">
              * Note: All statutory figures are reference benchmarks for demonstration purposes in the MOIL Smart Mining Hub.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
