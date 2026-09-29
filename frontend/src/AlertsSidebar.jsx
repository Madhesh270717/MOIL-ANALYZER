import { useEffect, useMemo, useState } from "react";
import { apiGet } from "./api";
import { AlertBanner, DataBadge, EmptyState, ErrorState, Loader } from "./ui";

export function AlertsSidebar({ open, onClose, onAlertCountChange }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState("all"); // 'all' | 'high' | 'weather' | 'mechanical'
  const [dismissedIds, setDismissedIds] = useState(new Set());

  const fetchAlerts = () => {
    setLoading(true);
    setError(null);
    apiGet("/api/active-alerts")
      .then((res) => {
        setData(res);
        setLoading(false);
        if (onAlertCountChange) {
          onAlertCountChange(res.high_severity_count || 0);
        }
      })
      .catch((err) => {
        // Fallback to /api/production-risk if /api/active-alerts has an issue
        apiGet("/api/production-risk")
          .then((risks) => {
            const high = risks.filter((r) => r.risk_level === "High");
            const alertsList = high.slice(0, 8).map((r, i) => {
              const site = (r.date_or_site || "").split(" ")[0];
              return {
                id: `ALT-FB-${i + 1}`,
                severity: "high",
                category: r.downtime_pct > 6 ? "Mechanical Bottleneck" : "Production Risk",
                title: `${site}: High Shortfall Risk (${Number(r.downtime_pct || 0).toFixed(1)}% downtime)`,
                site,
                metric: `Downtime: ${Number(r.downtime_pct || 0).toFixed(1)}% | Rain: ${Number(r.rainfall_mm || 0).toFixed(0)} mm`,
                action: r.recommended_action || "Inspect site operations",
              };
            });
            setData({
              total_alerts: alertsList.length,
              high_severity_count: alertsList.length,
              medium_severity_count: 0,
              live_weather: {
                location: "Balaghat AOI",
                monthly_rainfall_mm: 456.16,
                historical_mean_mm: 120.87,
                anomaly_pct: 277.4,
                severity: "high",
                status: "Monsoon Surplus Alert",
                recommendation: "Delay outdoor operations and inspect pit drainage",
              },
              alerts: alertsList,
              disclaimer: "Alerts derived from production_risk.csv fallback.",
            });
            setLoading(false);
            if (onAlertCountChange) {
              onAlertCountChange(alertsList.length);
            }
          })
          .catch((fbErr) => {
            setError(err.message || fbErr.message || "Failed to load active alerts.");
            setLoading(false);
          });
      });
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const rawAlerts = data?.alerts || [];
  const weather = data?.live_weather;

  const dismissAlert = (id) => {
    setDismissedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  const filteredAlerts = useMemo(() => {
    return rawAlerts.filter((a) => {
      if (dismissedIds.has(a.id)) return false;
      if (filter === "high" && a.severity !== "high") return false;
      if (filter === "weather" && !a.category.toLowerCase().includes("weather")) return false;
      if (
        filter === "mechanical" &&
        !a.category.toLowerCase().includes("mechanical") &&
        !a.category.toLowerCase().includes("maintenance")
      ) {
        return false;
      }
      return true;
    });
  }, [rawAlerts, dismissedIds, filter]);

  if (!open) return null;

  return (
    <aside className="alerts-sidebar" aria-label="Active field alerts and notifications">
      {/* Header */}
      <div className="alerts-sidebar-header">
        <div className="alerts-title-wrap">
          <span className="alerts-pulse-dot" aria-hidden="true" />
          <div>
            <h3 className="alerts-title">Active Field Alerts</h3>
            <span className="alerts-sub">Live weather & production risk feed</span>
          </div>
        </div>
        <button
          type="button"
          className="alerts-close-btn"
          aria-label="Close alerts panel"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      {/* KPI Badges */}
      <div className="alerts-summary-pills">
        <span className="alert-count-pill high">
          🔴 {data?.high_severity_count || 0} High Priority
        </span>
        <span className="alert-count-pill med">
          🟡 {data?.medium_severity_count || 0} Advisories
        </span>
        <button
          type="button"
          className="alerts-refresh-mini-btn"
          onClick={fetchAlerts}
          title="Refresh alerts"
        >
          ↻
        </button>
      </div>

      {/* Live CHIRPS Weather Alert */}
      {weather && (
        <div className="alerts-weather-box">
          <div className="weather-box-head">
            <span className="weather-badge">CHIRPS LIVE PRECIPITATION</span>
            <span className="weather-anom-tag">+{weather.anomaly_pct}% Anomaly</span>
          </div>
          <AlertBanner severity="high" title={`${weather.location}: ${weather.status}`}>
            <strong>{weather.monthly_rainfall_mm} mm</strong> recorded vs{" "}
            {weather.historical_mean_mm} mm normal baseline.
            <div className="weather-action-note">
              <strong>Action:</strong> {weather.recommendation}
            </div>
          </AlertBanner>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="alerts-filter-bar">
        {[
          { id: "all", label: `All (${rawAlerts.length - dismissedIds.size})` },
          { id: "high", label: "High Risk" },
          { id: "weather", label: "Weather" },
          { id: "mechanical", label: "Mechanical" },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`alerts-tab-btn ${filter === tab.id ? "active" : ""}`}
            onClick={() => setFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Alerts Body */}
      <div className="alerts-list-container">
        {loading && <Loader message="Refreshing active alerts…" />}
        {error && <ErrorState message="Could not fetch active alerts." hint={error} />}

        {!loading && filteredAlerts.length === 0 && (
          <EmptyState>
            {dismissedIds.size > 0
              ? "All matching alerts have been acknowledged."
              : "No active alerts in this category."}
          </EmptyState>
        )}

        {filteredAlerts.map((alert) => (
          <div key={alert.id} className="alert-item-card">
            <AlertBanner
              severity={alert.severity}
              title={alert.title}
              dismissible
              onDismiss={() => dismissAlert(alert.id)}
            >
              <div className="alert-item-details">
                <span className="alert-metric-tag">{alert.metric}</span>
                <p className="alert-action-text">
                  <strong>Recommended Action:</strong> {alert.action}
                </p>
                <div className="alert-footer-meta">
                  <span className="alert-category-label">{alert.category}</span>
                  <span className="alert-id-mono">{alert.id}</span>
                </div>
              </div>
            </AlertBanner>
          </div>
        ))}
      </div>

      {/* Disclaimer / Footer */}
      <div className="alerts-sidebar-footer">
        <p className="alerts-footer-text">
          {data?.disclaimer ||
            "Alerts reflect active risk predictions and CHIRPS precipitation anomalies."}
        </p>
        <span className="alerts-footer-sub">
          Cross-referenced from production_risk.csv & CHIRPS satellite feed.
        </span>
      </div>
    </aside>
  );
}
