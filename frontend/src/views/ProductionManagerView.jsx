import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  MapContainer,
  Popup,
  Rectangle,
  TileLayer,
  Tooltip as LeafletTooltip,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { apiPost } from "../api";
import { PendingApprovalsPanel } from "./PendingApprovalsPanel";
import {
  AlertBanner,
  DataBadge,
  EmptyState,
  ErrorState,
  InfoTip,
  KpiCard,
  LANGUAGE_OPTIONS,
  Legend,
  Loader,
  RISK_COLORS,
  Section,
  StatusBadge,
  VoiceButton,
  formatGap,
  formatPercent,
  formatTimestamp,
  formatTonnes,
  useSpeech,
} from "../ui";

// Stable empty array so derived callbacks don't churn while results load.
const EMPTY = [];

// Highlight border colours for cells named in a redeployment plan.
const PLAN_FROM_COLOR = "#7f1d1d"; // dark red - redeploy equipment away from here
const PLAN_TO_COLOR = "#0f766e"; // teal - redeploy equipment into here

// Verbatim caveat for the operational-loss contributions in the explanation
// section, surfaced through an (i) tooltip instead of a persistent block.
const CONTRIBUTION_DISCLAIMER =
  "Contributions are estimated production losses from the transparent " +
  "operational-loss layer for the inputs above — reported as a share of total " +
  "modelled losses. They are not model feature importances and do not prove " +
  "causation.";

// Move estimates are small (tens of tonnes/week), so keep one decimal.
function formatTonnes1(value) {
  return Number(value).toLocaleString("en-IN", { maximumFractionDigits: 1 });
}

function FitZoneBounds({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, bounds]);

  return null;
}

function RiskBadge({ level }) {
  return (
    <span
      className="risk-badge"
      style={{ backgroundColor: RISK_COLORS[level] || "#adb5bd" }}
    >
      {level} Risk
    </span>
  );
}

// Popup keeps to the essentials: cell id, risk, probability, one-sentence
// reason (+ read-aloud).
function CellPopup({ cell, onToggleSpeak }) {
  return (
    <div className="pit-popup">
      <div className="pit-popup-head">
        <strong>{cell.unit_id}</strong>
        <RiskBadge level={cell.risk_level} />
      </div>
      <p className="pit-popup-prob">
        Reserve probability: {formatPercent(cell.avg_probability)}
      </p>
      <p className="pit-popup-reason">{cell.reason}</p>
      <VoiceButton onClick={(e) => onToggleSpeak(cell, e.currentTarget)} />
    </div>
  );
}

function CellRiskMap({ aoi, cells, onSpeak, planFrom, planTo }) {
  const center = aoi?.center ?? { lat: 21.83, lon: 80.23 };
  const hasPlan = (planFrom?.size ?? 0) > 0 || (planTo?.size ?? 0) > 0;
  return (
    <div>
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={13}
        className="leaflet-map pit-map"
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution="&copy; OpenStreetMap contributors"
        />
        {cells.map((cell) => {
          const color = RISK_COLORS[cell.risk_level] || RISK_COLORS.Low;
          const isFrom = planFrom?.has(cell.unit_id) ?? false;
          const isTo = planTo?.has(cell.unit_id) ?? false;
          const highlighted = isFrom || isTo;
          return (
            <Rectangle
              key={cell.unit_id}
              bounds={cell.bounds}
              pathOptions={{
                color: isFrom
                  ? PLAN_FROM_COLOR
                  : isTo
                    ? PLAN_TO_COLOR
                    : color,
                weight: highlighted ? 4 : 1.5,
                dashArray: isFrom ? "7 5" : undefined,
                fillColor: color,
                fillOpacity: highlighted ? 0.65 : 0.5,
              }}
            >
              <Popup>
                <CellPopup cell={cell} onToggleSpeak={onSpeak} />
              </Popup>
              {highlighted && (
                <LeafletTooltip
                  permanent
                  direction="top"
                  offset={[0, -2]}
                  className="plan-map-tip"
                >
                  {isFrom ? "Redeploy from" : "Redeploy to"}
                </LeafletTooltip>
              )}
            </Rectangle>
          );
        })}
        {aoi?.bounds && <FitZoneBounds bounds={aoi.bounds} />}
      </MapContainer>
      {hasPlan && (
        <p className="plan-map-note">
          <span className="plan-swatch plan-swatch-from" /> equipment moved away
          from these cells (dashed dark-red border) ·{" "}
          <span className="plan-swatch plan-swatch-to" /> equipment moved into
          these cells (teal border)
        </p>
      )}
    </div>
  );
}

function riskLegendItems(thresholds) {
  const high = thresholds?.high ?? 20;
  const medium = thresholds?.medium ?? 5;
  return [
    { color: RISK_COLORS.High, label: `High risk (>${high}% below target)` },
    { color: RISK_COLORS.Medium, label: `Medium (${medium}–${high}%)` },
    { color: RISK_COLORS.Low, label: `Low (<${medium}%)` },
  ];
}

