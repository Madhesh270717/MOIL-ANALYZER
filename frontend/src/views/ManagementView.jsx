import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend as ChartLegend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiPost } from "../api";
import { SafetyCompliancePanel } from "./SafetyCompliancePanel";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";
import {
  AlertBanner,
  DataBadge,
  ErrorState,
  KpiCard,
  Loader,
  NoteCard,
  RISK_COLORS,
  Section,
  formatTonnes,
  formatTonnesShort,
} from "../ui";

const HIGH_RISK_ROWS_SHOWN = 8;

function sumReserves(sites) {
  return (sites || []).reduce(
    (sum, site) => sum + Number(site.Estimated_Reserves_tonnes || 0),
    0
  );
}

function countActions(records) {
  const counts = new Map();
  records
    .filter((row) => row.risk_level === "High")
    .forEach((row) => {
      const action = row.recommended_action || "Unspecified";
      counts.set(action, (counts.get(action) || 0) + 1);
    });
  return [...counts.entries()]
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count);
}

function ActiveAlerts({ current, riskSummary }) {
  const alerts = [];

  if (current?.status === "Shortfall Expected") {
    alerts.push({
      key: "weekly",
      severity: "high",
      title: "Balaghat weekly target at risk",
      text: `Predicted production is ${current.shortage_pct.toFixed(1)}% below the ${formatTonnes(
        current.target_tonnes
      )} t weekly target under normal operating assumptions.`,
    });
  }

  if (riskSummary?.High > 0) {
    alerts.push({
      key: "regional",
      severity: riskSummary.high_share_pct > 20 ? "high" : "medium",
      title: `${riskSummary.High} of ${riskSummary.total} monitored site-months at high shortfall risk`,
      text: `Regional rainfall/downtime assessment across MOIL sites plus the live Balaghat month (${riskSummary.high_share_pct}% of monitored units).`,
    });
  }

  if (alerts.length === 0) {
    return (
      <div className="alert-calm">
        <strong>No active shortfall alerts.</strong> The weekly forecast is on
        track and no monitored site-month is flagged high risk under current
        conditions.
      </div>
    );
  }

  return (
    <div className="alert-stack">
      {alerts.map((alert) => (
        <AlertBanner
          key={alert.key}
          severity={alert.severity}
          title={alert.title}
          dismissible
        >
          {alert.text}
        </AlertBanner>
      ))}
    </div>
  );
}

