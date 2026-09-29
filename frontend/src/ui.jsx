import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE, apiGet } from "./api";

// --- Shared constants (same palette the dashboard already used) ---
export const ZONE_COLORS = {
  High: "#dc3545", // red
  Medium: "#fd7e14", // orange
  Low: "#adb5bd", // gray
};

export const RISK_COLORS = { ...ZONE_COLORS };

export const ROLES = [
  { value: "Geologist", label: "Geologist" },
  { value: "Surveyor", label: "Surveyor" },
  { value: "Operations Manager", label: "Operations Manager" },
  { value: "Blasting Supervisor", label: "Blasting Supervisor" },
  { value: "Equipment/Maintenance", label: "Equipment / Maintenance" },
  { value: "Safety Officer", label: "Safety Officer" },
  { value: "Management", label: "Executive Management" },
];

export const NAV_ITEMS = [
  { id: "Geologist", label: "Geologist" },
  { id: "Surveyor", label: "Surveyor" },
  { id: "Operations Manager", label: "Operations Manager" },
  { id: "Blasting Supervisor", label: "Blasting Supervisor" },
  { id: "Equipment/Maintenance", label: "Equipment / Maintenance" },
  { id: "Safety Officer", label: "Safety Officer" },
  { id: "Management", label: "Management" },
  { id: "Mine Command", label: "💬 Mine Command & Actions" },
];

export const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "ta", label: "தமிழ்" },
  { value: "hi", label: "हिन्दी" },
];

// BCP-47 tag used to find a matching speechSynthesis voice per language.
export const SPEECH_LANGS = { en: "en-IN", ta: "ta-IN", hi: "hi-IN" };

export const NUMBER = new Intl.NumberFormat("en-IN");

// Compact tonne labels for chart axes (reserves run into the millions).
export function formatTonnesShort(value) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${value}`;
}

export function formatTonnes(value) {
  return NUMBER.format(Math.round(Number(value)));
}

// Signed gap, e.g. "+4,776 t" / "-1,200 t".
export function formatGap(value) {
  const n = Math.round(Number(value));
  return `${n >= 0 ? "+" : ""}${NUMBER.format(n)}`;
}

// Probabilities are shown as clean whole percents.
export function formatPercent(fraction) {
  return `${Math.round(Number(fraction) * 100)}%`;
}

export function formatTimestamp(iso) {
  if (!iso) return "unknown";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown" : d.toLocaleString();
}

// --- Login / Navbar ---
export { Login } from "./Login";

export function Navbar({
  role,
  user,
  onLogout,
  currentView,
  onViewChange,
  alertsOpen = false,
  onToggleAlerts,
  alertCount = 0,
}) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  return (
    <header className="navbar">
      <div className="navbar-brand-group">
        <span className="navbar-brand">MOIL Analyzer</span>
        <span
          className="navbar-mine-tag"
          style={{
            marginLeft: "0.6rem",
            padding: "0.2rem 0.65rem",
            background: "rgba(16, 185, 129, 0.12)",
            border: "1px solid rgba(16, 185, 129, 0.3)",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 600,
            color: "#047857",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            boxShadow: "0 1px 3px rgba(16, 185, 129, 0.08)",
          }}
          title="Active Telemetry Site (Balaghat Mine)"
        >
          <span
            style={{
              width: "7px",
              height: "7px",
              borderRadius: "50%",
              backgroundColor: "#10b981",
              boxShadow: "0 0 6px #10b981",
            }}
          />
          {user?.mine || "Balaghat Mine"}
        </span>
      </div>

      <nav className="navbar-nav-tabs" aria-label="Main navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-tab-link ${currentView === item.id ? "active" : ""}`}
            onClick={() => onViewChange && onViewChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="navbar-right">
        {onToggleAlerts && (
          <button
            type="button"
            className={`btn btn-nav-action ${alertsOpen ? "btn-primary" : "btn-outline"} btn-alerts-toggle`}
            onClick={onToggleAlerts}
            title={alertsOpen ? "Close alerts side panel" : "Open active alerts side panel"}
          >
            <span className="nav-alert-icon">⚠</span> Alerts
            {alertCount > 0 && <span className="nav-alert-badge">{alertCount}</span>}
          </button>
        )}
        <span className="navbar-role-badge">
          Role: <strong>{role}</strong>
          {user?.username && (
            <span
              className="navbar-user-tag"
              title={`Logged in as ${user.username}`}
              style={{
                marginLeft: "0.5rem",
                padding: "0.15rem 0.5rem",
                background: "rgba(2, 132, 199, 0.08)",
                border: "1px solid rgba(2, 132, 199, 0.2)",
                color: "#0369a1",
                borderRadius: "6px",
                fontSize: "0.8rem",
                fontWeight: 600,
              }}
            >
              👤 {user.username.includes("@") ? user.username.split("@")[0] : user.username}
            </span>
          )}
        </span>
        <button
          type="button"
          className="btn btn-outline btn-nav-action"
          onClick={() => setSourcesOpen(true)}
        >
          Data Sources
        </button>
        <button
          type="button"
          className="btn btn-outline btn-nav-action"
          onClick={onLogout}
        >
          Logout
        </button>
      </div>

      <DataSourcesModal
        open={sourcesOpen}
        onClose={() => setSourcesOpen(false)}
      />
    </header>
  );
}

