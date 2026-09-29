import { useCallback, useEffect, useRef, useState } from "react";
import { apiGet, apiPost } from "../api";
import {
  DataTable,
  KpiCard,
  SectionHeader,
  StatusPill,
} from "../ui";

const CHANNELS = [
  { id: "Operations", name: "#Operations", desc: "Shift quotas, stope haulage, and overall mine operations" },
  { id: "Blasting", name: "#Blasting", desc: "Blast schedules, DGMS clearances, explosive loading, and re-entry times" },
  { id: "Equipment", name: "#Equipment", desc: "Fleet telemetry, breakdown alerts, maintenance, and redeployments" },
  { id: "Safety", name: "#Safety", desc: "Gas monitoring, ventilation, rainfall advisories, and PPE compliance" },
  { id: "Geology", name: "#Geology", desc: "Face sampling grades, reserve classifications, and core drill priorities" },
  { id: "General", name: "#General", desc: "Cross-departmental shift handover and general mine announcements" },
];

export function MineCommandHubView({ role, user }) {
  const [activeChannel, setActiveChannel] = useState("Operations");
  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [postingMessage, setPostingMessage] = useState(false);

  // Action Tracker state
  const [actions, setActions] = useState([]);
  const [loadingActions, setLoadingActions] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [mineFilter, setMineFilter] = useState("All");

  // Create Action Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newActionIssue, setNewActionIssue] = useState("");
  const [newActionMine, setNewActionMine] = useState("balaghat");
  const [newActionZone, setNewActionZone] = useState("ZONE-01");
  const [newActionAssigned, setNewActionAssigned] = useState("Operations Manager");
  const [newActionPriority, setNewActionPriority] = useState("Medium");
  const [creatingAction, setCreatingAction] = useState(false);

  // Field Execution Completion Modal state (Closing the loop)
  const [completingAction, setCompletingAction] = useState(null);
  const [actualStatusUpdate, setActualStatusUpdate] = useState("");
  const [submittingCompletion, setSubmittingCompletion] = useState(false);

  const messagesEndRef = useRef(null);

  // --------------------------------------------------------------------------
  // Message Fetching with Simple Client Polling
  // NOTE: Using HTTP client polling (every 6 seconds) for prototype message stream.
  // In Phase 7 (Tech-Stack Mapping & Production Deployment), this polling loop will be
  // replaced with real-time WebSockets / Apache Kafka pub-sub streaming per architecture spec.
  // --------------------------------------------------------------------------
  const fetchMessages = useCallback(async (channel, silent = false) => {
    if (!silent) setLoadingMessages(true);
    try {
      const data = await apiGet(`/api/mine-command/${channel}?limit=50`);
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      // Best-effort polling in prototype
    } finally {
      if (!silent) setLoadingMessages(false);
    }
  }, []);

  // Polling loop for active chat channel
  useEffect(() => {
    fetchMessages(activeChannel, false);
    const interval = setInterval(() => {
      fetchMessages(activeChannel, true);
    }, 6000);
    return () => clearInterval(interval);
  }, [activeChannel, fetchMessages]);

  // --------------------------------------------------------------------------
  // Action Tracker Fetching
  // --------------------------------------------------------------------------
  const fetchActions = useCallback(async () => {
    setLoadingActions(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "All") params.append("status", statusFilter);
      if (mineFilter !== "All") params.append("mine_id", mineFilter);
      const queryStr = params.toString() ? `?${params.toString()}` : "";
      const data = await apiGet(`/api/actions${queryStr}`);
      setActions(Array.isArray(data) ? data : []);
    } catch {
      setActions([]);
    } finally {
      setLoadingActions(false);
    }
  }, [statusFilter, mineFilter]);

  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  // --------------------------------------------------------------------------
  // Send Message
  // --------------------------------------------------------------------------
  const handleSendMessage = async (e) => {
    e.preventDefault();
    const text = messageText.trim();
    if (!text || postingMessage) return;

    setPostingMessage(true);
    const authorName = user?.username
      ? (user.username.includes("@") ? user.username.split("@")[0] : user.username)
      : (role || "Field Specialist");

    try {
      await apiPost(`/api/mine-command/${activeChannel}`, {
        author: `${authorName} (${role || "Operations"})`,
        text: text,
        is_system_generated: false,
      });
      setMessageText("");
      await fetchMessages(activeChannel, true);
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
      }
    } catch (err) {
      alert(`Failed to post message: ${err.message}`);
    } finally {
      setPostingMessage(false);
    }
  };

  // --------------------------------------------------------------------------
  // Create Action Manually
  // --------------------------------------------------------------------------
  const handleCreateAction = async (e) => {
    e.preventDefault();
    if (!newActionIssue.trim() || creatingAction) return;

    setCreatingAction(true);
    try {
      await apiPost("/api/actions", {
        issue: newActionIssue.trim(),
        mine_id: newActionMine,
        zone_id: newActionZone,
        assigned_to: newActionAssigned,
        priority: newActionPriority,
      });
      setShowCreateModal(false);
      setNewActionIssue("");
      await fetchActions();
      await fetchMessages(activeChannel, true);
    } catch (err) {
      alert(`Failed to create action: ${err.message}`);
    } finally {
      setCreatingAction(false);
    }
  };

  // --------------------------------------------------------------------------
  // Advance Action Status: Open -> In Progress
  // --------------------------------------------------------------------------
  const handleStartAction = async (actionId) => {
    try {
      await apiPost(`/api/actions/${actionId}/status`, {
        status: "In Progress",
      });
      await fetchActions();
    } catch (err) {
      alert(`Failed to advance action: ${err.message}`);
    }
  };

  // --------------------------------------------------------------------------
  // Open Completion Modal with Contextual Recommendations
  // --------------------------------------------------------------------------
  const promptCompletionModal = (action) => {
    setCompletingAction(action);
    const issueLower = (action.issue || "").toLowerCase();
    if (issueLower.includes("equipment") || issueLower.includes("lhd") || issueLower.includes("haul")) {
      setActualStatusUpdate(
        `Equipment unit redeployed to ${action.zone_id || "target zone"}. Operational check completed and verified Active in telemetry system.`
      );
    } else if (issueLower.includes("blast")) {
      setActualStatusUpdate(
        `Controlled blast executed at ${new Date().toLocaleTimeString()}. Stemming verified and DGMS re-entry all-clear confirmed.`
      );
    } else if (issueLower.includes("safety") || issueLower.includes("ventilation")) {
      setActualStatusUpdate(
        `Auxiliary fan restarted and air volume calibrated above 1,800 m3/min. Gas levels normal.`
      );
    } else {
      setActualStatusUpdate(
        `Field supervisor verified execution complete. Operational directive fulfilled at ${action.mine_id?.toUpperCase()}/${action.zone_id || "Stope"}.`
      );
    }
  };

  // --------------------------------------------------------------------------
  // Submit Action Completion (Closing the Loop)
  // --------------------------------------------------------------------------
  const handleConfirmCompletion = async (e) => {
    e.preventDefault();
    if (!completingAction || submittingCompletion) return;

    setSubmittingCompletion(true);
    try {
      await apiPost(`/api/actions/${completingAction.action_id}/status`, {
        status: "Completed",
        actual_update: actualStatusUpdate.trim(),
      });
      setCompletingAction(null);
      setActualStatusUpdate("");
      await fetchActions();
      await fetchMessages(activeChannel, true);
    } catch (err) {
      alert(`Failed to complete action: ${err.message}`);
    } finally {
      setSubmittingCompletion(false);
    }
  };

  // Summary counts for KPI pills
  const totalActions = actions.length;
  const openCount = actions.filter((a) => a.status === "Open").length;
  const inProgressCount = actions.filter((a) => a.status === "In Progress").length;
  const completedCount = actions.filter((a) => a.status === "Completed").length;

  const currentChannelInfo = CHANNELS.find((c) => c.id === activeChannel) || CHANNELS[0];

  // Action Tracker Table columns
  const actionColumns = [
    {
      key: "action_id",
      header: "Action ID",
      width: "140px",
      render: (val) => (
        <span style={{ fontFamily: "monospace", fontWeight: 700, color: "var(--primary)" }}>
          {val}
        </span>
      ),
    },
    {
      key: "mine_id",
      header: "Location",
      width: "120px",
      render: (val, row) => (
        <span style={{ fontSize: "0.82rem", fontWeight: 600 }}>
          {val === "balaghat" ? "Balaghat" : "Ukwa"} / {row.zone_id || "All"}
        </span>
      ),
    },
    {
      key: "issue",
      header: "Directive / Issue",
      render: (val, row) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.86rem", color: "var(--text)" }}>
            {val}
          </div>
          {row.actual_update && (
            <div
              style={{
                fontSize: "0.76rem",
                color: "#047857",
                background: "rgba(16, 185, 129, 0.08)",
                padding: "2px 6px",
                borderRadius: "4px",
                marginTop: "4px",
                display: "inline-block",
              }}
            >
              ✓ Actual: {row.actual_update}
            </div>
          )}
        </div>
      ),
    },
    {
      key: "assigned_to",
      header: "Assigned To",
      width: "150px",
      render: (val) => (
        <span style={{ fontSize: "0.82rem", color: "var(--muted)" }}>
          {val}
        </span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      width: "90px",
      render: (val) => <StatusPill status={val} />,
    },
    {
      key: "status",
      header: "Status",
      width: "110px",
      render: (val) => <StatusPill status={val} />,
    },
    {
      key: "actions",
      header: "Execution Flow",
      width: "150px",
      render: (_, row) => {
        if (row.status === "Open") {
          return (
            <button
              type="button"
              className="btn btn-outline"
              style={{ padding: "4px 10px", fontSize: "0.78rem" }}
              onClick={() => handleStartAction(row.action_id)}
            >
              ▶ Start Action
            </button>
          );
        }
        if (row.status === "In Progress") {
          return (
            <button
              type="button"
              className="btn btn-primary"
              style={{ padding: "4px 10px", fontSize: "0.78rem" }}
              onClick={() => promptCompletionModal(row)}
            >
              ✓ Complete
            </button>
          );
        }
        return (
          <span
            style={{
              fontSize: "0.78rem",
              fontWeight: 600,
              color: "#10b981",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>Closed Loop</span> 🔄
          </span>
        );
      },
    },
  ];

  return (
    <div className="mine-command-hub-view" style={{ padding: "var(--space-3) 0" }}>
      {/* View Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          marginBottom: "var(--space-3)",
          flexWrap: "wrap",
          gap: "var(--space-2)",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.45rem", fontWeight: 700, margin: 0, color: "var(--text)" }}>
            Mine Command & Field Execution Hub
          </h1>
          <p style={{ margin: "4px 0 0 0", color: "var(--muted)", fontSize: "0.88rem" }}>
            Operational directive communications stream & closed-loop execution tracking across MOIL operations.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
            onClick={() => setShowCreateModal(true)}
          >
            <span>+</span>
            <span>Create Action</span>
          </button>
        </div>
      </div>

      {/* Split Hub Layout */}
      <div
        className="command-hub-grid"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(340px, 1fr) minmax(500px, 1.4fr)",
          gap: "var(--space-3)",
          alignItems: "start",
        }}
      >
        {/* =================================================================== */}
        {/* LEFT COLUMN: Mine Command Chat Component */}
        {/* =================================================================== */}
        <div
          className="chat-hub-card"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            display: "flex",
            flexDirection: "column",
            height: "720px",
            overflow: "hidden",
          }}
        >
          {/* Channel Tabs */}
          <div
            className="chat-channel-bar"
            style={{
              padding: "10px 14px 6px 14px",
              background: "#f8fafc",
              borderBottom: "1px solid var(--border)",
              display: "flex",
              gap: "6px",
              overflowX: "auto",
              whiteSpace: "nowrap",
            }}
          >
            {CHANNELS.map((ch) => {
              const active = activeChannel === ch.id;
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChannel(ch.id)}
                  style={{
                    padding: "6px 12px",
                    borderRadius: "20px",
                    fontSize: "0.82rem",
                    fontWeight: active ? 700 : 500,
                    border: active ? "1px solid var(--primary)" : "1px solid #e2e8f0",
                    background: active ? "rgba(2, 132, 199, 0.1)" : "#ffffff",
                    color: active ? "var(--primary)" : "var(--muted)",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {ch.name}
                </button>
              );
            })}
          </div>

          {/* Active Channel Subheader */}
          <div
            style={{
              padding: "10px 16px",
              borderBottom: "1px solid #f1f5f9",
              background: "#ffffff",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text)" }}>
                {currentChannelInfo.name}
              </span>
              <span
                style={{
                  fontSize: "0.78rem",
                  color: "var(--muted)",
                  marginLeft: "8px",
                }}
              >
                {currentChannelInfo.desc}
              </span>
            </div>
            <div
              style={{
                fontSize: "0.72rem",
                color: "#10b981",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontWeight: 600,
              }}
              title="Polling every 6s (Tech-Stack: Phase 7 Kafka/WebSocket migration target)"
            >
              <span
                style={{
                  width: "6px",
                  height: "6px",
                  borderRadius: "50%",
                  background: "#10b981",
                }}
              />
              Live Stream
            </div>
          </div>

          {/* Message List Stream */}
          <div
            className="chat-message-list"
            style={{
              flex: 1,
              padding: "16px",
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: "12px",
              background: "#fafbfc",
            }}
          >
            {loadingMessages && messages.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0" }}>
                Connecting to #{activeChannel} stream...
              </div>
            ) : messages.length === 0 ? (
              <div
                style={{
                  textAlign: "center",
                  color: "var(--muted)",
                  padding: "40px 16px",
                  fontSize: "0.86rem",
                }}
              >
                No messages yet in #{activeChannel}. Post an update or approval directives will broadcast here.
              </div>
            ) : (
              messages.map((msg) => {
                const isSystem = Boolean(msg.is_system_generated);
                const isDirective = (msg.text || "").includes("DIRECTIVE ISSUED");
                const isCompleted = (msg.text || "").includes("Action Completed");

                if (isSystem) {
                  return (
                    <div
                      key={msg.id}
                      style={{
                        padding: "10px 12px",
                        background: isCompleted
                          ? "rgba(16, 185, 129, 0.08)"
                          : "rgba(2, 132, 199, 0.07)",
                        borderLeft: isCompleted
                          ? "3px solid #10b981"
                          : "3px solid var(--primary)",
                        borderRadius: "6px",
                        fontSize: "0.83rem",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: "4px",
                          fontSize: "0.72rem",
                          fontWeight: 700,
                          color: isCompleted ? "#047857" : "var(--primary)",
                        }}
                      >
                        <span>
                          {isDirective ? "⚡ AUTOMATED DIRECTIVE" : "🔔 SYSTEM NOTIFICATION"}
                        </span>
                        <span style={{ color: "var(--muted)", fontWeight: 400 }}>
                          {msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ""}
                        </span>
                      </div>
                      <div style={{ color: "var(--text)", lineHeight: 1.4 }}>
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                // Normal user message
                return (
                  <div
                    key={msg.id}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      background: "#ffffff",
                      border: "1px solid #e2e8f0",
                      borderRadius: "10px",
                      padding: "8px 12px",
                      maxWidth: "92%",
                      alignSelf: "flex-start",
                      boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "3px",
                      }}
                    >
                      <span style={{ fontWeight: 700, fontSize: "0.8rem", color: "var(--text)" }}>
                        {msg.author || "Field Specialist"}
                      </span>
                      <span style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                        {msg.created_at ? new Date(msg.created_at).toLocaleTimeString() : ""}
                      </span>
                    </div>
                    <div style={{ fontSize: "0.85rem", color: "var(--text)", lineHeight: 1.4 }}>
                      {msg.text}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Text Input Bar */}
          <form
            onSubmit={handleSendMessage}
            style={{
              padding: "12px",
              borderTop: "1px solid var(--border)",
              background: "#ffffff",
              display: "flex",
              gap: "8px",
              alignItems: "center",
            }}
          >
            <input
              type="text"
              placeholder={`Message #${activeChannel}...`}
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              disabled={postingMessage}
              style={{
                flex: 1,
                padding: "8px 14px",
                border: "1px solid var(--border)",
                borderRadius: "8px",
                fontSize: "0.88rem",
                outline: "none",
              }}
            />
            <button
              type="submit"
              className="btn btn-primary"
              disabled={postingMessage || !messageText.trim()}
              style={{ padding: "8px 16px", fontSize: "0.86rem" }}
            >
              {postingMessage ? "Sending..." : "Send"}
            </button>
          </form>
        </div>

        {/* =================================================================== */}
        {/* RIGHT COLUMN: Action Tracker Table & Closed-Loop Updates */}
        {/* =================================================================== */}
        <div
          className="action-tracker-card"
          style={{
            background: "var(--card-bg)",
            border: "1px solid var(--border)",
            borderRadius: "14px",
            boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            padding: "var(--space-3)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          {/* Header + Filters */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "var(--space-1)",
            }}
          >
            <SectionHeader
              title="Action Tracker & Execution"
              subtitle="Audited directives and closed-loop data updates"
            />

            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  fontSize: "0.82rem",
                  background: "#ffffff",
                }}
              >
                <option value="All">All Statuses</option>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Completed">Completed</option>
              </select>

              <select
                value={mineFilter}
                onChange={(e) => setMineFilter(e.target.value)}
                style={{
                  padding: "6px 10px",
                  borderRadius: "6px",
                  border: "1px solid var(--border)",
                  fontSize: "0.82rem",
                  background: "#ffffff",
                }}
              >
                <option value="All">All Mines</option>
                <option value="balaghat">Balaghat</option>
                <option value="ukwa">Ukwa</option>
              </select>
            </div>
          </div>

          {/* Quick Metrics */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: "8px",
            }}
          >
            <div style={{ padding: "8px 12px", background: "#f8fafc", borderRadius: "8px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--muted)", textTransform: "uppercase" }}>Total</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--text)" }}>{totalActions}</div>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(2, 132, 199, 0.08)", borderRadius: "8px", border: "1px solid rgba(2, 132, 199, 0.2)" }}>
              <div style={{ fontSize: "0.72rem", color: "var(--primary)", textTransform: "uppercase" }}>Open</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--primary)" }}>{openCount}</div>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(245, 158, 11, 0.08)", borderRadius: "8px", border: "1px solid rgba(245, 158, 11, 0.2)" }}>
              <div style={{ fontSize: "0.72rem", color: "#d97706", textTransform: "uppercase" }}>In Progress</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#d97706" }}>{inProgressCount}</div>
            </div>
            <div style={{ padding: "8px 12px", background: "rgba(16, 185, 129, 0.08)", borderRadius: "8px", border: "1px solid rgba(16, 185, 129, 0.2)" }}>
              <div style={{ fontSize: "0.72rem", color: "#047857", textTransform: "uppercase" }}>Completed</div>
              <div style={{ fontSize: "1.2rem", fontWeight: 700, color: "#047857" }}>{completedCount}</div>
            </div>
          </div>

          {/* Action Tracker DataTable */}
          <div style={{ marginTop: "4px" }}>
            <DataTable
              columns={actionColumns}
              rows={actions}
              keyField="action_id"
              emptyMessage={loadingActions ? "Loading tracked actions..." : "No actions match current filters."}
            />
          </div>
        </div>
      </div>

      {/* ===================================================================== */}
      {/* MODAL 1: Create Action Manually */}
      {/* ===================================================================== */}
      {showCreateModal && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="modal-box"
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "24px",
              width: "100%",
              maxWidth: "520px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            }}
          >
            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.2rem", color: "var(--text)" }}>
              Create Tracked Action
            </h3>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.84rem", color: "var(--muted)" }}>
              Initiate an operational task tracked across all 7 mine roles and logged in scheduling.db.
            </p>

            <form onSubmit={handleCreateAction} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                  Issue / Directive Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Inspect LHD-02 hydraulic cylinder in Zone-02"
                  value={newActionIssue}
                  onChange={(e) => setNewActionIssue(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    fontSize: "0.88rem",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                    Mine Site
                  </label>
                  <select
                    value={newActionMine}
                    onChange={(e) => setNewActionMine(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="balaghat">Balaghat (Bharveli)</option>
                    <option value="ukwa">Ukwa Mine</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                    Zone ID
                  </label>
                  <input
                    type="text"
                    value={newActionZone}
                    onChange={(e) => setNewActionZone(e.target.value)}
                    placeholder="ZONE-01"
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      fontSize: "0.85rem",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                    Assigned Role
                  </label>
                  <select
                    value={newActionAssigned}
                    onChange={(e) => setNewActionAssigned(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="Operations Manager">Operations Manager</option>
                    <option value="Equipment Maintenance Lead">Equipment Maintenance Lead</option>
                    <option value="Blasting Supervisor">Blasting Supervisor</option>
                    <option value="Safety Compliance Officer">Safety Compliance Officer</option>
                    <option value="Chief Geologist">Chief Geologist</option>
                    <option value="Surveyor Lead">Surveyor Lead</option>
                    <option value="Field Supervisor">Field Supervisor</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 600, marginBottom: "4px" }}>
                    Priority
                  </label>
                  <select
                    value={newActionPriority}
                    onChange={(e) => setNewActionPriority(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px",
                      borderRadius: "6px",
                      border: "1px solid var(--border)",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="High">High</option>
                    <option value="Medium">Medium</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "12px",
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={creatingAction}
                >
                  {creatingAction ? "Creating..." : "Create Action"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MODAL 2: Field Execution Actual Status Update (Closing the Loop) */}
      {/* ===================================================================== */}
      {completingAction && (
        <div
          className="modal-overlay"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(15, 23, 42, 0.5)",
            backdropFilter: "blur(2px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            className="modal-box"
            style={{
              background: "#ffffff",
              borderRadius: "14px",
              padding: "24px",
              width: "100%",
              maxWidth: "560px",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
              <span style={{ fontSize: "1.2rem" }}>🔄</span>
              <h3 style={{ margin: 0, fontSize: "1.2rem", color: "var(--text)" }}>
                Field Execution Status Update
              </h3>
            </div>
            <p style={{ margin: "0 0 16px 0", fontSize: "0.84rem", color: "var(--muted)" }}>
              Complete action <strong style={{ color: "var(--primary)" }}>{completingAction.action_id}</strong> and append actual field telemetry back into the Phase-1 Data Store.
            </p>

            <div
              style={{
                padding: "10px 12px",
                background: "#f8fafc",
                borderRadius: "8px",
                border: "1px solid #e2e8f0",
                fontSize: "0.82rem",
                marginBottom: "14px",
              }}
            >
              <div><strong>Directive:</strong> {completingAction.issue}</div>
              <div style={{ marginTop: "4px", color: "var(--muted)" }}>
                Target: {completingAction.mine_id?.toUpperCase()} / {completingAction.zone_id || "General"} | Assigned: {completingAction.assigned_to}
              </div>
            </div>

            <form onSubmit={handleConfirmCompletion} style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 600, marginBottom: "4px" }}>
                  Actual Status Update / Field Confirmation *
                </label>
                <textarea
                  required
                  rows={3}
                  value={actualStatusUpdate}
                  onChange={(e) => setActualStatusUpdate(e.target.value)}
                  placeholder="Describe the confirmed field change (e.g. equipment moved confirmation, blast timestamp, supervisor verification)..."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid var(--border)",
                    fontSize: "0.86rem",
                    boxSizing: "border-box",
                    resize: "vertical",
                  }}
                />
              </div>

              <div
                style={{
                  padding: "8px 12px",
                  background: "rgba(16, 185, 129, 0.08)",
                  border: "1px solid rgba(16, 185, 129, 0.25)",
                  borderRadius: "6px",
                  fontSize: "0.78rem",
                  color: "#047857",
                  lineHeight: 1.4,
                }}
              >
                <strong>Closed Loop Data Store Integration:</strong> Submitting this update appends a verified physical row into <code>equipment_iot_telemetry.csv</code> or <code>blasting_logs.csv</code>, updating the active equipment zone and setting status to Active.
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  marginTop: "8px",
                }}
              >
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={() => setCompletingAction(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={submittingCompletion || !actualStatusUpdate.trim()}
                >
                  {submittingCompletion ? "Updating Data Store..." : "Confirm & Close Loop"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