// Prediction Result Popup Modal (Executive SaaS Design with Smooth Animations)
function PredictionResultModal({
  forecast,
  open,
  onClose,
  onScrollToDetails,
  downtimePct,
  delayHours,
  useLive,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open || !forecast) return null;
  const above = forecast.gap_tonnes >= 0;
  const onTrack = forecast.status === "On Track";
  const max = Math.max(
    forecast.predicted_weekly_production,
    forecast.target_tonnes,
    1
  );
  const predPct = Math.min((forecast.predicted_weekly_production / max) * 100, 100);
  const tgtPct = Math.min((forecast.target_tonnes / max) * 100, 100);

  return (
    <div
      className="pmodal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="pmodal-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pmodal-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="pmodal-header">
          <div className="pmodal-header-left">
            <div className="pmodal-pill-tag">
              <span className="pmodal-live-dot" />
              <span>SIMULATION PREDICTION</span>
            </div>
            <h2 id="pmodal-title" className="pmodal-heading">
              Weekly Target Forecast
            </h2>
            <p className="pmodal-subheading">
              Balaghat Sector • Target baseline: <strong>{formatTonnes(forecast.target_tonnes)} tonnes</strong>
            </p>
          </div>
          <button
            type="button"
            className="pmodal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Modal Content */}
        <div className="pmodal-body">
          {/* Executive Outcome Banner */}
          <div className={`pmodal-banner ${onTrack ? "banner-success" : "banner-danger"}`}>
            <div className="pmodal-banner-icon-box">
              {onTrack ? (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              ) : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
              )}
            </div>
            <div className="pmodal-banner-text">
              <div className="pmodal-banner-headline">
                {onTrack
                  ? `Target On Track — Surplus of +${formatTonnes(forecast.gap_tonnes)} t`
                  : `Shortfall Expected — Deficit of -${formatTonnes(Math.abs(forecast.gap_tonnes))} t`}
              </div>
              <div className="pmodal-banner-desc">
                {onTrack
                  ? `Weekly predicted output reaches ${formatTonnes(forecast.predicted_weekly_production)} tonnes (${forecast.achievement_pct.toFixed(1)}% of weekly goal). Capacity buffer is healthy.`
                  : `Weekly predicted output is ${formatTonnes(forecast.predicted_weekly_production)} tonnes (${forecast.achievement_pct.toFixed(1)}% of goal). Corrective action recommended.`}
              </div>
            </div>
          </div>

          {/* 4 Scorecard KPI Metrics */}
          <div className="pmodal-metrics-grid">
            {/* Metric 1 */}
            <div className="pmodal-kpi-card">
              <div className="pmodal-kpi-top">
                <span className="pmodal-kpi-label">Weekly Target</span>
                <span className="pmodal-kpi-badge neutral">Baseline</span>
              </div>
              <div className="pmodal-kpi-value">{formatTonnes(forecast.target_tonnes)} <span className="pmodal-unit">t</span></div>
              <div className="pmodal-kpi-footer">Planned goal</div>
            </div>

            {/* Metric 2 */}
            <div className="pmodal-kpi-card highlight-blue">
              <div className="pmodal-kpi-top">
                <span className="pmodal-kpi-label">Predicted Output</span>
                <span className="pmodal-kpi-badge primary">ML Forecast</span>
              </div>
              <div className="pmodal-kpi-value text-blue">{formatTonnes(forecast.predicted_weekly_production)} <span className="pmodal-unit">t</span></div>
              <div className="pmodal-kpi-footer">Simulation output</div>
            </div>

            {/* Metric 3 */}
            <div className={`pmodal-kpi-card ${above ? "highlight-green" : "highlight-red"}`}>
              <div className="pmodal-kpi-top">
                <span className="pmodal-kpi-label">{above ? "Expected Surplus" : "Expected Gap"}</span>
                <span className={`pmodal-kpi-badge ${above ? "success" : "danger"}`}>{above ? "Buffer" : "Shortfall"}</span>
              </div>
              <div className={`pmodal-kpi-value ${above ? "text-green" : "text-red"}`}>
                {formatGap(forecast.gap_tonnes)} <span className="pmodal-unit">t</span>
              </div>
              <div className="pmodal-kpi-footer">{above ? "Net margin" : "Deficit volume"}</div>
            </div>

            {/* Metric 4 */}
            <div className={`pmodal-kpi-card ${forecast.achievement_pct >= 100 ? "highlight-green" : "highlight-amber"}`}>
              <div className="pmodal-kpi-top">
                <span className="pmodal-kpi-label">Achievement</span>
                <span className={`pmodal-kpi-badge ${forecast.achievement_pct >= 100 ? "success" : "warning"}`}>
                  {forecast.achievement_pct >= 100 ? "Goal Met" : "At Risk"}
                </span>
              </div>
              <div className={`pmodal-kpi-value ${forecast.achievement_pct >= 100 ? "text-green" : "text-amber"}`}>
                {forecast.achievement_pct.toFixed(1)}<span className="pmodal-unit">%</span>
              </div>
              <div className="pmodal-kpi-footer">Fulfillment rate</div>
            </div>
          </div>

          {/* Visual Dual Comparison Progress Bars */}
          <div className="pmodal-comparison-box">
            <div className="pmodal-comp-header">
              <span className="pmodal-comp-title">Target vs Output Fulfillment</span>
              <span className={`pmodal-fulfillment-pill ${above ? "good" : "warn"}`}>
                {forecast.achievement_pct.toFixed(1)}% Achieved
              </span>
            </div>
            
            <div className="pmodal-bars-wrapper">
              {/* Predicted Bar */}
              <div className="pmodal-bar-item">
                <div className="pmodal-bar-label-line">
                  <span className="pmodal-bar-title">
                    <span className="pmodal-bar-indicator blue"></span>
                    Predicted Weekly
                  </span>
                  <span className="pmodal-bar-num blue">{formatTonnes(forecast.predicted_weekly_production)} t</span>
                </div>
                <div className="pmodal-track">
                  <div
                    className="pmodal-fill predicted-fill"
                    style={{ width: `${predPct}%` }}
                  />
                </div>
              </div>

              {/* Target Bar */}
              <div className="pmodal-bar-item">
                <div className="pmodal-bar-label-line">
                  <span className="pmodal-bar-title">
                    <span className="pmodal-bar-indicator slate"></span>
                    Target Baseline
                  </span>
                  <span className="pmodal-bar-num slate">{formatTonnes(forecast.target_tonnes)} t</span>
                </div>
                <div className="pmodal-track">
                  <div
                    className="pmodal-fill target-fill"
                    style={{ width: `${tgtPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Input Conditions Chips */}
          <div className="pmodal-chips-bar">
            <span className="pmodal-chip-item">
              <span>⚙️</span> Downtime: <strong>{downtimePct}%</strong>
            </span>
            <span className="chip-sep">•</span>
            <span className="pmodal-chip-item">
              <span>⏱️</span> Blast Delay: <strong>{delayHours} hrs</strong>
            </span>
            <span className="chip-sep">•</span>
            <span className="pmodal-chip-item">
              <span>🌧️</span> Rainfall: <strong>{forecast.rainfall_mm.toFixed(1)} mm ({useLive ? "Live" : "Mean"})</strong>
            </span>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="pmodal-footer">
          <button
            type="button"
            className="pmodal-btn-cancel"
            onClick={onClose}
          >
            Dismiss
          </button>
          <button
            type="button"
            className="pmodal-btn-action"
            onClick={onScrollToDetails}
          >
            <span>View Full Breakdown Below</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}

// Shared target/prediction/gap/achievement block, used by both the current
// forecast and the what-if scenario so the numbers read with high visual impact.
function ForecastResult({ forecast, showBars = true }) {
  const max = Math.max(
    forecast.predicted_weekly_production,
    forecast.target_tonnes,
    1
  );
  const above = forecast.gap_tonnes >= 0;
  const onTrack = forecast.status === "On Track";
  const predPct = Math.min((forecast.predicted_weekly_production / max) * 100, 100);
  const tgtPct = Math.min((forecast.target_tonnes / max) * 100, 100);

  return (
    <div className="forecast-result-card-wrap">
      <div className="forecast-scorecard-grid">
        <div className="forecast-metric-card">
          <div className="metric-card-top">
            <span className="metric-icon">🎯</span>
            <span className="metric-badge">Target</span>
          </div>
          <span className="metric-title">Weekly Target</span>
          <span className="metric-number">
            {formatTonnes(forecast.target_tonnes)} t
          </span>
          <span className="metric-hint">Planned threshold</span>
        </div>

        <div className="forecast-metric-card highlight-card">
          <div className="metric-card-top">
            <span className="metric-icon">⚡</span>
            <span className="metric-badge badge-primary">Predicted</span>
          </div>
          <span className="metric-title">Predicted Output</span>
          <span className="metric-number text-primary">
            {formatTonnes(forecast.predicted_weekly_production)} t
          </span>
          <span className="metric-hint">ML model estimate</span>
        </div>

        <div
          className={`forecast-metric-card ${
            above ? "tone-good-card" : "tone-bad-card"
          }`}
        >
          <div className="metric-card-top">
            <span className="metric-icon">{above ? "📈" : "📉"}</span>
            <span className={`metric-badge ${above ? "badge-good" : "badge-bad"}`}>
              {above ? "Surplus" : "Gap"}
            </span>
          </div>
          <span className="metric-title">
            {above ? "Expected Surplus" : "Expected Gap"}
          </span>
          <span className={`metric-number ${above ? "text-good" : "text-bad"}`}>
            {formatGap(forecast.gap_tonnes)} t
          </span>
          <span className="metric-hint">
            {above ? "Net buffer tonnage" : "Shortfall tonnage"}
          </span>
        </div>

        <div className="forecast-metric-card">
          <div className="metric-card-top">
            <span className="metric-icon">📊</span>
            <span className="metric-badge">Fulfilment</span>
          </div>
          <span className="metric-title">Target Achievement</span>
          <span className="metric-number">
            {forecast.achievement_pct.toFixed(1)}%
          </span>
          <span className="metric-hint">
            {forecast.achievement_pct >= 100
              ? "Goal exceeded"
              : "Shortfall expected"}
          </span>
        </div>

        <div className="forecast-metric-card status-metric-card">
          <div className="metric-card-top">
            <span className="metric-icon">{onTrack ? "✅" : "⚠️"}</span>
            <span className="metric-badge">Evaluation</span>
          </div>
          <span className="metric-title">Operating Status</span>
          <div className="status-metric-wrap">
            <StatusBadge
              status={forecast.status}
              tone={onTrack ? "good" : "bad"}
            />
          </div>
          <span className="metric-hint">
            {onTrack ? "Production on pace" : "Action plan suggested"}
          </span>
        </div>
      </div>

      {showBars && (
        <div className="weekly-bars-enhanced">
          <div className="bars-head">
            <span className="bars-title">Production vs Target Fulfilment</span>
            <span
              className={`achievement-pill ${
                above ? "pill-good" : "pill-warn"
              }`}
            >
              {forecast.achievement_pct.toFixed(1)}% of Target
            </span>
          </div>
          <div className="weekly-bars-list">
            <div className="weekly-bar-row">
              <div className="weekly-bar-meta">
                <span className="weekly-bar-label">
                  <span className="dot dot-blue" /> Predicted Output
                </span>
                <span className="weekly-bar-val text-primary">{formatTonnes(forecast.predicted_weekly_production)} t</span>
              </div>
              <div className="weekly-bar-track">
                <div
                  className="weekly-bar-fill predicted-fill"
                  style={{ width: `${predPct}%` }}
                />
              </div>
            </div>

            <div className="weekly-bar-row">
              <div className="weekly-bar-meta">
                <span className="weekly-bar-label">
                  <span className="dot dot-slate" /> Weekly Target
                </span>
                <span className="weekly-bar-val text-muted">{formatTonnes(forecast.target_tonnes)} t</span>
              </div>
              <div className="weekly-bar-track">
                <div
                  className="weekly-bar-fill target-fill"
                  style={{ width: `${tgtPct}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ShortfallAlert({ forecast }) {
  if (forecast.status !== "Shortfall Expected") return null;
  return (
    <AlertBanner severity="high" title="Shortfall Alert" dismissible>
      Predicted production is {formatTonnes(forecast.predicted_weekly_production)} t
      — {forecast.shortage_pct.toFixed(1)}% below the{" "}
      {formatTonnes(forecast.target_tonnes)} t weekly target.
    </AlertBanner>
  );
}

// Modelled loss contributions from the transparent operational-loss layer.
function DriverBreakdown({ drivers, tip }) {
  const rows = (drivers || [])
    .map((d) => ({ ...d, tonnes: d.weekly_tonnes ?? d.loss_tonnes ?? 0 }))
    .filter((d) => d.tonnes > 0)
    .sort((a, b) => b.tonnes - a.tonnes);

  if (rows.length === 0) {
    return (
      <p className="muted">
        All operational inputs are within their normal ranges, so no material
        shortfall driver is identified for this scenario.
      </p>
    );
  }

  const total = rows.reduce((sum, d) => sum + d.tonnes, 0);
  const max = rows[0].tonnes;

  return (
    <div className="driver-chart">
      <p className="driver-head">
        Dominant factor: <strong>{rows[0].label}</strong>
        {tip && (
          <InfoTip text={tip} label="How to read these contributions" />
        )}
      </p>
      {rows.map((d, index) => (
        <div className="driver-row" key={d.key}>
          <span className="driver-label">
            {d.label}
            <span className="driver-rank">
              {index === 0 ? "dominant" : "supporting"}
            </span>
          </span>
          <span className="driver-track">
            <span
              className="driver-fill"
              style={{ width: `${(d.tonnes / max) * 100}%` }}
            />
          </span>
          <span className="driver-value">
            {formatTonnes(d.tonnes)} t/wk · {Math.round((d.tonnes / total) * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

// Ordered equipment-redeployment suggestions for a predicted shortfall, with the
// heuristic assumption stated explicitly so the numbers are never read as measured.
// This is decision support only: the Production Manager approves or dismisses the
// plan locally, and nothing is moved automatically.
function RedeploymentPlan({ plan, status, statusAt, onApprove, onDismiss }) {
  const approved = status === "approved";
  const dismissed = status === "dismissed";
  const planClass = [
    "redeploy-plan",
    approved ? "approved" : "",
    dismissed ? "dismissed" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={planClass}>
      <h6 className="redeploy-title">
        Equipment Redeployment Suggestion <DataBadge kind="scenario" label="Heuristic" />
      </h6>

      <h6 className="redeploy-suggested-label">
        Suggested Action Plan (for Production Manager review)
      </h6>

      {plan.moves.length === 0 ? (
        <p className="muted">
          {plan.note || "No redeployment moves suggested."}
        </p>
      ) : (
        <ol className={`redeploy-list${dismissed ? " collapsed" : ""}`}>
          {plan.moves.map((move, index) => (
            <li key={`${move.from_pit_id}-${move.to_pit_id}-${index}`}>
              Move equipment from <strong>{move.from_pit_id}</strong> (
              {move.from_risk} Risk) → <strong>{move.to_pit_id}</strong> (
              {move.to_risk} Risk) — estimated{" "}
              <strong>
                +{formatTonnes1(move.estimated_contribution_tonnes)} tonnes/week
              </strong>
            </li>
          ))}
        </ol>
      )}

      <p className="redeploy-summary">
        Estimated recovery: {formatTonnes1(plan.total_estimated_recovery_tonnes)} of{" "}
        {formatTonnes1(plan.shortfall_gap)} tonnes shortfall
      </p>

      {plan.fully_covered ? (
        <p className="redeploy-covered">
          ✓ This plan can fully cover the predicted shortfall
        </p>
      ) : (
        <p className="redeploy-partial">
          This plan covers part of the shortfall — remaining gap:{" "}
          {formatTonnes1(plan.gap_still_remaining_tonnes)} tonnes, consider
          adjusting the target or investigating additional equipment availability
        </p>
      )}

      <p className="redeploy-disclaimer">
        This is a decision-support recommendation based on the current model
        output. Final scheduling and safety checks remain with the Production
        Manager before any equipment is moved.
      </p>

      <p className="provenance-detail">{plan.disclaimer}</p>
      {plan.assumptions && (
        <p className="provenance-detail">
          Heuristic assumption: one redeployed equipment share adds{" "}
          {Math.round(plan.assumptions.uplift_frac_of_receiving_cell * 100)}% of the
          receiving cell's expected output — an assumption, not a measured value.
        </p>
      )}

      <div className="redeploy-actions">
        <button type="button" className="btn btn-primary" onClick={onApprove}>
          Approve Plan
        </button>
        <button type="button" className="btn btn-outline" onClick={onDismiss}>
          Dismiss
        </button>
      </div>

      {approved && (
        <p className="redeploy-status approved">
          Plan marked as approved by Production Manager — {formatTimestamp(statusAt)}
        </p>
      )}
      {dismissed && (
        <p className="redeploy-status dismissed">
          Plan dismissed — {formatTimestamp(statusAt)}
        </p>
      )}
    </div>
  );
}

function RainfallLine({ forecast }) {
  return (
    <p className="provenance-line">
      Rainfall <strong>{forecast.rainfall_mm.toFixed(1)} mm</strong> ·{" "}
      {forecast.rainfall_period} · source: {forecast.rainfall_source}
      {forecast.rainfall_fetched_at
        ? ` · fetched ${formatTimestamp(forecast.rainfall_fetched_at)}`
        : ""}
      <span className="provenance-detail">({forecast.rainfall_source_detail})</span>
    </p>
  );
}

function ProductionPlanning() {
  const [downtimePct, setDowntimePct] = useState(10);
  const [delayHours, setDelayHours] = useState(6);
  const [useLive, setUseLive] = useState(true);
  const [language, setLanguage] = useState("en");

  // --- Live what-if cell map (auto-runs as sliders move) ---
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // --- Current forecast at normal operating conditions ---
  const [current, setCurrent] = useState(null);
  const [currentLoading, setCurrentLoading] = useState(true);
  const [currentError, setCurrentError] = useState(null);

  // --- Weekly target prediction (button-driven only) ---
  const [targetInput, setTargetInput] = useState("");
  const [targetResult, setTargetResult] = useState(null);
  const [predictedInputs, setPredictedInputs] = useState(null);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState(null);
  const [showResultModal, setShowResultModal] = useState(false);
  // Seeded from the backend's planned weekly target, but never after the user
  // has typed into the field.
  const targetTouchedRef = useRef(false);

  // --- Equipment redeployment plan (button-driven, for a predicted shortfall) ---
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState(null);
  // Decision-support acknowledgement, local to the frontend only. It resets to
  // "unset" whenever a new plan is built, so an old approval never carries over.
  const [planStatus, setPlanStatus] = useState("unset");
  const [planStatusAt, setPlanStatusAt] = useState(null);

  const resetPlanStatus = useCallback(() => {
    setPlanStatus("unset");
    setPlanStatusAt(null);
  }, []);

  const approvePlan = useCallback(() => {
    setPlanStatus("approved");
    setPlanStatusAt(new Date().toISOString());
  }, []);

  const dismissPlan = useCallback(() => {
    setPlanStatus("dismissed");
    setPlanStatusAt(new Date().toISOString());
  }, []);

  const { speakText, stopSpeech } = useSpeech(language);

  const runSimulation = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiPost("/api/production-simulator-cells", {
        equipment_downtime_pct: Number(downtimePct),
        blast_delay_hours: Number(delayHours),
        use_live_rainfall: useLive,
        language,
      });
      stopSpeech(); // reasons may have changed - drop stale audio
      setResult(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [downtimePct, delayHours, useLive, language, stopSpeech]);

  // Debounced re-run so dragging the sliders updates the cell map live.
  useEffect(() => {
    const timer = setTimeout(runSimulation, 250);
    return () => clearTimeout(timer);
  }, [runSimulation]);

  const runCurrentForecast = useCallback(async () => {
    setCurrentLoading(true);
    setCurrentError(null);
    try {
      setCurrent(
        await apiPost("/api/current-forecast", {
          use_live_rainfall: true,
          language,
        })
      );
    } catch (err) {
      setCurrentError(err.message);
    } finally {
      setCurrentLoading(false);
    }
  }, [language]);

  useEffect(() => {
    runCurrentForecast();
  }, [runCurrentForecast]);

  // Seed the target field with the planned weekly target so it is never blank,
  // without overwriting anything the user typed.
  useEffect(() => {
    if (current && !targetTouchedRef.current && targetInput === "") {
      setTargetInput(String(Math.round(current.target_tonnes)));
    }
  }, [current, targetInput]);

  const parsedTarget = Number(targetInput);
  const targetValid =
    targetInput.trim() !== "" && Number.isFinite(parsedTarget) && parsedTarget > 0;

  // Button-driven prediction: never runs on slider change, so this card stays
  // distinct from the cell map, which does update live.
  const runPrediction = useCallback(
    async (langOverride, openModal = true) => {
      const lang = langOverride || language;
      if (!targetValid) return;
      setTargetLoading(true);
      setTargetError(null);
      try {
        const data = await apiPost("/api/weekly-target-prediction", {
          target_tonnes: Number(targetInput),
          equipment_downtime_pct: Number(downtimePct),
          blast_delay_hours: Number(delayHours),
          use_live_rainfall: useLive,
          language: lang,
        });
        stopSpeech(); // the previous explanation may be mid-read
        setTargetResult(data);
        setPredictedInputs({ targetInput, downtimePct, delayHours, useLive });
        if (openModal) {
          setShowResultModal(true);
        }
        // The previous plan referred to the previous prediction's cells.
        setPlan(null);
        setPlanError(null);
        resetPlanStatus();
      } catch (err) {
        setTargetError(err.message);
      } finally {
        setTargetLoading(false);
      }
    },
    [targetValid, targetInput, downtimePct, delayHours, useLive, language,
     stopSpeech, resetPlanStatus]
  );

  const handleScrollToDetails = useCallback(() => {
    setShowResultModal(false);
    setTimeout(() => {
      const el = document.getElementById("weekly-target-prediction-section");
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
        el.classList.add("highlight-flash");
        setTimeout(() => el.classList.remove("highlight-flash"), 2500);
      }
    }, 120);
  }, []);

  const handleLanguageChange = (e) => {
    const lang = e.target.value;
    stopSpeech();
    setLanguage(lang);
    // Keep an existing explanation in the newly selected language; sliders are
    // deliberately NOT handled this way (they only show the recalculate prompt).
    if (targetResult && targetValid) runPrediction(lang);
  };

  const isStale =
    targetResult != null &&
    predictedInputs != null &&
    (predictedInputs.targetInput !== targetInput ||
      predictedInputs.downtimePct !== downtimePct ||
      predictedInputs.delayHours !== delayHours ||
      predictedInputs.useLive !== useLive);

  const cells = result?.pits ?? EMPTY;
  const counts = result?.counts;
  const thresholds = result?.risk_thresholds_pct;

  // A plan is only valid for the cell results it was built from, so a stale
  // prediction retires it rather than highlighting the wrong cells on the map.
  const activePlan = isStale ? null : plan;

  const planFromIds = useMemo(
    () => new Set((activePlan?.moves ?? EMPTY).map((move) => move.from_pit_id)),
    [activePlan]
  );
  const planToIds = useMemo(
    () => new Set((activePlan?.moves ?? EMPTY).map((move) => move.to_pit_id)),
    [activePlan]
  );

  const requestPlan = useCallback(async () => {
    if (!targetResult || cells.length === 0) return;
    setPlanLoading(true);
    setPlanError(null);
    // A freshly built plan starts unacknowledged.
    resetPlanStatus();
    try {
      setPlan(await apiPost("/api/shortfall-redeployment-plan", {
        target_tonnes: targetResult.target_tonnes,
        predicted_tonnes: targetResult.predicted_weekly_production,
        current_pit_results: cells.map((cell) => ({
          pit_id: cell.unit_id,
          expected_production: cell.expected_production,
          risk_level: cell.risk_level,
        })),
      }));
    } catch (err) {
      setPlanError(err.message);
    } finally {
      setPlanLoading(false);
    }
  }, [targetResult, cells, resetPlanStatus]);

  return (
    <>
      {/* High/Medium/Low counts + total, all from the same response that colours
          the map below. */}
      <div className="cards pit-summary-cards">
        <KpiCard
          tone="high"
          value={counts ? counts.High : "—"}
          label="High-risk cells"
          hint={`>${thresholds?.high ?? 20}% below target`}
        />
        <KpiCard
          tone="medium"
          value={counts ? counts.Medium : "—"}
          label="Medium-risk cells"
          hint={`${thresholds?.medium ?? 5}–${thresholds?.high ?? 20}% below target`}
        />
        <KpiCard
          tone="low"
          value={counts ? counts.Low : "—"}
          label="Low-risk cells"
          hint={`<${thresholds?.medium ?? 5}% below target`}
        />
        <KpiCard
          value={result?.monitored_units ?? "—"}
          label="Monitored grid cells"
          hint="Aggregated ~1.67 km satellite cells, not surveyed mine pits"
        />
      </div>

      <Section
        step="PREDICTION"
        title="Current Forecast"
        subtitle="Model output at normal operating assumptions with current rainfall — the as-is baseline, before any what-if inputs."
      >
        {currentLoading && <Loader message="Loading current forecast…" />}
        {currentError && (
          <ErrorState
            message="Failed to load the current forecast."
            hint={currentError}
          />
        )}
        {!currentLoading && !currentError && current && (
          <div className="forecast-card">
            <ShortfallAlert forecast={current} />
            <ForecastResult forecast={current} showBars={false} />
            <p className="provenance-line">{current.disclaimer}</p>
            <RainfallLine forecast={current} />
            <p className="provenance-line">
              Operating assumptions: equipment downtime{" "}
              {current.assumptions?.equipment_downtime_pct}% · blast delay{" "}
              {current.assumptions?.blast_delay_hours} h
            </p>
          </div>
        )}
      </Section>

      <Section
        step="INPUT DATA → MODEL"
        title="What-if Scenario"
        subtitle="Hypothetical operating conditions you choose. Changing these sliders does not describe observed production."
        actions={<DataBadge kind="scenario" />}
      >
        <div className="simulator">
          <div className="sim-controls">
            <div className="sim-controls-header">
              <h4 className="sim-controls-title">⚙️ Scenario Simulator Controls</h4>
              <p className="sim-controls-subtitle">
                Adjust operational variables to simulate mine production forecast
              </p>
            </div>

            <div className="sim-slider-box">
              <label className="sim-field">
                <span className="field-label-row">
                  <span>Equipment Downtime %</span>
                  <strong className="field-val-pill">{downtimePct}%</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="30"
                  step="1"
                  value={downtimePct}
                  onChange={(e) => setDowntimePct(Number(e.target.value))}
                />
                <span className="field-ticks">
                  <span>0% (Optimal)</span>
                  <span>15%</span>
                  <span>30% (Severe)</span>
                </span>
              </label>

              <label className="sim-field">
                <span className="field-label-row">
                  <span>Blast Delay Hours</span>
                  <strong className="field-val-pill">{delayHours} hrs</strong>
                </span>
                <input
                  type="range"
                  min="0"
                  max="48"
                  step="1"
                  value={delayHours}
                  onChange={(e) => setDelayHours(Number(e.target.value))}
                />
                <span className="field-ticks">
                  <span>0h (No delay)</span>
                  <span>24h</span>
                  <span>48h (Max delay)</span>
                </span>
              </label>
            </div>

            <div className="sim-options-grid">
              <label className="sim-toggle-pill">
                <input
                  type="checkbox"
                  checked={useLive}
                  onChange={(e) => setUseLive(e.target.checked)}
                />
                <span className="toggle-label">
                  Use live Balaghat rainfall (CHIRPS: 456.2 mm)
                </span>
              </label>

              <label className="sim-field-compact">
                <span>Reason language</span>
                <select value={language} onChange={handleLanguageChange}>
                  {LANGUAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Dedicated Target Input & Predict Action Card */}
            <div className="sim-target-action-card">
              <div className="target-input-head">
                <span className="target-card-icon">🎯</span>
                <div>
                  <strong>Weekly Production Target</strong>
                  <span className="target-card-sub">
                    Choose goal tonnes to simulate surplus or shortfall
                  </span>
                </div>
              </div>

              <div className="target-input-group">
                <div className="target-input-wrap">
                  <input
                    type="number"
                    min="1"
                    step="100"
                    placeholder="e.g. 10000"
                    value={targetInput}
                    onChange={(e) => {
                      targetTouchedRef.current = true;
                      setTargetInput(e.target.value);
                    }}
                  />
                  <span className="target-unit-tag">tonnes</span>
                </div>

                <div className="target-presets">
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() => {
                      targetTouchedRef.current = true;
                      setTargetInput("10000");
                    }}
                  >
                    10k t
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() => {
                      targetTouchedRef.current = true;
                      setTargetInput("12000");
                    }}
                  >
                    12k t
                  </button>
                  <button
                    type="button"
                    className="preset-btn"
                    onClick={() => {
                      targetTouchedRef.current = true;
                      setTargetInput("15000");
                    }}
                  >
                    15k t
                  </button>
                </div>
              </div>

              <button
                type="button"
                className="btn btn-primary btn-run-prediction"
                onClick={() => runPrediction(undefined, true)}
                disabled={!targetValid || targetLoading}
              >
                {targetLoading ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    <span>Predicting Target Simulation…</span>
                  </>
                ) : (
                  <>
                    <span className="btn-icon">⚡</span>
                    <span>Predict & Simulate Weekly Target</span>
                  </>
                )}
              </button>

              {isStale && (
                <p className="weekly-stale">
                  ⚠️ Recalculate for updated inputs (sliders changed since this prediction).
                </p>
              )}

              {!useLive && (
                <p className="provenance-detail">
                  Live rainfall off — using historical monthly mean.
                </p>
              )}
            </div>
          </div>

          <div className="sim-map-panel">
            <div className="sim-map-head">
              <h4>Grid-cell production risk</h4>
              <span className="muted">
                {result?.unit?.label ?? "prediction grid cells"}
              </span>
            </div>

            {error && (
              <ErrorState message="Scenario map failed to calculate." hint={error} />
            )}
            {!error && cells.length === 0 && (
              <Loader message="Calculating cell risk…" />
            )}
            {cells.length > 0 && (
              <>
                {result.high_risk_alert && (
                  <AlertBanner
                    severity="high"
                    title="High-risk area alert"
                    dismissible
                  >
                    {counts.High} of {result.monitored_units} monitored grid cells
                    are showing high shortfall risk under the current scenario
                    inputs ({result.high_risk_share_pct}% — alert threshold{" "}
                    {result.high_risk_alert_threshold_pct}%).
                  </AlertBanner>
                )}
                <CellRiskMap
                  aoi={result.aoi}
                  cells={cells}
                  onSpeak={speakText}
                  planFrom={planFromIds}
                  planTo={planToIds}
                />
                <Legend
                  items={riskLegendItems(thresholds)}
                  note={result.unit?.cell_size_note}
                />
                <p className="provenance-detail">{result.unit?.note}</p>
              </>
            )}
            {loading && cells.length > 0 && (
              <p className="muted status-line">
                <span className="spinner" aria-hidden="true" /> Updating cells…
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section
        id="weekly-target-prediction-section"
        step="PREDICTION"
        title="Weekly Target Prediction"
        subtitle="Compare the forecast against a target you choose. Results appear only after you press Predict."
      >
        {targetError && (
          <ErrorState message="Prediction failed." hint={targetError} />
        )}

        {!targetResult && !targetError && (
          <EmptyState>
            Set a weekly target above and press “Predict weekly target” to see the
            forecast, gap and target achievement.
          </EmptyState>
        )}

        {targetResult && (
          <div className="weekly-result">
            <div className="weekly-result-head">
              <h5>
                Predicted weekly production vs the{" "}
                {formatTonnes(targetResult.target_tonnes)} t target
              </h5>
            </div>

            <ShortfallAlert forecast={targetResult} />
            <ForecastResult forecast={targetResult} />

            <RainfallLine forecast={targetResult} />
            <p className="provenance-detail">{targetResult.disclaimer}</p>

            {targetResult.status === "Shortfall Expected" && (
              <div className="redeploy-block">
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={requestPlan}
                  disabled={planLoading || isStale || cells.length === 0}
                >
                  {planLoading
                    ? "Building plan…"
                    : "Suggest Equipment Redeployment Plan"}
                </button>

                {isStale && (
                  <p className="provenance-detail">
                    Recalculate the prediction first — the plan is built from the
                    cell results for the current inputs.
                  </p>
                )}
                {!isStale && cells.length === 0 && (
                  <p className="provenance-detail">
                    Waiting for the cell risk results to load.
                  </p>
                )}

                {planError && (
                  <ErrorState
                    message="Could not build a redeployment plan."
                    hint={planError}
                  />
                )}

                {activePlan && (
                  <RedeploymentPlan
                    plan={activePlan}
                    status={planStatus}
                    statusAt={planStatusAt}
                    onApprove={approvePlan}
                    onDismiss={dismissPlan}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </Section>

      {targetResult && (
        <>
          <Section
            step="EXPLANATION"
            title="Why — dominant factor"
            actions={
              <VoiceButton
                onClick={(e) =>
                  speakText(targetResult.explanation, e.currentTarget)
                }
                label="Read explanation aloud"
              />
            }
          >
            <p className="xai-sentence">{targetResult.explanation}</p>
            <DriverBreakdown
              drivers={targetResult.drivers}
              tip={CONTRIBUTION_DISCLAIMER}
            />
          </Section>

          <Section step="ACTION" title="Recommended corrective action">
            <p className="action-line">{targetResult.recommended_action}</p>
            {targetResult.reserve_richness_index < 1 && (
              <p className="provenance-detail">
                Reserve richness index {targetResult.reserve_richness_index} — the
                AOI's average predicted reserve probability is below the
                high-grade reference used by this model.
              </p>
            )}
          </Section>
        </>
      )}

      <PredictionResultModal
        forecast={targetResult}
        open={showResultModal}
        onClose={() => setShowResultModal(false)}
        onScrollToDetails={handleScrollToDetails}
        downtimePct={downtimePct}
        delayHours={delayHours}
        useLive={useLive}
      />
    </>
  );
}

export function ProductionManagerView() {
  return (
    <div className="view">
      <h2>Production Planning</h2>
      <p className="view-intro">
        Weekly production forecast, operational what-if scenarios and grid-cell
        shortfall risk for the Balaghat block.
      </p>
      <ProductionPlanning />
      <PendingApprovalsPanel userRole="Production Manager" />
    </div>
  );
}