// Fallback grouping so the modal still organises sources if it is ever served
// by an older API build that does not send an explicit `group`.
const SOURCE_GROUP_FALLBACK = {
  "Satellite imagery": "Satellite & geospatial (via Google Earth Engine)",
  "Vegetation index": "Satellite & geospatial (via Google Earth Engine)",
  "Land surface": "Satellite & geospatial (via Google Earth Engine)",
  "Soil moisture": "Satellite & geospatial (via Google Earth Engine)",
  Elevation: "Satellite & geospatial (via Google Earth Engine)",
  Weather: "Weather",
  "Weather dataset": "Weather",
  "Reference dataset": "Historical & reference datasets",
  "Operational dataset": "Historical & reference datasets",
  "Model output": "Model outputs",
};

function sourceGroup(source) {
  return source.group || SOURCE_GROUP_FALLBACK[source.kind] || "Other inputs";
}

// Single centralised provenance surface: every input behind every role view,
// grouped by kind, plus the models trained on them. Reachable from the navbar so
// it is consistent across all three views. Pulled live from /api/system-info so
// the list is the pipeline's own, not a hand-maintained copy.
export function DataSourcesModal({ open, onClose }) {
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const loading = open && !info && !error;

  useEffect(() => {
    if (!open || info || error) return undefined;
    let cancelled = false;
    apiGet("/api/system-info")
      .then((data) => {
        if (!cancelled) setInfo(data);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [open, info, error]);

  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const groups = [];
  (info?.data_sources ?? []).forEach((source) => {
    const title = sourceGroup(source);
    let group = groups.find((entry) => entry.title === title);
    if (!group) {
      group = { title, sources: [] };
      groups.push(group);
    }
    group.sources.push(source);
  });

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Data sources"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <h3 className="modal-title">Data Sources</h3>
          <button
            type="button"
            className="modal-close"
            onClick={onClose}
            aria-label="Close data sources"
            title="Close"
          >
            ×
          </button>
        </header>

        <div className="modal-body">
          <p className="modal-intro">
            Every input behind all three role views, and the models trained on
            them. Synthetic or illustrative inputs are labelled.
          </p>

          {loading && <Loader message="Loading data sources…" />}
          {error && (
            <ErrorState message="Failed to load data sources." hint={error} />
          )}

          {info &&
            groups.map((group) => (
              <div className="source-group" key={group.title}>
                <h4 className="source-group-title">{group.title}</h4>
                <ul className="source-list">
                  {group.sources.map((source) => (
                    <li key={source.name}>
                      <div className="source-head">
                        <strong>{source.name}</strong>
                        {source.synthetic ? (
                          <DataBadge kind="synthetic" />
                        ) : (
                          <DataBadge kind="real" />
                        )}
                      </div>
                      <span className="source-kind">{source.kind}</span>
                      <span className="source-detail">{source.detail}</span>
                      {source.last_updated && (
                        <span className="source-updated">
                          File updated: {formatTimestamp(source.last_updated)}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

          {info?.models?.length > 0 && (
            <div className="source-group">
              <h4 className="source-group-title">Models in use</h4>
              {info.models.map((model) => (
                <div className="model-card" key={model.name}>
                  <div className="model-head">
                    <strong>{model.name}</strong>
                    <span className="model-task">
                      {model.task === "classification"
                        ? "Classification"
                        : "Regression"}
                    </span>
                  </div>
                  {model.target && (
                    <p className="model-meta">Target: {model.target}</p>
                  )}
                  {model.note && <p className="model-note">{model.note}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Async states ---
export function Loader({ message = "Loading…" }) {
  return (
    <p className="muted status-line">
      <span className="spinner" aria-hidden="true" /> {message}
    </p>
  );
}

export function ErrorState({ message, hint }) {
  return (
    <p className="error">
      {message} Is the Flask API running at {API_BASE}?{hint ? ` (${hint})` : ""}
    </p>
  );
}

export function EmptyState({ children }) {
  return <p className="muted">{children}</p>;
}

// --- Information architecture: INPUT -> MODEL -> ... -> ACTION ---
export function Section({ step, title, subtitle, actions, children, id }) {
  return (
    <section className="section" id={id}>
      <header className="section-head">
        <div className="section-heading">
          {step && <span className="step-chip">{step}</span>}
          <h3 className="section-title">{title}</h3>
          {subtitle && <p className="section-subtitle">{subtitle}</p>}
        </div>
        {actions}
      </header>
      <div className="section-body">{children}</div>
    </section>
  );
}

// --- Unified Shared Components (Phase 5) ---

export function KpiCard({ icon, label, value, hint, trend, tone, style }) {
  const trendClass =
    trend?.direction ||
    (typeof trend === "string" && trend.startsWith("+")
      ? "up"
      : typeof trend === "string" && trend.startsWith("-")
      ? "down"
      : "neutral");
  const trendText = typeof trend === "object" ? trend.value : trend;

  return (
    <div className={`kpi-card ${tone ? `tone-${tone}` : ""}`} style={style}>
      <div className="kpi-card-top">
        <span className="kpi-card-label">{label}</span>
        {icon && <span className="kpi-card-icon">{icon}</span>}
      </div>
      <div className="kpi-card-value">{value}</div>
      {(hint || trend) && (
        <div className="kpi-card-footer">
          {hint && <span className="kpi-card-hint">{hint}</span>}
          {trend && (
            <span className={`kpi-card-trend ${trendClass}`}>{trendText}</span>
          )}
        </div>
      )}
    </div>
  );
}

const STATUS_COLOR_MAP = {
  // Green / Good / Compliant
  active: "status-good",
  operational: "status-good",
  completed: "status-good",
  "on track": "status-good",
  optimal: "status-good",
  low: "status-good",
  safe: "status-good",
  normal: "status-good",
  accepted: "status-good",
  compliant: "status-good",
  good: "status-good",

  // Blue / Info / Pending
  idle: "status-info",
  proposed: "status-info",
  open: "status-info",
  "in progress": "status-info",
  info: "status-info",
  monitoring: "status-info",

  // Amber / Warning / Delayed
  maintenance: "status-warning",
  warning: "status-warning",
  medium: "status-warning",
  moderate: "status-warning",
  delayed: "status-warning",
  caution: "status-warning",
  alert: "status-warning",

  // Red / Danger / Critical
  breakdown: "status-danger",
  critical: "status-danger",
  "critical delay": "status-danger",
  high: "status-danger",
  fault: "status-danger",
  danger: "status-danger",
  shortfall: "status-danger",
  rejected: "status-danger",
  restricted: "status-danger",
  noncompliant: "status-danger",
};

export function StatusPill({ status, label, tone, style }) {
  const key = String(status || label || "").trim().toLowerCase();
  const variant = tone
    ? `status-${tone}`
    : STATUS_COLOR_MAP[key] || "status-neutral";

  return (
    <span className={`status-pill ${variant}`} style={style}>
      <span className="status-pill-dot" />
      <span>{label || status}</span>
    </span>
  );
}

export function DataTable({
  columns,
  rows,
  keyField = "id",
  emptyMessage = "No records found.",
}) {
  if (!rows || rows.length === 0) {
    return (
      <div className="data-table-container">
        <div
          style={{
            padding: "var(--space-3)",
            textAlign: "center",
            color: "var(--muted)",
            fontSize: "0.88rem",
          }}
        >
          {emptyMessage}
        </div>
      </div>
    );
  }

  return (
    <div className="data-table-container">
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col, idx) => (
                <th
                  key={col.key || idx}
                  className={col.numeric ? "num" : ""}
                  style={col.width ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={row[keyField] ?? rIdx}>
                {columns.map((col, cIdx) => {
                  const val = col.render
                    ? col.render(row[col.key], row, rIdx)
                    : row[col.key];
                  return (
                    <td
                      key={col.key || cIdx}
                      className={col.numeric ? "num" : ""}
                    >
                      {val ?? "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function SectionHeader({ icon, title, subtitle, actions, style }) {
  return (
    <div className="section-header" style={style}>
      <div className="section-header-left">
        {icon && <span className="section-header-icon">{icon}</span>}
        <div>
          <h3 className="section-header-title">{title}</h3>
          {subtitle && <p className="section-header-sub">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="section-header-actions">{actions}</div>}
    </div>
  );
}

// Small provenance chip: makes "actual / estimated / illustrative / predicted"
// impossible to miss next to a number.
const DATA_BADGES = {
  real: { className: "badge-real", label: "Actual dataset" },
  estimated: { className: "badge-estimated", label: "Estimated" },
  illustrative: { className: "badge-illustrative", label: "Illustrative" },
  predicted: { className: "badge-predicted", label: "Model-predicted" },
  scenario: { className: "badge-scenario", label: "What-if scenario" },
  live: { className: "badge-real", label: "Live" },
  synthetic: { className: "badge-synthetic", label: "Synthetic input" },
};

export function DataBadge({ kind, label }) {
  const badge = DATA_BADGES[kind] || DATA_BADGES.estimated;
  return (
    <span className={`data-badge ${badge.className}`}>{label || badge.label}</span>
  );
}

export function StatusBadge({ status, tone }) {
  const color = tone === "good" ? "#198754" : tone === "bad" ? "#dc3545" : "#fd7e14";
  return (
    <span className="status-badge" style={{ backgroundColor: color }}>
      {status}
    </span>
  );
}

// Small (i) affordance for caveats that would otherwise dominate the section.
// The text stays available on hover, keyboard focus or click instead of
// occupying a persistent block.
export function InfoTip({ text, label = "More information" }) {
  const [open, setOpen] = useState(false);

  return (
    <span
      className="info-tip"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="info-tip-btn"
        aria-label={label}
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
      >
        i
      </button>
      {open && (
        <span className="info-tip-pop" role="tooltip">
          {text}
        </span>
      )}
    </span>
  );
}

export function AlertBanner({
  severity = "high",
  title,
  children,
  dismissible = false,
}) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className={`alert-banner alert-${severity}`} role="alert">
      <span className="alert-icon" aria-hidden="true">
        ⚠
      </span>
      <div className="alert-body">
        <strong className="alert-title">{title}</strong>
        {children && <span className="alert-text">{children}</span>}
      </div>
      {dismissible && (
        <button
          type="button"
          className="alert-dismiss"
          onClick={() => setHidden(true)}
          aria-label="Dismiss alert"
          title="Dismiss"
        >
          ×
        </button>
      )}
    </div>
  );
}

export function Legend({ items, note }) {
  return (
    <div className="legend-wrap">
      <div className="legend">
        {items.map((item) => (
          <span key={item.label}>
            <span className="dot" style={{ background: item.color }} />{" "}
            {item.label}
          </span>
        ))}
      </div>
      {note && <p className="legend-note">{note}</p>}
    </div>
  );
}

export function NoteCard({ title, tone, children }) {
  return (
    <div className={`note-card${tone ? ` note-${tone}` : ""}`}>
      {title && <span className="note-title">{title}</span>}
      <div className="note-body">{children}</div>
    </div>
  );
}

// --- Voice (browser Web Speech API, no backend) ---
export function SpeakerIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
      <path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor" />
      <path
        d="M16 8.7a4.6 4.6 0 0 1 0 6.6M18.6 6.2a8.2 8.2 0 0 1 0 11.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </svg>
  );
}

// Button whose speaker/stop state is toggled imperatively by useSpeech (see
// below) so re-rendering a react-leaflet Popup never tears the popup down.
export function VoiceButton({ onClick, label = "Read aloud" }) {
  return (
    <button
      type="button"
      className="voice-btn"
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span className="icon-speak">
        <SpeakerIcon />
      </span>
      <span className="icon-stop">
        <StopIcon />
      </span>
    </button>
  );
}

export function useSpeech(language) {
  const speakingBtnRef = useRef(null);

  const clearSpeaking = useCallback(() => {
    const btn = speakingBtnRef.current;
    if (btn) {
      btn.classList.remove("speaking");
      btn.setAttribute("aria-label", "Read aloud");
      btn.setAttribute("title", "Read aloud");
      speakingBtnRef.current = null;
    }
  }, []);

  // Stop any in-flight speech (used on language change and on unmount).
  const stopSpeech = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* speech is best-effort only */
      }
    }
    clearSpeaking();
  }, [clearSpeaking]);

  useEffect(() => stopSpeech, [stopSpeech]);

  const speakText = useCallback(
    (text, btn) => {
      if (typeof window === "undefined" || !window.speechSynthesis) return;
      const synth = window.speechSynthesis;
      const alreadyThis = speakingBtnRef.current === btn;
      const busy = synth.speaking || synth.pending;
      // Toggle off when this button is the one reading. `alreadyThis` is checked
      // alongside synth.speaking because some engines do not fire `onend`, which
      // would otherwise leave the button stuck in its "stop" state.
      if (alreadyThis || busy) {
        try {
          synth.cancel();
        } catch {
          /* ignore */
        }
        clearSpeaking();
        if (alreadyThis) return;
      }
      try {
        const utter = new SpeechSynthesisUtterance(text);
        const tag = SPEECH_LANGS[language] || "en-IN";
        utter.lang = tag;
        const want = tag.toLowerCase();
        const base = want.slice(0, 2);
        const voices = synth.getVoices ? synth.getVoices() || [] : [];
        const match =
          voices.find((v) => (v.lang || "").toLowerCase() === want) ||
          voices.find((v) =>
            (v.lang || "").toLowerCase().replace("_", "-").startsWith(base)
          );
        if (match) utter.voice = match;
        // If no voice exists for the language the browser may still fetch one;
        // either way failures stay silent rather than throwing.
        utter.onend = clearSpeaking;
        utter.onerror = clearSpeaking;
        speakingBtnRef.current = btn;
        btn.classList.add("speaking");
        btn.setAttribute("aria-label", "Stop reading");
        btn.setAttribute("title", "Stop");
        synth.speak(utter);
      } catch {
        clearSpeaking();
      }
    },
    [language, clearSpeaking]
  );

  return { speakText, stopSpeech };
}
