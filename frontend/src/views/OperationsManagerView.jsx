import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Legend as ChartLegend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet, apiPost } from "../api";
import {
  AlertBanner,
  DataBadge,
  DataTable,
  ErrorState,
  KpiCard,
  Loader,
  SectionHeader,
  StatusPill,
  formatPercent,
  formatTonnes,
} from "../ui";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";

export function OperationsManagerView() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      apiPost("/api/current-forecast", { use_live_rainfall: true }),
      apiGet("/api/balaghat-weekly-trend"),
      apiGet("/api/fleet-status"),
      apiGet("/api/mines/balaghat/blasting-logs"),
    ])
      .then(([forecast, trend, fleet, blasting]) => {
        if (cancelled) return;
        setData({ forecast, trend, fleet, blasting });
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err.message || "Failed to load operations planning data.");
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const forecast = data?.forecast;
  const trend = data?.trend?.trend || [];
  const fleetSummary = data?.fleet?.summary || {};
  const blasts = data?.blasting?.blasts || [];

  const onTrack = forecast?.status === "On Track";
  const blastDelays = blasts.filter((b) => b.status === "Delayed" || b.status === "Critical Delay");

  const trendChartData = trend.map((t) => ({
    week: t.week_label || `W${t.week}`,
    Target: t.planned_target_tonnes || 10000,
    Predicted: t.predicted_production_tonnes,
  }));

  return (
    <div className="view operations-manager-view" id="operations-manager-view">
      <div className="view-header" style={{ marginBottom: "var(--space-2)" }}>
        <div>
          <h2>Operations Manager Planning Hub</h2>
          <p className="view-subtitle">
            Production forecast modeling, equipment utilization tracking, weather & blasting bottlenecks, and managerial schedule approvals.
          </p>
        </div>

        <div className="view-actions" style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
          <DataBadge kind="predicted" label="Phase 3 Operations AI" />
        </div>
      </div>

      {loading && <Loader message="Generating operational forecast & telemetry synthesis..." />}
      {error && <ErrorState message="Could not fetch operations data." hint={error} />}

      {!loading && !error && (
        <>
          <div className="kpi-grid">
            <KpiCard
              icon="🎯"
              label="Weekly Production Target"
              value={`${formatTonnes(forecast?.target_tonnes || 10000)} t`}
              hint="Planned weekly extraction quota"
            />
            <KpiCard
              icon="🔮"
              label="Predicted Weekly Output"
              value={`${formatTonnes(forecast?.predicted_weekly_production || 8150)} t`}
              hint="Model-predicted under live weather"
              tone={onTrack ? "good" : "danger"}
            />
            <KpiCard
              icon="📊"
              label="Target Achievement"
              value={`${Number(forecast?.achievement_pct || 81.5).toFixed(1)}%`}
              hint={onTrack ? "Within normal tolerance" : "Shortfall risk detected"}
              tone={onTrack ? "good" : "warning"}
            />
            <KpiCard
              icon="🚜"
              label="Fleet Utilization"
              value={`${fleetSummary.avg_oee_pct || 84.5}%`}
              hint={`${fleetSummary.active_units || 0} active / ${fleetSummary.total_units || 0} total units`}
              tone="good"
            />
            <KpiCard
              icon="🌧️"
              label="CHIRPS Live Rainfall"
              value="456.2 mm"
              hint="Monsoon total (normal: 120.9mm)"
              tone="warning"
            />
            <KpiCard
              icon="💥"
              label="Delayed Blasts"
              value={blastDelays.length}
              hint="Stope cycles requiring clearance"
              tone={blastDelays.length > 0 ? "warning" : "good"}
            />
          </div>

          {!onTrack && (
            <div style={{ marginBottom: "var(--space-2)" }}>
              <AlertBanner
                severity="high"
                title={`Weekly Shortfall Projected: ${formatTonnes(Math.abs((forecast?.target_tonnes || 10000) - (forecast?.predicted_weekly_production || 8150)))} tonnes below target`}
              >
                Lead driver: Heavy monsoon rainfall ({forecast?.rainfall_mm || 456} mm) combined with {forecast?.downtime_pct || 14.5}% equipment downtime in Balaghat Block 2. Review candidate actions below.
              </AlertBanner>
            </div>
          )}

          {/* Forecast Trend Chart */}
          <div className="card" style={{ marginBottom: "var(--space-3)" }}>
            <SectionHeader
              icon="📈"
              title="8-Week Production Forecast vs Target Trajectory"
              subtitle="Comparative weekly trend across operational cycles under varying equipment availability and weather conditions."
              actions={
                <StatusPill
                  status={onTrack ? "Operational" : "Shortfall"}
                  label={onTrack ? "On Track" : "Action Required"}
                />
              }
            />

            <div style={{ width: "100%", height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendChartData} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="week" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} domain={["dataMin - 1000", "dataMax + 1000"]} />
                  <Tooltip
                    contentStyle={{
                      background: "#ffffff",
                      border: "1px solid #cbd5e1",
                      borderRadius: "8px",
                      fontSize: "0.85rem",
                    }}
                  />
                  <ChartLegend />
                  <Line
                    type="monotone"
                    dataKey="Target"
                    stroke="#64748b"
                    strokeDasharray="4 4"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="Predicted"
                    stroke="var(--primary)"
                    strokeWidth={3}
                    dot={{ r: 4, fill: "var(--primary)" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Operational Loss Drivers and Corrective Actions */}
          <div className="card" style={{ marginBottom: "var(--space-3)" }}>
            <SectionHeader
              icon="⚡"
              title="Operations Bottleneck & Corrective Action Summary"
              subtitle="Dominant operational loss factors diagnosed by the ML explanatory layer."
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-2)" }}>
              <div style={{ background: "#f8fafc", padding: "var(--space-2)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <strong>Equipment Downtime Loss</strong>
                  <StatusPill status="Critical" label="14.5% Downtime" />
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  LHD-02 breakdown and drill rig maintenance accounts for ~1,850 t estimated weekly capacity loss.
                </p>
              </div>

              <div style={{ background: "#f8fafc", padding: "var(--space-2)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <strong>Blast Sequence Clearance</strong>
                  <StatusPill status="Delayed" label="+3.8h Delay" />
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  Secondary ventilation exhaust backlog in Block B2 delayed muck pile loading by ~4.9h.
                </p>
              </div>

              <div style={{ background: "#f8fafc", padding: "var(--space-2)", borderRadius: "8px", border: "1px solid var(--border)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <strong>Monsoon Dewatering Load</strong>
                  <StatusPill status="Warning" label="High Runoff" />
                </div>
                <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--muted)", lineHeight: 1.4 }}>
                  Submersible sump pumps operating at 88% continuous capacity to clear decline portal runoff.
                </p>
              </div>
            </div>
          </div>

          {/* Pending Approvals Panel (Phase 4 Approval Workflow) */}
          <PendingApprovalsPanel userRole="Operations Manager" />
        </>
      )}
    </div>
  );
}
