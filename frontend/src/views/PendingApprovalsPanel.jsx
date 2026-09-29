import { useCallback, useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "../api";
import { AlertBanner, DataBadge, EmptyState, ErrorState, Loader } from "../ui";

const CONSTRAINT_CONFIG = {
  equipment_downtime: {
    label: "Equipment Downtime",
    icon: "🚜",
    color: "#dc2626",
    bg: "#fef2f2",
    border: "#fecaca",
  },
  blast_delay: {
    label: "Blast Delay",
    icon: "💥",
    color: "#ea580c",
    bg: "#fff7ed",
    border: "#fed7aa",
  },
  weather_restriction: {
    label: "Weather Restriction",
    icon: "🌧️",
    color: "#0284c7",
    bg: "#f0f9ff",
    border: "#bae6fd",
  },
  production_deviation: {
    label: "Production Deviation",
    icon: "📉",
    color: "#d97706",
    bg: "#fffbeb",
    border: "#fde68a",
  },
  ore_availability: {
    label: "Ore Availability",
    icon: "⛏️",
    color: "#7c3aed",
    bg: "#f5f3ff",
    border: "#ddd6fe",
  },
  safety_restriction: {
    label: "Safety & Ground Control",
    icon: "⚠️",
    color: "#b91c1c",
    bg: "#fef2f2",
    border: "#fca5a5",
  },
  exploration_priority: {
    label: "Exploration Priority",
    icon: "🧭",
    color: "#059669",
    bg: "#ecfdf5",
    border: "#a7f3d0",
  },
};

const SEVERITY_COLORS = {
  critical: { bg: "#fef2f2", text: "#991b1b", border: "#f87171" },
  high: { bg: "#fff7ed", text: "#c2410c", border: "#fb923c" },
  medium: { bg: "#f0f9ff", text: "#0369a1", border: "#7dd3fc" },
  low: { bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
};

export function PendingApprovalsPanel({ userRole = "Operations Manager" }) {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterStatus, setFilterStatus] = useState("proposed");
  const [filterType, setFilterType] = useState("all");
  const [filterMine, setFilterMine] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [decidingId, setDecidingId] = useState(null);
  const [actionNotice, setActionNotice] = useState(null);
  const [managerName, setManagerName] = useState(userRole || "Operations Manager");

  const fetchProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiGet("/api/schedule/proposals?status=all");
      const list = Array.isArray(res) ? res : res?.proposals || [];
      setProposals(list);
    } catch (err) {
      setError(err.message || "Failed to load scheduling proposals.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProposals();
  }, [fetchProposals]);

  const handleDecision = async (id, decision) => {
    setDecidingId(id);
    setActionNotice(null);
    try {
      const res = await apiPost(`/api/schedule/proposals/${id}/decision`, {
        decision,
        manager: managerName || "Operations Manager",
      });

      // Update state locally
      setProposals((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                status: decision === "accept" ? "accepted" : "rejected",
                decided_by: managerName,
                decided_at: new Date().toISOString(),
              }
            : p
        )
      );

      const isAccepted = decision === "accept";
      setActionNotice({
        type: isAccepted ? "success" : "info",
        title: isAccepted ? "Proposal Accepted & Dispatched" : "Proposal Rejected",
        message: isAccepted
          ? `Directive broadcasted to mine control dispatch for ${res?.action?.mine_id?.toUpperCase() || "mine"}.`
          : `Proposal ${id} was marked as rejected. No command was dispatched.`,
      });
    } catch (err) {
      setActionNotice({
        type: "error",
        title: "Action Failed",
        message: err.message || "Failed to submit decision.",
      });
    } finally {
      setDecidingId(null);
    }
  };

  const counts = useMemo(() => {
    return {
      proposed: proposals.filter((p) => p.status === "proposed").length,
      accepted: proposals.filter((p) => p.status === "accepted").length,
      rejected: proposals.filter((p) => p.status === "rejected").length,
      total: proposals.length,
    };
  }, [proposals]);

  const filteredProposals = useMemo(() => {
    return proposals.filter((p) => {
      if (filterStatus !== "all" && p.status !== filterStatus) return false;
      if (filterType !== "all" && p.constraint_type !== filterType) return false;
      if (filterMine !== "all" && p.mine_id?.toLowerCase() !== filterMine.toLowerCase()) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const text = `${p.id} ${p.constraint_type} ${p.mine_id} ${p.zone_id || ""} ${p.description} ${p.proposed_change}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [proposals, filterStatus, filterType, filterMine, searchQuery]);

  return (
    <section className="section pending-approvals-panel" id="pending-approvals-panel" style={{ marginTop: "1.5rem" }}>
      <div className="section-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "1.3rem" }}>📋</span>
            <h2 className="section-title" style={{ margin: 0 }}>Mine Scheduling & Pending Approvals</h2>
            <DataBadge source="3-Stage Constraint Engine (SQLite Persisted)" isLive />
          </div>
          <p className="section-desc" style={{ marginTop: "0.35rem", maxWidth: "820px" }}>
            Automated corrective action proposals generated by the constraint engine for active Balaghat and Ukwa operations. Review, accept to broadcast directives to mine dispatch, or reject.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            className="secondary-btn"
            onClick={fetchProposals}
            disabled={loading}
            style={{ padding: "0.45rem 0.85rem", fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.35rem" }}
          >
            <span>🔄</span> Refresh
          </button>
        </div>
      </div>

      {actionNotice && (
        <div style={{ margin: "1rem 0" }}>
          <AlertBanner
            severity={actionNotice.type === "success" ? "low" : actionNotice.type === "error" ? "high" : "medium"}
            title={actionNotice.title}
            dismissible
          >
            {actionNotice.message}
          </AlertBanner>
        </div>
      )}

      {/* KPI Count Pills */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.75rem", margin: "1rem 0 1.25rem 0" }}>
        <button
          type="button"
          onClick={() => setFilterStatus("proposed")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            border: `1.5px solid ${filterStatus === "proposed" ? "var(--primary)" : "var(--border)"}`,
            background: filterStatus === "proposed" ? "#e0f2fe" : "var(--card-bg)",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ color: "#d97706" }}>⚡ Pending Decision</span>
          <span style={{ background: "#fef3c7", color: "#b45309", padding: "0.1rem 0.45rem", borderRadius: "12px", fontSize: "0.8rem" }}>
            {counts.proposed}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("accepted")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            border: `1.5px solid ${filterStatus === "accepted" ? "var(--primary)" : "var(--border)"}`,
            background: filterStatus === "accepted" ? "#e0f2fe" : "var(--card-bg)",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ color: "#059669" }}>✓ Accepted Directives</span>
          <span style={{ background: "#d1fae5", color: "#065f46", padding: "0.1rem 0.45rem", borderRadius: "12px", fontSize: "0.8rem" }}>
            {counts.accepted}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("rejected")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            border: `1.5px solid ${filterStatus === "rejected" ? "var(--primary)" : "var(--border)"}`,
            background: filterStatus === "rejected" ? "#e0f2fe" : "var(--card-bg)",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span style={{ color: "#64748b" }}>✕ Rejected</span>
          <span style={{ background: "#f1f5f9", color: "#475569", padding: "0.1rem 0.45rem", borderRadius: "12px", fontSize: "0.8rem" }}>
            {counts.rejected}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setFilterStatus("all")}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "8px",
            border: `1.5px solid ${filterStatus === "all" ? "var(--primary)" : "var(--border)"}`,
            background: filterStatus === "all" ? "#e0f2fe" : "var(--card-bg)",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
          }}
        >
          <span>All Proposals</span>
          <span style={{ background: "#e2e8f0", color: "#1e293b", padding: "0.1rem 0.45rem", borderRadius: "12px", fontSize: "0.8rem" }}>
            {counts.total}
          </span>
        </button>
      </div>

      {/* Filter Toolbar */}
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "0.75rem",
          alignItems: "center",
          background: "var(--card-bg)",
          padding: "0.75rem 1rem",
          borderRadius: "8px",
          border: "1px solid var(--border)",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ flex: "1 1 200px" }}>
          <input
            type="text"
            className="input-field"
            placeholder="Search action by zone, equipment, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: "100%", padding: "0.45rem 0.75rem", fontSize: "0.88rem" }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.82rem", color: "var(--muted)", fontWeight: 500 }}>Constraint Type:</label>
          <select
            className="input-field"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{ padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
          >
            <option value="all">All Constraint Types</option>
            <option value="equipment_downtime">🚜 Equipment Downtime</option>
            <option value="blast_delay">💥 Blast Delay</option>
            <option value="weather_restriction">🌧️ Weather Restriction</option>
            <option value="production_deviation">📉 Production Deviation</option>
            <option value="ore_availability">⛏️ Ore Availability</option>
            <option value="safety_restriction">⚠️ Safety & Ground Control</option>
            <option value="exploration_priority">🧭 Exploration Priority</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
          <label style={{ fontSize: "0.82rem", color: "var(--muted)", fontWeight: 500 }}>Mine:</label>
          <select
            className="input-field"
            value={filterMine}
            onChange={(e) => setFilterMine(e.target.value)}
            style={{ padding: "0.4rem 0.6rem", fontSize: "0.85rem" }}
          >
            <option value="all">Both Mines</option>
            <option value="balaghat">Balaghat Mine</option>
            <option value="ukwa">Ukwa Mine</option>
          </select>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginLeft: "auto" }}>
          <label style={{ fontSize: "0.82rem", color: "var(--muted)", fontWeight: 500 }}>Sign As:</label>
          <input
            type="text"
            className="input-field"
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
            placeholder="Manager Name / Title"
            style={{ padding: "0.35rem 0.6rem", fontSize: "0.82rem", width: "170px" }}
          />
        </div>
      </div>

      {loading && <Loader label="Scanning constraints and loading scheduling proposals..." />}

      {error && !loading && <ErrorState message={error} onRetry={fetchProposals} />}

      {!loading && !error && filteredProposals.length === 0 && (
        <EmptyState
          icon="📋"
          title="No Proposals Found"
          message={`No proposals match the current filter (${filterStatus !== "all" ? filterStatus : "all status"}, ${filterType !== "all" ? filterType : "all types"}).`}
        />
      )}

      {/* Proposals Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(440px, 1fr))", gap: "1rem" }}>
        {filteredProposals.map((p) => {
          const cfg = CONSTRAINT_CONFIG[p.constraint_type] || {
            label: p.constraint_type,
            icon: "📌",
            color: "#475569",
            bg: "#f8fafc",
            border: "#cbd5e1",
          };

          const isDeciding = decidingId === p.id;
          const isAccepted = p.status === "accepted";
          const isRejected = p.status === "rejected";

          return (
            <div
              key={p.id}
              className="card"
              style={{
                borderRadius: "10px",
                border: `1.5px solid ${isAccepted ? "#10b981" : isRejected ? "#e2e8f0" : "var(--border)"}`,
                padding: "1.1rem",
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                background: isAccepted ? "#fcfdfc" : "var(--card-bg)",
                boxShadow: "var(--shadow-sm)",
                transition: "transform 0.15s ease, box-shadow 0.15s ease",
              }}
            >
              <div>
                {/* Header row: Type badge, Mine/Zone, Status */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.75rem", gap: "0.5rem" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.4rem" }}>
                    <span
                      style={{
                        background: cfg.bg,
                        color: cfg.color,
                        border: `1px solid ${cfg.border}`,
                        padding: "0.2rem 0.55rem",
                        borderRadius: "6px",
                        fontSize: "0.78rem",
                        fontWeight: 600,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <span>{cfg.icon}</span> {cfg.label}
                    </span>

                    <span
                      style={{
                        background: "#f1f5f9",
                        color: "#334155",
                        border: "1px solid #cbd5e1",
                        padding: "0.2rem 0.5rem",
                        borderRadius: "6px",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                      }}
                    >
                      {p.mine_id === "balaghat" ? "Balaghat" : "Ukwa"} {p.zone_id ? `• ${p.zone_id}` : ""}
                    </span>
                  </div>

                  <div>
                    {p.status === "proposed" && (
                      <span style={{ background: "#fef3c7", color: "#92400e", border: "1px solid #fde68a", padding: "0.2rem 0.55rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>
                        Pending Approval
                      </span>
                    )}
                    {isAccepted && (
                      <span style={{ background: "#d1fae5", color: "#065f46", border: "1px solid #a7f3d0", padding: "0.2rem 0.55rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>
                        ✓ Accepted
                      </span>
                    )}
                    {isRejected && (
                      <span style={{ background: "#f1f5f9", color: "#64748b", border: "1px solid #e2e8f0", padding: "0.2rem 0.55rem", borderRadius: "12px", fontSize: "0.75rem", fontWeight: 600 }}>
                        ✕ Rejected
                      </span>
                    )}
                  </div>
                </div>

                {/* Constraint Description */}
                <div style={{ marginBottom: "0.75rem" }}>
                  <p style={{ fontSize: "0.85rem", color: "var(--muted)", margin: 0, lineHeight: 1.4 }}>
                    <strong style={{ color: "var(--text)" }}>Detected Constraint:</strong> {p.description}
                  </p>
                </div>

                {/* Proposed Corrective Action */}
                <div
                  style={{
                    background: "#f8fafc",
                    borderLeft: `4px solid ${cfg.color}`,
                    padding: "0.75rem 0.85rem",
                    borderRadius: "4px",
                    marginBottom: "0.9rem",
                  }}
                >
                  <div style={{ fontSize: "0.78rem", fontWeight: 700, color: cfg.color, textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: "0.2rem" }}>
                    Proposed Corrective Action
                  </div>
                  <p style={{ fontSize: "0.88rem", color: "var(--text)", margin: 0, lineHeight: 1.45, fontWeight: 500 }}>
                    {p.proposed_change}
                  </p>
                </div>
              </div>

              {/* Action Decision Footer */}
              <div style={{ borderTop: "1px solid var(--border)", paddingTop: "0.75rem", marginTop: "0.4rem" }}>
                {p.status === "proposed" ? (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "0.5rem" }}>
                    <span style={{ fontSize: "0.75rem", color: "var(--muted)" }}>
                      Ref: <code style={{ fontSize: "0.72rem" }}>{p.id}</code>
                    </span>

                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => handleDecision(p.id, "reject")}
                        disabled={isDeciding}
                        style={{
                          padding: "0.4rem 0.75rem",
                          fontSize: "0.82rem",
                          borderColor: "#fca5a5",
                          color: "#b91c1c",
                          background: "#fff",
                        }}
                      >
                        Reject
                      </button>

                      <button
                        type="button"
                        className="primary-btn"
                        onClick={() => handleDecision(p.id, "accept")}
                        disabled={isDeciding}
                        style={{
                          padding: "0.4rem 0.95rem",
                          fontSize: "0.82rem",
                          background: "#059669",
                          borderColor: "#059669",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        {isDeciding ? "Broadcasting..." : "✓ Accept & Dispatch"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.78rem", color: "var(--muted)" }}>
                    <span>
                      {isAccepted ? "Approved by" : "Rejected by"}: <strong style={{ color: "var(--text)" }}>{p.decided_by || "Manager"}</strong>
                    </span>
                    <span>
                      {p.decided_at ? new Date(p.decided_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" }) : ""}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
