import { useCallback, useEffect, useMemo, useState } from "react";
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
  { value: "balaghat", label: "Balaghat Mine (Deep Underground)", defaultTarget: 16 },
  { value: "ukwa", label: "Ukwa Mine (Underground Stopes)", defaultTarget: 12 },
];

export function BlastingSupervisorView() {
  const [selectedMine, setSelectedMine] = useState("balaghat");
  const [blasts, setBlasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedBlast, setSelectedBlast] = useState(null);

  const fetchBlasts = useCallback(async (mineId) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet(`/api/mines/${mineId}/blasting-logs`);
      setBlasts(res?.blasts || []);
      setSelectedBlast(null);
    } catch (err) {
      setError(err.message || "Failed to load blasting log records.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBlasts(selectedMine);
  }, [selectedMine, fetchBlasts]);

  const filteredBlasts = useMemo(() => {
    if (statusFilter === "ALL") return blasts;
    return blasts.filter(
      (b) => String(b.status || "").toLowerCase() === statusFilter.toLowerCase()
    );
  }, [blasts, statusFilter]);

  const kpis = useMemo(() => {
    if (!blasts.length) {
      return { total: 0, onSchedule: 0, delayed: 0, critical: 0, avgDelay: 0, avgReentry: 0 };
    }
    const onSchedule = blasts.filter((b) => b.status === "On Schedule").length;
    const delayed = blasts.filter((b) => b.status === "Delayed").length;
    const critical = blasts.filter((b) => b.status === "Critical Delay").length;
    const totalDelays = blasts.map((b) => Number(b.total_cycle_delay_hrs || b.total_delay_hours || 0));
    const avgDelay = (totalDelays.reduce((a, b) => a + b, 0) / blasts.length).toFixed(1);
    const reentryDelays = blasts.map((b) => Number(b.reentry_delay_hrs || b.reentry_delay_hours || 1.0));
    const avgReentry = (reentryDelays.reduce((a, b) => a + b, 0) / blasts.length).toFixed(1);

    return {
      total: blasts.length,
      onSchedule,
      delayed,
      critical,
      avgDelay,
      avgReentry,
    };
  }, [blasts]);

  const columns = [
    {
      key: "blast_id",
      header: "Blast ID",
      render: (val, row) => (
        <button
          type="button"
          onClick={() => setSelectedBlast(row)}
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
          {val}
        </button>
      ),
    },
    { key: "zone_id", header: "Stope Zone" },
    {
      key: "scheduled_time",
      header: "Scheduled Window",
      render: (val) => (val ? new Date(val).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"),
    },
    {
      key: "actual_time",
      header: "Actual Detonation",
      render: (val) => (val ? new Date(val).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "—"),
    },
    {
      key: "drill_delay_hrs",
      header: "Drill Delay",
      numeric: true,
      render: (val, row) => `${Number(val ?? row.drill_delay_hours ?? 0).toFixed(1)}h`,
    },
    {
      key: "charge_delay_hrs",
      header: "Charge Delay",
      numeric: true,
      render: (val, row) => `${Number(val ?? row.charge_delay_hours ?? 0).toFixed(1)}h`,
    },
    {
      key: "clearance_delay_hrs",
      header: "Clearance",
      numeric: true,
      render: (val, row) => `${Number(val ?? row.clearance_delay_hours ?? 0).toFixed(1)}h`,
    },
    {
      key: "total_cycle_delay_hrs",
      header: "Total Delay",
      numeric: true,
      render: (val, row) => {
        const d = Number(val ?? row.total_delay_hours ?? 0);
        return (
          <strong style={{ color: d >= 4.0 ? "#dc2626" : d >= 2.5 ? "#d97706" : "inherit" }}>
            +{d.toFixed(1)}h
          </strong>
        );
      },
    },
    {
      key: "stemming_quality",
      header: "Stemming",
      render: (val) => {
        const quality = val || "Optimal";
        const tone = quality === "Optimal" ? "good" : quality === "Acceptable" ? "info" : "warning";
        return <StatusPill status={quality} tone={tone} />;
      },
    },
    {
      key: "status",
      header: "Status",
      render: (val) => <StatusPill status={val || "On Schedule"} />,
    },
  ];

  return (
    <div className="view blasting-view" id="blasting-view">
      <div className="view-header" style={{ marginBottom: "var(--space-2)" }}>
        <div>
          <h2>Blasting & Stope Detonation Hub</h2>
          <p className="view-subtitle">
            Shift blast scheduling, stage delay tracking, secondary ventilation re-entry timing, and DGMS vibration compliance.
          </p>
        </div>

        <div className="view-actions" style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
          <label style={{ fontSize: "0.85rem", fontWeight: 600, color: "var(--muted)" }}>Active Mine:</label>
          <select
            className="input-field"
            value={selectedMine}
            onChange={(e) => setSelectedMine(e.target.value)}
            style={{ padding: "6px 12px", fontSize: "0.88rem", fontWeight: 600 }}
          >
            {MINE_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <DataBadge kind="synthetic" label="Simulated Blast Cycle Logs" />
        </div>
      </div>

      {kpis.critical > 0 && (
        <div style={{ marginBottom: "var(--space-2)" }}>
          <AlertBanner severity="high" title={`${kpis.critical} Critical Detonation Delays Flagged`}>
            Blasting delays exceeding 4.0 hours require ventilation re-entry acceleration and pre-shift stope clearance to prevent shift extraction bottlenecks.
          </AlertBanner>
        </div>
      )}

      <div className="kpi-grid">
        <KpiCard
          icon="💥"
          label="Total Logged Blasts"
          value={kpis.total}
          hint={`Scheduled cycles in ${selectedMine === "balaghat" ? "Balaghat" : "Ukwa"}`}
        />
        <KpiCard
          icon="✓"
          label="On Schedule"
          value={kpis.onSchedule}
          hint={`${Math.round((kpis.onSchedule / (kpis.total || 1)) * 100)}% cycle compliance`}
          tone="good"
        />
        <KpiCard
          icon="⏳"
          label="Delayed Cycles"
          value={kpis.delayed}
          hint="Drill/charge delay > 2.0h"
          tone={kpis.delayed > 0 ? "warning" : "good"}
        />
        <KpiCard
          icon="⚠️"
          label="Critical Delays"
          value={kpis.critical}
          hint="Detonation delay > 4.0h"
          tone={kpis.critical > 0 ? "danger" : "good"}
        />
        <KpiCard
          icon="⏱️"
          label="Avg Cycle Delay"
          value={`+${kpis.avgDelay}h`}
          hint="Mean departure from scheduled firing"
        />
        <KpiCard
          icon="🌬️"
          label="Avg Re-entry Time"
          value={`${kpis.avgReentry}h`}
          hint="Fume purge & clearance window"
        />
      </div>

      {loading && <Loader message="Fetching blasting sequence logs..." />}
      {error && <ErrorState message="Could not fetch blasting data." hint={error} />}

      {!loading && !error && (
        <>
          <div className="card">
            <SectionHeader
              icon="📋"
              title="Planned vs Actual Blast Stage Records"
              subtitle="Full stage-by-stage delay breakdown (Drilling, Charging, Stemming, Clearance, Re-entry). Right-aligned numerical durations in hours."
              actions={
                <div style={{ display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
                  <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>Filter:</span>
                  <select
                    className="input-field"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: "4px 8px", fontSize: "0.82rem" }}
                  >
                    <option value="ALL">All Statuses ({blasts.length})</option>
                    <option value="On Schedule">On Schedule ({kpis.onSchedule})</option>
                    <option value="Delayed">Delayed ({kpis.delayed})</option>
                    <option value="Critical Delay">Critical Delay ({kpis.critical})</option>
                  </select>
                </div>
              }
            />

            <DataTable
              columns={columns}
              rows={filteredBlasts}
              keyField="blast_id"
              emptyMessage="No blast records match the filter."
            />

            {selectedBlast && (
              <div
                style={{
                  marginTop: "var(--space-2)",
                  padding: "var(--space-2)",
                  background: "#f8fafc",
                  borderLeft: "4px solid var(--primary)",
                  borderRadius: "0 8px 8px 0",
                  fontSize: "0.85rem",
                  lineHeight: 1.5,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <strong>Blast Sequence Details: {selectedBlast.blast_id} ({selectedBlast.zone_id})</strong>
                  <StatusPill status={selectedBlast.status || "On Schedule"} />
                </div>
                <p style={{ margin: "4px 0 0 0", color: "var(--text)" }}>
                  Scheduled: {selectedBlast.scheduled_time || "10:00"} • Actual Detonation: {selectedBlast.actual_time || "13:30"} • Stemming: {selectedBlast.stemming_quality || "Acceptable"}.
                  Peak particle velocity (PPV) within statutory limit (&lt;10 mm/s DGMS norm).
                </p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