function RiskDistribution({ riskSummary }) {
  const data = [
    { level: "High", count: riskSummary.High, fill: RISK_COLORS.High },
    { level: "Medium", count: riskSummary.Medium, fill: RISK_COLORS.Medium },
    { level: "Low", count: riskSummary.Low, fill: RISK_COLORS.Low },
  ];

  return (
    <>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 8, right: 16, left: 8, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="level" tick={{ fontSize: 12 }} />
          <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
          <Tooltip
            formatter={(value) => [`${value} site-months`, "Count"]}
          />
          <Bar dataKey="count" name="Site-months" barSize={64}>
            {data.map((entry) => (
              <Cell key={entry.level} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
      <p className="trend-caption">
        {riskSummary.total} monitored site-months · thresholds: high &gt;
        {riskSummary.risk_thresholds_pct?.high}% rainfall/downtime percentile,
        medium &gt;{riskSummary.risk_thresholds_pct?.medium}%
      </p>
    </>
  );
}

function HighRiskTable({ records, total }) {
  const rows = records
    .filter((row) => row.risk_level === "High")
    .sort((a, b) => Number(b.downtime_pct) - Number(a.downtime_pct))
    .slice(0, HIGH_RISK_ROWS_SHOWN);

  if (rows.length === 0) {
    return <p className="muted">No high-risk site-months in the dataset.</p>;
  }

  return (
    <>
      <div className="table-card">
        <table className="risk-table">
          <thead>
            <tr>
              <th>Site / month</th>
              <th>Rainfall (mm)</th>
              <th>Downtime (%)</th>
              <th>Recommended action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date_or_site}>
                <td>{row.date_or_site}</td>
                <td>{Number(row.rainfall_mm).toFixed(1)}</td>
                <td>{Number(row.downtime_pct).toFixed(1)}</td>
                <td>{row.recommended_action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="trend-caption">
        Showing the {rows.length} highest-downtime entries of {total} high-risk
        site-months.
      </p>
    </>
  );
}

export function ManagementView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // Defaults to the Balaghat forecast: the project-specific view, rather than the
  // regional reference dataset.
  const [trendTab, setTrendTab] = useState("balaghat");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiPost("/api/current-forecast", { use_live_rainfall: true }),
      apiGet("/api/regional-trends"),
      apiGet("/api/balaghat-weekly-trend"),
      apiGet("/api/production-risk"),
      apiGet("/api/production-risk/summary"),
    ])
      .then(
        ([
          current,
          regional,
          weekly,
          riskRecords,
          riskSummary,
        ]) => {
          if (cancelled) return;
          setData({
            current,
            regional,
            weekly,
            riskRecords,
            riskSummary,
          });
          setLoading(false);
        }
      )
      .catch((err) => {
        if (cancelled) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return <Loader message="Loading decision summary…" />;
  if (error)
    return (
      <ErrorState message="Failed to load the management summary." hint={error} />
    );

  const { current, regional, weekly, riskRecords, riskSummary } =
    data;
  const onTrack = current.status === "On Track";

  return (
    <div className="view">
      <h2>Management Overview</h2>
      <p className="view-intro">
        Reserve position, production outlook, target achievement and shortfall
        risk at a glance.
      </p>

      <div className="kpi-grid">
        <KpiCard
          icon="💎"
          value="21.4 MT"
          label="Total Two-Mine Reserves"
          hint="Balaghat (~12.8 MT) + Ukwa (~8.6 MT reference)"
          tone="good"
        />
        <KpiCard
          icon="🔮"
          value={`${formatTonnes(current.predicted_weekly_production)} t`}
          label="Predicted Weekly Output"
          hint="Balaghat, live operational parameters"
          tone={onTrack ? "good" : "warning"}
        />
        <KpiCard
          icon="🎯"
          value={`${formatTonnes(current.target_tonnes)} t`}
          label="Planned Weekly Target"
          hint="Baseline production goal"
        />
        <KpiCard
          icon="📊"
          tone={onTrack ? "good" : "warning"}
          value={`${current.achievement_pct.toFixed(1)}%`}
          label="Target Achievement"
          hint={onTrack ? "On track" : "Below target"}
        />
        <KpiCard
          icon="⚠️"
          tone={riskSummary.High > 0 ? "danger" : "good"}
          value={riskSummary.High}
          label="High-Risk Site-Months"
          hint={`of ${riskSummary.total} monitored · ${riskSummary.high_share_pct}%`}
        />
        <KpiCard
          icon="⚡"
          tone={onTrack ? "good" : "danger"}
          value={onTrack ? "On Track" : "Shortfall"}
          label="Operational Risk"
          hint={onTrack ? "Zero critical gaps" : "Mitigation required"}
        />
      </div>

      {/* Two-Mine Strategic Reserve Potential Card */}
      <div className="card" style={{ marginBottom: "var(--space-3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "var(--space-2)" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Two-Mine Strategic Reserve & Operational Benchmark</h3>
            <p style={{ margin: "4px 0 0", fontSize: "0.85rem", color: "var(--muted)" }}>
              Comparative overview of MOIL's two primary underground manganese assets in Balaghat district, MP.
            </p>
          </div>
          <DataBadge kind="real" label="Real MOIL Underground Assets" />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "var(--space-2)" }}>
          <div style={{ background: "#f8fafc", padding: "var(--space-2)", borderRadius: "10px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "1rem", color: "var(--primary)" }}>Balaghat (Bharveli) Mine</strong>
              <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>Active • Deep Underground</span>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>
              21.83°N, 80.23°E • Deepest manganese mine in Asia • Sausar Group host rock • ~12.8 MT estimated reserve potential • High-grade ore (34–42% Mn).
            </p>
          </div>

          <div style={{ background: "#f8fafc", padding: "var(--space-2)", borderRadius: "10px", border: "1px solid var(--border)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <strong style={{ fontSize: "1rem", color: "var(--primary)" }}>Ukwa Mine</strong>
              <span style={{ background: "#dcfce7", color: "#166534", padding: "2px 8px", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>Active • Underground</span>
            </div>
            <p style={{ margin: "6px 0 0", fontSize: "0.83rem", color: "var(--muted)" }}>
              21.97°N, 80.47°E • 5 km continuous strike length • Sitasaongi & Mansar formations • ~8.6 MT public historical reference reserve • Consistent metallurgical ore (38% Mn).
            </p>
          </div>
        </div>
      </div>

      <Section
        step="ALERTS"
        title="Active Shortfall Alerts"
        subtitle="Reused from the same weekly forecast and regional risk calculations as the planning views."
      >
        <ActiveAlerts current={current} riskSummary={riskSummary} />
      </Section>

      <PendingApprovalsPanel userRole="Management" />

      <Section
        step="TREND"
        title="Production Trends"
        subtitle="Two separate data sources, shown one at a time: a regional reference dataset for context, and the Balaghat weekly forecast."
      >
        <div className="view-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={trendTab === "regional"}
            className={`tab ${trendTab === "regional" ? "active" : ""}`}
            onClick={() => setTrendTab("regional")}
          >
            Regional Overview (Reference Data)
          </button>
          <button
            role="tab"
            aria-selected={trendTab === "balaghat"}
            className={`tab ${trendTab === "balaghat" ? "active" : ""}`}
            onClick={() => setTrendTab("balaghat")}
          >
            Balaghat Forecast
          </button>
        </div>

        {trendTab === "regional" ? (
          <div className="trend-card">
            <div className="trend-head">
              <h4>Regional Production vs Estimated Remaining Reserve</h4>
              <div className="trend-badges">
                <DataBadge kind="synthetic" />
                <DataBadge kind="estimated" label="Reserves — dataset estimate" />
              </div>
            </div>
            <p className="trend-subtitle">
              Synthetic reference dataset across MOIL sites — for context only,
              not live Balaghat data.
            </p>
            <ResponsiveContainer width="100%" height={620}>
              <BarChart
                data={regional.sites}
                layout="vertical"
                margin={{ top: 20, right: 24, left: 8, bottom: 24 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  xAxisId="reserves"
                  tickFormatter={formatTonnesShort}
                  tick={{ fontSize: 12 }}
                  label={{
                    value: "Estimated remaining reserve (t)",
                    position: "insideBottom",
                    offset: -12,
                    fontSize: 12,
                  }}
                />
                <XAxis
                  type="number"
                  xAxisId="production"
                  orientation="top"
                  tickFormatter={formatTonnesShort}
                  tick={{ fontSize: 12 }}
                  label={{
                    value: "Production (t)",
                    position: "insideTop",
                    offset: -12,
                    fontSize: 12,
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="Site_ID"
                  width={72}
                  tick={{ fontSize: 12 }}
                  label={{
                    value: "Reference site",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [`${formatTonnes(value)} t`, name]}
                  labelFormatter={(siteId, payload) =>
                    payload?.[0]
                      ? `Site ${siteId} · ${payload[0].payload.Region}`
                      : `Site ${siteId}`
                  }
                />
                <ChartLegend />
                <Bar
                  xAxisId="reserves"
                  dataKey="Estimated_Reserves_tonnes"
                  name="Estimated remaining reserve"
                  fill="#1a5276"
                  barSize={7}
                />
                <Bar
                  xAxisId="production"
                  dataKey="Historical_Production_tonnes"
                  name="Production (reference dataset)"
                  fill="#fd7e14"
                  barSize={7}
                />
              </BarChart>
            </ResponsiveContainer>
            <p className="trend-caption">{regional.note}</p>
          </div>
        ) : (
          <div className="trend-card">
            <div className="trend-head">
              <h4>{weekly.title}</h4>
              <DataBadge kind="illustrative" />
            </div>
            <p className="trend-subtitle">
              8-week outlook from the forecast model run across varying operational
              conditions, against the planned weekly target — Balaghat-specific, and
              separate from the regional reference data.
            </p>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart
                data={weekly.weeks}
                margin={{ top: 8, right: 16, left: 8, bottom: 4 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week_label" tick={{ fontSize: 12 }} />
                <YAxis
                  tick={{ fontSize: 12 }}
                  tickFormatter={formatTonnesShort}
                  domain={["dataMin - 500", "dataMax + 500"]}
                  label={{
                    value: "Tonnes / week",
                    angle: -90,
                    position: "insideLeft",
                    fontSize: 12,
                  }}
                />
                <Tooltip
                  formatter={(value, name) => [`${formatTonnes(value)} t`, name]}
                />
                <ChartLegend />
                <Line
                  type="monotone"
                  dataKey="predicted_production_tonnes"
                  name="Predicted production"
                  stroke="#1a5276"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="planned_target_tonnes"
                  name="Planned target"
                  stroke="#adb5bd"
                  strokeWidth={2}
                  strokeDasharray="6 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
            <p className="trend-caption trend-caption-warn">{weekly.note}</p>
          </div>
        )}
      </Section>

      <Section
        step="RISK"
        title="Risk Distribution and High-Risk Areas"
        subtitle="Regional rainfall/downtime risk across monitored site-months."
      >
        <div className="management-split">
          <div className="trend-card">
            <h4>Risk distribution</h4>
            <p className="trend-subtitle">
              Shortfall risk tiers across monitored site-months.
            </p>
            <RiskDistribution riskSummary={riskSummary} />
          </div>

          <div className="trend-card">
            <h4>High-risk areas</h4>
            <p className="trend-subtitle">
              Highest-downtime site-months flagged high risk, with the action the
              regional assessment recommends.
            </p>
            <HighRiskTable
              records={riskRecords}
              total={riskSummary.High}
            />
          </div>
        </div>
      </Section>

      <Section
        step="ACTION"
        title="Major Causes and Recommended Actions"
        subtitle="Aggregated from the regional risk assessment's High-risk entries."
      >
        <ul className="action-list">
          {countActions(riskRecords).map(({ action, count }) => (
            <li key={action}>
              <span className="action-count">{count}</span>
              <span>{action}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section
        step="COMPLIANCE"
        title="DGMS Safety & Eco-Sensitive-Zone Compliance"
        subtitle="Operational safety checks and Eco-Sensitive-Zone buffers evaluated against reference norms."
      >
        <SafetyCompliancePanel />
      </Section>

      <Section step="ABOUT THESE NUMBERS" title="Data Types at a Glance">
        <div className="badge-legend">
          <span>
            <DataBadge kind="real" /> Live CHIRPS rainfall and satellite-derived
            features (Sentinel-2 / Sentinel-1).
          </span>
          <span>
            <DataBadge kind="synthetic" /> Regional production and reserve figures —
            a fictional/synthetic reference dataset, shown for context only.
          </span>
          <span>
            <DataBadge kind="estimated" /> Remaining reserves and prospectivity
            probabilities — model/dataset estimates, not surveyed reserves.
          </span>
          <span>
            <DataBadge kind="predicted" /> Weekly production forecast — model
            output, not measured production.
          </span>
          <span>
            <DataBadge kind="illustrative" /> 8-week weekly trend — illustrative
            scenario, not historical records.
          </span>
        </div>
        <NoteCard title="Prospectivity caveat">
          Manganese prospectivity probabilities and ore grade distributions are statistical model estimates for Balaghat and Ukwa underground mines. They do not constitute JORC-classified reserve grades.
        </NoteCard>
      </Section>
    </div>
  );
}
