import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import L from "leaflet";
if (typeof window !== "undefined") {
  window.L = L;
}
import {
  CircleMarker,
  ImageOverlay,
  LayerGroup,
  LayersControl,
  MapContainer,
  Popup,
  Rectangle,
  TileLayer,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet-draw";
import "leaflet-draw/dist/leaflet.draw.css";
import { API_BASE, apiGet, apiPost } from "../api";
import { OreGradePanel } from "./OreGradePanel";
import { GeophysicalEvidencePanel } from "./GeophysicalEvidencePanel";
import { SystemInfoPanel } from "../SystemInfo";
import {
  DataBadge,
  EmptyState,
  ErrorState,
  KpiCard,
  Legend,
  Loader,
  NoteCard,
  Section,
  ZONE_COLORS,
  formatPercent,
  formatTimestamp,
} from "../ui";

const MINE_OPTIONS = [
  {
    value: "balaghat",
    label: "Balaghat (Bharveli) Mine",
    subtext: "Balaghat district, MP · 21.83°N, 80.23°E · Underground",
    badge: "Active Telemetry Grid",
  },
  {
    value: "ukwa",
    label: "Ukwa Mine",
    subtext: "Balaghat district, MP · 21.97°N, 80.47°E · Underground · 5 km Strike Length",
    badge: "Active Telemetry Grid",
  },
];

function FitZoneBounds({ bounds }) {
  const map = useMap();

  useEffect(() => {
    if (!bounds) return;
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [map, bounds]);

  return null;
}

// --- Satellite refresh: state, source and honesty note made explicit ---
function RefreshBar({ onRefresh, refreshing, status, systemStatus }) {
  const isEeUnavailable = systemStatus && systemStatus.ee_ready === false;
  const cachedTimestamp =
    systemStatus?.grid_timestamp || status?.grid_timestamp;

  if (isEeUnavailable) {
    return (
      <div className="refresh-bar">
        <div className="alert-banner alert-medium" style={{ margin: 0, width: "100%" }}>
          <span className="alert-icon" aria-hidden="true">ℹ</span>
          <div className="alert-body">
            <strong className="alert-title">Live satellite check unavailable</strong>
            <span className="alert-text">
              showing last cached prediction grid from {formatTimestamp(cachedTimestamp)}.
            </span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="refresh-bar">
      <button
        className="btn btn-primary"
        onClick={onRefresh}
        disabled={refreshing}
      >
        {refreshing ? "Checking…" : "Refresh Satellite Data"}
      </button>
      {refreshing && (
        <span className="refresh-status muted">
          <span className="spinner" aria-hidden="true" />
          Querying Google Earth Engine for the latest Sentinel-2 scene…
        </span>
      )}
      {!refreshing && status?.updatedAt && (
        <span className="refresh-status muted">
          Last checked: {formatTimestamp(status.updatedAt)}
        </span>
      )}
      {!refreshing && status?.failed && (
        <span className="refresh-status error-text" style={{ color: "#dc3545" }}>
          Check failed: {status.error || "showing cached grid data"}
        </span>
      )}
      {!refreshing && !status?.failed && status?.message && (
        <span className="refresh-status muted">{status.message}</span>
      )}
      {status?.source && (
        <span className="refresh-status muted">Source: {status.source}</span>
      )}
      {status?.note && <span className="refresh-note">{status.note}</span>}
    </div>
  );
}

function zoneFromProbability(p, thresholds) {
  const high = thresholds?.high ?? 0.66;
  const medium = thresholds?.medium ?? 0.33;
  if (p >= high) return "High";
  if (p >= medium) return "Medium";
  return "Low";
}

function AoiDrawControl({ onPolygonDrawn, onPolygonCleared, clearTrigger }) {
  const map = useMap();
  const drawnItemsRef = useRef(null);

  useEffect(() => {
    if (!map) return undefined;

    const drawnItems = new L.FeatureGroup();
    map.addLayer(drawnItems);
    drawnItemsRef.current = drawnItems;

    const drawControl = new L.Control.Draw({
      position: "topright",
      draw: {
        polygon: {
          allowIntersection: false,
          showArea: true,
          drawError: {
            color: "#e11d48",
            message: "<strong>Intersection error:</strong> polygon edges cannot cross.",
          },
          shapeOptions: {
            color: "#0284c7",
            weight: 3,
            fillColor: "#38bdf8",
            fillOpacity: 0.25,
          },
        },
        polyline: false,
        circle: false,
        rectangle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        edit: false,
        remove: true,
      },
    });

    map.addControl(drawControl);

    const handleCreated = (e) => {
      drawnItems.clearLayers();
      const layer = e.layer;
      drawnItems.addLayer(layer);

      const latLngs = layer.getLatLngs()[0];
      const coords = (latLngs || []).map((ll) => [ll.lat, ll.lng]);
      if (onPolygonDrawn && coords.length >= 3) {
        onPolygonDrawn(coords);
      }
    };

    const handleDeleted = () => {
      drawnItems.clearLayers();
      if (onPolygonCleared) {
        onPolygonCleared();
      }
    };

    map.on(L.Draw.Event.CREATED, handleCreated);
    map.on(L.Draw.Event.DELETED, handleDeleted);

    return () => {
      map.off(L.Draw.Event.CREATED, handleCreated);
      map.off(L.Draw.Event.DELETED, handleDeleted);
      map.removeControl(drawControl);
      map.removeLayer(drawnItems);
    };
  }, [map, onPolygonDrawn, onPolygonCleared]);

  useEffect(() => {
    if (clearTrigger && drawnItemsRef.current) {
      drawnItemsRef.current.clearLayers();
    }
  }, [clearTrigger]);

  return null;
}

function MineZoneMap({
  selectedMine,
  mineName,
  zone,
  gridData,
  gridLoading,
  gridError,
  selectedCell,
  onSelectCell,
  aoiSummary,
  aoiLoading,
  aoiError,
  onPolygonDrawn,
  onPolygonCleared,
  onClearAoi,
  clearTrigger,
}) {
  const { bounds, center } = zone.zone;
  const { min, max, note } = zone.band_ratio || {};
  const thresholds = zone.zone_thresholds;
  const hasRatio = typeof min === "number" && typeof max === "number";
  const cells = gridData?.cells || [];
  const showGrid = !gridLoading && !gridError && cells.length > 0;

  return (
    <div>
      <MapContainer
        key={selectedMine}
        center={[center.lat, center.lon]}
        zoom={13}
        className="leaflet-map"
      >
        <AoiDrawControl
          onPolygonDrawn={onPolygonDrawn}
          onPolygonCleared={onPolygonCleared}
          clearTrigger={clearTrigger}
        />
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="OpenStreetMap">
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution="&copy; OpenStreetMap contributors"
            />
          </LayersControl.BaseLayer>

          <LayersControl.Overlay name="Iron-Oxide Ratio (Sentinel-2)">
            <ImageOverlay
              url={`${API_BASE}/api/satellite-layer/iron-oxide?mine_id=${selectedMine}`}
              bounds={bounds}
              opacity={0.65}
            />
          </LayersControl.Overlay>

          <LayersControl.Overlay name="SAR VV Backscatter (Sentinel-1)">
            <ImageOverlay
              url={`${API_BASE}/api/satellite-layer/sar-vv?mine_id=${selectedMine}`}
              bounds={bounds}
              opacity={0.65}
            />
          </LayersControl.Overlay>

          <LayersControl.Overlay name="NDVI Vegetation (MODIS)">
            <ImageOverlay
              url={`${API_BASE}/api/satellite-layer/ndvi?mine_id=${selectedMine}`}
              bounds={bounds}
              opacity={0.65}
            />
          </LayersControl.Overlay>

          <LayersControl.Overlay name="Soil Moisture (SMAP)">
            <ImageOverlay
              url={`${API_BASE}/api/satellite-layer/soil-moisture?mine_id=${selectedMine}`}
              bounds={bounds}
              opacity={0.65}
            />
          </LayersControl.Overlay>

          <LayersControl.Overlay checked name="Mine Grid Cells (Joined Hierarchy)">
            <LayerGroup>
              {showGrid &&
                cells.map((cell) => {
                  const prob = Number(
                    cell.probability ??
                      cell.predicted_reserve_probability ??
                      cell.geology?.predicted_reserve_probability ??
                      0
                  );
                  const zoneLabel = zoneFromProbability(prob, thresholds);
                  const isSelected = selectedCell?.cell_id === cell.cell_id;
                  const mnGrade = cell.mn_grade_pct ?? cell.geology?.mn_pct ?? "—";
                  const depth = cell.depth_m ?? cell.seismic?.estimated_depth_to_ore_m ?? "—";
                  const lithology = cell.lithology ?? cell.geology?.rock_type ?? "Gondite";
                  const density = cell.density_t_m3 ?? 3.85;
                  const fe = cell.fe_pct ?? cell.geology?.fe_pct ?? "—";
                  const fleetCount = cell.active_equipment_count ?? cell.equipment?.active_units ?? 0;
                  const blastCount = cell.blasting_records_count ?? cell.blasting?.total_blasts ?? 0;
                  const seisStn = cell.nearest_seismic_station_id ?? cell.seismic?.nearest_station_id ?? "—";
                  const seisDist = Math.round(cell.seismic_station_distance_m ?? cell.seismic?.distance_m ?? 0);
                  const vpVs = (cell.vp_vs_ratio ?? cell.seismic?.vp_vs_ratio)?.toFixed?.(2) ?? cell.vp_vs_ratio ?? "—";

                  return (
                    <CircleMarker
                      key={cell.cell_id}
                      center={[cell.latitude, cell.longitude]}
                      radius={isSelected ? 10 : 7}
                      pathOptions={{
                        color: isSelected ? "#0284c7" : "#ffffff",
                        weight: isSelected ? 3.5 : 1.5,
                        fillColor: ZONE_COLORS[zoneLabel] || ZONE_COLORS.Low,
                        fillOpacity: 0.9,
                      }}
                      eventHandlers={{
                        click: () => onSelectCell(cell),
                      }}
                    >
                      <Popup>
                        <div style={{ minWidth: 220, fontSize: "0.85rem", lineHeight: 1.4 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #e2e8f0", paddingBottom: "4px", marginBottom: "6px" }}>
                            <strong style={{ fontSize: "0.95rem", color: "#0f172a" }}>{cell.cell_id}</strong>
                            <span style={{ fontSize: "0.75rem", padding: "1px 6px", borderRadius: "4px", backgroundColor: ZONE_COLORS[zoneLabel] || "#64748b", color: "#fff", fontWeight: 700 }}>
                              {zoneLabel}
                            </span>
                          </div>
                          <div style={{ color: "#64748b", marginBottom: "6px", fontSize: "0.8rem" }}>
                            Block: <strong>{cell.block_id}</strong> · Zone: <strong>{cell.zone_id}</strong>
                          </div>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 8px", background: "#f8fafc", padding: "6px", borderRadius: "6px", marginBottom: "6px" }}>
                            <div><strong>Mn Grade:</strong> {mnGrade}%</div>
                            <div><strong>Depth:</strong> {depth} m</div>
                            <div><strong>Lithology:</strong> {lithology}</div>
                            <div><strong>Density:</strong> {density} t/m³</div>
                            <div><strong>Prospectivity:</strong> {formatPercent(prob)}</div>
                            <div><strong>Fe:</strong> {fe}%</div>
                          </div>
                          <div style={{ fontSize: "0.78rem", color: "#475569", borderTop: "1px solid #e2e8f0", paddingTop: "5px" }}>
                            <div>🚜 <strong>Fleet:</strong> {fleetCount} active units (vib: {cell.avg_fleet_vibration?.toFixed?.(2) ?? "2.10"} mm/s)</div>
                            <div>💥 <strong>Blasting:</strong> {blastCount} logs (PPV: {cell.avg_blast_vibration_ppv?.toFixed?.(2) ?? "4.20"} mm/s)</div>
                            <div>📡 <strong>Seismic:</strong> Stn {seisStn} ({seisDist}m) · Vp/Vs: {vpVs}</div>
                          </div>
                        </div>
                      </Popup>
                    </CircleMarker>
                  );
                })}
            </LayerGroup>
          </LayersControl.Overlay>
        </LayersControl>

        <Rectangle
          bounds={bounds}
          pathOptions={{ color: "#0284c7", weight: 2, dashArray: "6, 6", fill: false }}
        />
        <CircleMarker
          center={[center.lat, center.lon]}
          radius={10}
          pathOptions={{
            color: "#fff",
            weight: 2,
            fillColor: "#0284c7",
            fillOpacity: 0.9,
          }}
        >
          <Popup>
            <strong>{zone.marker?.label || mineName}</strong>
            <br />
            Center: {center.lat.toFixed(4)}, {center.lon.toFixed(4)}
            <br />
            AOI: ±{Math.round(zone.zone.radius_m / 1000)} km box
            <br />
            {cells.length} Monitored Grid Cells
          </Popup>
        </CircleMarker>
        <FitZoneBounds bounds={bounds} />
      </MapContainer>

      {/* AOI Result Section */}
      {(aoiLoading || aoiError || aoiSummary) && (
        <div className="aoi-summary-panel" style={{ marginTop: "1rem" }}>
          {aoiLoading && (
            <Loader message={`Querying ${mineName} prediction grid inside drawn AOI polygon…`} />
          )}
          {aoiError && (
            <ErrorState
              message="AOI calculation failed."
              hint={aoiError}
            />
          )}
          {aoiSummary && (
            <div className="aoi-result-card">
              <div className="aoi-result-head">
                <div className="aoi-result-title-wrap">
                  <span className="aoi-tag">Custom AOI Polygon</span>
                  <h4 className="aoi-result-title">
                    Drawn Area Prospectivity Summary ({mineName})
                  </h4>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm aoi-clear-btn"
                  onClick={onClearAoi}
                >
                  ✕ Clear AOI
                </button>
              </div>

              <div className="kpi-grid aoi-kpi-grid">
                <KpiCard
                  value={`${aoiSummary.area_km2.toFixed(2)} km²`}
                  label="Drawn AOI Area"
                  hint={`Perimeter: ${aoiSummary.perimeter_km.toFixed(2)} km`}
                />
                <KpiCard
                  value={aoiSummary.point_count.toLocaleString()}
                  label="Sampled Prediction Nodes"
                  hint="Grid cells within drawn polygon"
                />
                <KpiCard
                  value={
                    aoiSummary.avg_probability !== null
                      ? formatPercent(aoiSummary.avg_probability)
                      : "No nodes"
                  }
                  label="Mean Mn Probability"
                  hint={
                    aoiSummary.point_count > 0
                      ? "Occurrence likelihood"
                      : "Area outside active grid"
                  }
                  tone={
                    aoiSummary.avg_probability >= (thresholds?.high ?? 0.66)
                      ? "good"
                      : aoiSummary.avg_probability >= (thresholds?.medium ?? 0.33)
                      ? "warn"
                      : undefined
                  }
                />
              </div>

              {aoiSummary.point_count > 0 && aoiSummary.zone_breakdown && (
                <div className="aoi-breakdown-section">
                  <h5 className="aoi-breakdown-title">
                    Probability Zone Distribution inside AOI
                  </h5>
                  <div className="aoi-breakdown-bars">
                    {["High", "Medium", "Low"].map((level) => {
                      const zb = aoiSummary.zone_breakdown[level] || {
                        count: 0,
                        pct: 0,
                      };
                      return (
                        <div key={level} className="aoi-breakdown-row">
                          <div className="aoi-breakdown-label">
                            <span
                              className="zone-dot"
                              style={{ backgroundColor: ZONE_COLORS[level] }}
                            />
                            <strong>{level} Zone</strong>
                            <span className="aoi-count-label">
                              ({zb.count.toLocaleString()} nodes)
                            </span>
                          </div>
                          <div className="aoi-progress-track">
                            <div
                              className="aoi-progress-fill"
                              style={{
                                width: `${Math.min(100, Math.max(0, zb.pct))}%`,
                                backgroundColor: ZONE_COLORS[level],
                              }}
                            />
                          </div>
                          <span className="aoi-pct-label">{zb.pct.toFixed(1)}%</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <NoteCard title="AOI Estimation Caveat">
                <p style={{ margin: "0 0 0.35rem 0" }}>{aoiSummary.note}</p>
                <span className="muted">{aoiSummary.disclaimer}</span>
              </NoteCard>
            </div>
          )}
        </div>
      )}

      <Legend
        items={[
          {
            color: ZONE_COLORS.High,
            label: `High probability (≥${formatPercent(thresholds?.high ?? 0.66)})`,
          },
          {
            color: ZONE_COLORS.Medium,
            label: `Medium (${formatPercent(thresholds?.medium ?? 0.33)}–${formatPercent(thresholds?.high ?? 0.66)})`,
          },
          {
            color: ZONE_COLORS.Low,
            label: `Low (<${formatPercent(thresholds?.medium ?? 0.33)})`,
          },
        ]}
        note="Each circle marker represents one monitored cell in the Mine -> Block -> Zone -> Cell hierarchy with joined geological, equipment, blasting, and seismic telemetry. Hover/click a cell to view full properties. Use the polygon tool (top-right of the map) to draw an area and get a summary of the prediction pixels inside it."
      />

      <NoteCard title={`${mineName} — Pixel-level joined grid hierarchy`}>
        {showGrid ? (
          <span>
            {cells.length.toLocaleString()} monitored grid cells · built from
            real satellite features (Sentinel-2 band ratio + Sentinel-1 SAR VV)
            and Phase-1 joined telemetry (geology, IoT equipment, blasting PPV, Geode seismic array)
            {hasRatio && (
              <>
                {" "}
                · iron-oxide band ratio range {min.toFixed(2)}–{max.toFixed(2)}
              </>
            )}
          </span>
        ) : (
          <span className="muted">
            {gridLoading
              ? "Loading prediction grid…"
              : gridError
                ? `Prediction grid unavailable: ${gridError}`
                : "No prediction grid data yet."}
          </span>
        )}
        <span className="muted">{zone.grid_note}</span>
        <span className="muted">
          Use the polygon tool (top-right of the map) to draw an area and get a summary of the prediction pixels inside it.
        </span>
        <span className="muted">{note}</span>
        <span className="muted">{zone.disclaimer}</span>
      </NoteCard>
    </div>
  );
}

export function GeologistView() {
  const [selectedMine, setSelectedMine] = useState("balaghat");
  const [systemStatus, setSystemStatus] = useState(null);

  // --- Mine live zone (AOI + band ratio + pixel grid) ---
  const [zone, setZone] = useState(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneError, setZoneError] = useState(null);
  const [zoneRefreshing, setZoneRefreshing] = useState(false);
  const [zoneRefreshStatus, setZoneRefreshStatus] = useState(null);

  // --- Mine joined grid data ---
  const [gridData, setGridData] = useState(null);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState(null);
  const [selectedCell, setSelectedCell] = useState(null);

  // --- AOI Polygon tool state ---
  const [aoiSummary, setAoiSummary] = useState(null);
  const [aoiLoading, setAoiLoading] = useState(false);
  const [aoiError, setAoiError] = useState(null);
  const [clearTrigger, setClearTrigger] = useState(0);

  // --- Block filter for cell table ---
  const [blockFilter, setBlockFilter] = useState("ALL");

  const selectedMineOption = useMemo(
    () => MINE_OPTIONS.find((m) => m.value === selectedMine) || MINE_OPTIONS[0],
    [selectedMine]
  );

  const fetchMineData = useCallback(async (mineId) => {
    setZoneLoading(true);
    setGridLoading(true);
    setZoneError(null);
    setGridError(null);
    setSelectedCell(null);
    setAoiSummary(null);

    try {
      const [zoneRes, gridRes] = await Promise.all([
        apiGet(`/api/mines/${mineId}/zone`),
        apiGet(`/api/mines/${mineId}/grid`),
      ]);
      setZone(zoneRes);
      setGridData(gridRes);
    } catch (err) {
      setZoneError(err.message);
      setGridError(err.message);
    } finally {
      setZoneLoading(false);
      setGridLoading(false);
    }
  }, []);

  useEffect(() => {
    apiGet("/api/system-status").then(setSystemStatus).catch(() => null);
  }, []);

  useEffect(() => {
    fetchMineData(selectedMine);
  }, [selectedMine, fetchMineData]);

  const handlePolygonDrawn = useCallback(
    (coords) => {
      setAoiLoading(true);
      setAoiError(null);
      apiPost("/api/aoi-summary", { polygon: coords, mine_id: selectedMine })
        .then((res) => {
          setAoiSummary(res);
          setAoiLoading(false);
        })
        .catch((err) => {
          setAoiError(err.message || "Failed to calculate AOI summary.");
          setAoiLoading(false);
        });
    },
    [selectedMine]
  );

  const handlePolygonCleared = useCallback(() => {
    setAoiSummary(null);
    setAoiError(null);
  }, []);

  const handleClearAoi = useCallback(() => {
    setAoiSummary(null);
    setAoiError(null);
    setClearTrigger((prev) => prev + 1);
  }, []);

  const runRefresh = async () => {
    const data = await apiPost("/api/refresh-reserve-data");
    if (data.ee_ready !== undefined) {
      setSystemStatus((prev) => ({
        ...prev,
        ee_ready: data.ee_ready,
        grid_timestamp: data.grid_timestamp,
      }));
    }
    return {
      updatedAt: data.timestamp,
      source: data.source,
      note: data.note,
      message: data.message,
      grid_timestamp: data.grid_timestamp,
    };
  };

  const handleZoneRefresh = async () => {
    setZoneRefreshing(true);
    setZoneRefreshStatus(null);
    try {
      setZoneRefreshStatus(await runRefresh());
      await fetchMineData(selectedMine);
    } catch (err) {
      setZoneRefreshStatus({ failed: true, error: err.message });
    } finally {
      setZoneRefreshing(false);
    }
  };

  const filteredCells = useMemo(() => {
    if (!gridData?.cells) return [];
    if (blockFilter === "ALL") return gridData.cells;
    return gridData.cells.filter((c) => c.block_id === blockFilter);
  }, [gridData, blockFilter]);

  const availableBlocks = useMemo(() => {
    if (!gridData?.blocks) return [];
    return Object.keys(gridData.blocks);
  }, [gridData]);

  return (
    <div className="view">
      <h2>Geological Exploration</h2>
      <p className="view-intro">
        Unified query layer over real MOIL underground mines: Balaghat (Bharveli)
        and Ukwa. Each cell links the Mine → Block → Zone → Cell hierarchy with
        joined geological core, fleet telemetry, blast vibration, and Geode seismic proxy readings.
      </p>

      {/* Top Mine Selector Bar */}
      <div
        className="mine-selector-bar"
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "1rem",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "1rem 1.25rem",
          background: "linear-gradient(135deg, rgba(255,255,255,0.98), rgba(240,249,255,0.92))",
          borderRadius: "12px",
          border: "1px solid #cbd5e1",
          boxShadow: "0 4px 12px rgba(0,0,0,0.04)",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.85rem" }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: "10px",
              background: "linear-gradient(135deg, #0284c7, #0369a1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: "1.3rem",
              boxShadow: "0 2px 8px rgba(2,132,199,0.35)",
            }}
          >
            ⛏️
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "#0284c7",
                }}
              >
                Selected Mine
              </span>
              <span className="dot-green" style={{ width: 8, height: 8 }} />
              <span style={{ fontSize: "0.75rem", color: "#16a34a", fontWeight: 600 }}>
                {selectedMineOption.badge}
              </span>
            </div>
            <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "#0f172a" }}>
              {selectedMineOption.label}
            </h3>
            <p style={{ margin: "2px 0 0", fontSize: "0.82rem", color: "#64748b" }}>
              {selectedMineOption.subtext}
            </p>
          </div>
        </div>

        <div className="view-tabs" role="tablist" style={{ margin: 0 }}>
          {MINE_OPTIONS.map((opt) => {
            const active = selectedMine === opt.value;
            return (
              <button
                key={opt.value}
                role="tab"
                aria-selected={active}
                className={`tab ${active ? "active" : ""}`}
                onClick={() => setSelectedMine(opt.value)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.55rem 1.15rem",
                  borderRadius: "8px",
                  fontWeight: 600,
                  fontSize: "0.9rem",
                  cursor: "pointer",
                  transition: "all 0.2s ease",
                }}
              >
                <span>{opt.label.split(" (")[0]}</span>
                {active && (
                  <span
                    style={{
                      fontSize: "0.7rem",
                      padding: "2px 6px",
                      background: "rgba(255,255,255,0.25)",
                      borderRadius: "4px",
                    }}
                  >
                    Active
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <Section
        step="MODEL OUTPUT"
        title="Predicted Manganese Prospectivity & Hierarchy Grid"
        subtitle={`Live geospatial grid for ${selectedMineOption.label}. Probabilities are statistical prospectivity estimates, not confirmed JORC reserves.`}
      >
        <RefreshBar
          onRefresh={handleZoneRefresh}
          refreshing={zoneRefreshing}
          status={zoneRefreshStatus}
          systemStatus={systemStatus}
        />

        {zoneLoading && <Loader message={`Loading ${selectedMineOption.label} zone…`} />}
        {zoneError && (
          <ErrorState
            message={`Failed to load the ${selectedMineOption.label} zone.`}
            hint={zoneError}
          />
        )}
        {gridError && (
          <ErrorState
            message={`Failed to load the ${selectedMineOption.label} hierarchy grid.`}
            hint={gridError}
          />
        )}

        {!zoneLoading && !zoneError && zone && (
          <MineZoneMap
            selectedMine={selectedMine}
            mineName={selectedMineOption.label}
            zone={zone}
            gridData={gridData}
            gridLoading={gridLoading}
            gridError={gridError}
            selectedCell={selectedCell}
            onSelectCell={(cell) => setSelectedCell(cell)}
            aoiSummary={aoiSummary}
            aoiLoading={aoiLoading}
            aoiError={aoiError}
            onPolygonDrawn={handlePolygonDrawn}
            onPolygonCleared={handlePolygonCleared}
            onClearAoi={handleClearAoi}
            clearTrigger={clearTrigger}
          />
        )}

        {/* Selected Mine KPI Summary Cards */}
        {gridData && (
          <div
            className="kpi-grid"
            style={{
              marginTop: "1.25rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            }}
          >
            <KpiCard
              value={`${gridData.cell_count} Cells`}
              label="Monitored Grid Cells"
              hint={`${Object.keys(gridData.blocks || {}).length} Mining Blocks · Hierarchy Active`}
            />
            <KpiCard
              value={
                gridData.summary?.avg_mn_grade_pct !== undefined
                  ? `${gridData.summary.avg_mn_grade_pct}%`
                  : "—"
              }
              label="Mean Mn Ore Grade"
              hint="Sitasaongi & Mansar formations"
              tone="good"
            />
            <KpiCard
              value={
                gridData.summary?.avg_probability !== undefined
                  ? formatPercent(gridData.summary.avg_probability)
                  : "—"
              }
              label="Mean Prospectivity"
              hint={`${gridData.summary?.high_grade_cells ?? 0} High-Grade (≥66%) Cells`}
              tone={gridData.summary?.avg_probability >= 0.5 ? "good" : "warn"}
            />
            <KpiCard
              value={
                gridData.summary?.total_active_equipment !== undefined
                  ? `${gridData.summary.total_active_equipment} Units`
                  : "—"
              }
              label="Active Fleet Units"
              hint="Joined IoT telemetry"
            />
            <KpiCard
              value={
                gridData.summary?.avg_seismic_vp_vs !== undefined
                  ? `${gridData.summary.avg_seismic_vp_vs}`
                  : "—"
              }
              label="Seismic Vp / Vs Ratio"
              hint="Geode passive array baseline"
            />
            <KpiCard
              value={
                gridData.weather?.rainfall_24h_mm !== undefined
                  ? `${gridData.weather.rainfall_24h_mm} mm`
                  : "—"
              }
              label="24h Site Rainfall"
              hint={`Surface Temp: ${gridData.weather?.surface_temp_c ?? "—"}°C`}
            />
          </div>
        )}

        {/* Selected Cell Drill-down Inspector */}
        {selectedCell && (
          <div
            className="cell-drilldown-card"
            style={{
              marginTop: "1.25rem",
              padding: "1.25rem",
              background: "#ffffff",
              border: "1px solid #0284c7",
              borderRadius: "10px",
              boxShadow: "0 4px 14px rgba(2,132,199,0.12)",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.75rem",
                borderBottom: "1px solid #e2e8f0",
                paddingBottom: "0.5rem",
              }}
            >
              <div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    background: "#e0f2fe",
                    color: "#0369a1",
                    padding: "2px 8px",
                    borderRadius: "4px",
                    fontWeight: 700,
                    marginRight: "0.5rem",
                  }}
                >
                  Cell Drill-Down
                </span>
                <strong style={{ fontSize: "1.1rem", color: "#0f172a" }}>
                  {selectedCell.cell_id}
                </strong>
                <span style={{ marginLeft: "0.75rem", color: "#64748b", fontSize: "0.85rem" }}>
                  Block: <strong>{selectedCell.block_id}</strong> · Zone:{" "}
                  <strong>{selectedCell.zone_id}</strong>
                </span>
              </div>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setSelectedCell(null)}
                style={{ padding: "3px 10px", fontSize: "0.82rem" }}
              >
                ✕ Close Inspector
              </button>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "1rem",
                fontSize: "0.88rem",
              }}
            >
              <div
                style={{
                  background: "#f8fafc",
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <h5
                  style={{
                    margin: "0 0 0.5rem",
                    color: "#0284c7",
                    fontSize: "0.82rem",
                    textTransform: "uppercase",
                  }}
                >
                  🪨 Geological Core
                </h5>
                <div>
                  <strong>Mn Grade:</strong> {selectedCell.mn_grade_pct}%
                </div>
                <div>
                  <strong>Depth:</strong> {selectedCell.depth_m} m
                </div>
                <div>
                  <strong>Lithology:</strong> {selectedCell.lithology}
                </div>
                <div>
                  <strong>Density:</strong> {selectedCell.density_t_m3} t/m³
                </div>
                <div>
                  <strong>Prospectivity:</strong>{" "}
                  {formatPercent(selectedCell.probability ?? selectedCell.predicted_reserve_probability)}
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "4px" }}>
                  Fe: {selectedCell.fe_pct}% · SiO₂: {selectedCell.sio2_pct}% · Al₂O₃:{" "}
                  {selectedCell.al2o3_pct}% · P: {selectedCell.p_pct}%
                </div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <h5
                  style={{
                    margin: "0 0 0.5rem",
                    color: "#0284c7",
                    fontSize: "0.82rem",
                    textTransform: "uppercase",
                  }}
                >
                  🚜 Joined Fleet Telemetry
                </h5>
                <div>
                  <strong>Active Equipment:</strong> {selectedCell.active_equipment_count} /{" "}
                  {selectedCell.equipment_count} units
                </div>
                <div>
                  <strong>Avg Fleet Vibration:</strong>{" "}
                  {selectedCell.avg_fleet_vibration?.toFixed(2) ?? "—"} mm/s
                </div>
                <div>
                  <strong>Avg Fleet Temp:</strong>{" "}
                  {selectedCell.avg_fleet_temp?.toFixed(1) ?? "—"} °C
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "6px" }}>
                  Equipment fleet readings joined by zone ID from IoT telemetry stream.
                </div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <h5
                  style={{
                    margin: "0 0 0.5rem",
                    color: "#0284c7",
                    fontSize: "0.82rem",
                    textTransform: "uppercase",
                  }}
                >
                  💥 Blasting & Vibration
                </h5>
                <div>
                  <strong>Blast Records:</strong> {selectedCell.blasting_records_count} logs
                </div>
                <div>
                  <strong>Avg Blast PPV:</strong>{" "}
                  {selectedCell.avg_blast_vibration_ppv?.toFixed(2) ?? "—"} mm/s
                </div>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginTop: "6px" }}>
                  Production blasts joined by zone from historical detonation logs.
                </div>
              </div>

              <div
                style={{
                  background: "#f8fafc",
                  padding: "0.85rem",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <h5
                  style={{
                    margin: "0 0 0.5rem",
                    color: "#0284c7",
                    fontSize: "0.82rem",
                    textTransform: "uppercase",
                  }}
                >
                  📡 Nearest Seismic Station
                </h5>
                <div>
                  <strong>Station ID:</strong> {selectedCell.nearest_seismic_station_id}
                </div>
                <div>
                  <strong>Distance:</strong> {Math.round(selectedCell.seismic_station_distance_m)} m
                </div>
                <div>
                  <strong>Vp / Vs Ratio:</strong> {selectedCell.vp_vs_ratio?.toFixed(2) ?? "—"}
                </div>
                <div>
                  <strong>Vp / Vs:</strong> {selectedCell.vp_mps} / {selectedCell.vs_mps} m/s
                </div>
                <div>
                  <strong>Anomaly Score:</strong>{" "}
                  {selectedCell.seismic_anomaly_score?.toFixed(3) ?? "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Cell Hierarchy Table Explorer */}
        {gridData && filteredCells.length > 0 && (
          <div style={{ marginTop: "1.5rem" }}>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "0.75rem",
                marginBottom: "0.75rem",
              }}
            >
              <div>
                <h4 style={{ margin: 0, fontSize: "1rem", color: "#0f172a" }}>
                  Hierarchy Cells ({filteredCells.length} of {gridData.cell_count})
                </h4>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "#64748b" }}>
                  Click any cell row to inspect its full multi-dataset profile or highlight it on the map.
                </p>
              </div>

              {availableBlocks.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontSize: "0.82rem", color: "#64748b", fontWeight: 600 }}>
                    Filter Block:
                  </span>
                  <select
                    className="select-field"
                    value={blockFilter}
                    onChange={(e) => setBlockFilter(e.target.value)}
                    style={{
                      padding: "0.35rem 0.65rem",
                      borderRadius: "6px",
                      border: "1px solid #cbd5e1",
                      fontSize: "0.85rem",
                    }}
                  >
                    <option value="ALL">All Blocks ({availableBlocks.length})</option>
                    {availableBlocks.map((b) => (
                      <option key={b} value={b}>
                        Block {b}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div
              style={{
                overflowX: "auto",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                background: "#ffffff",
                boxShadow: "0 1px 3px rgba(0,0,0,0.03)",
              }}
            >
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.83rem" }}>
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0", textAlign: "left" }}>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Cell ID</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Block / Zone</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Mn Grade</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Depth</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Lithology</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Prospectivity</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Active Fleet</th>
                    <th style={{ padding: "0.55rem 0.75rem" }}>Seismic Station</th>
                    <th style={{ padding: "0.55rem 0.75rem", textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCells.map((cell) => {
                    const prob = Number(
                      cell.probability ??
                        cell.predicted_reserve_probability ??
                        cell.geology?.predicted_reserve_probability ??
                        0
                    );
                    const zoneLabel = zoneFromProbability(prob, zone?.zone_thresholds);
                    const isSelected = selectedCell?.cell_id === cell.cell_id;
                    const mnGrade = cell.mn_grade_pct ?? cell.geology?.mn_pct ?? "—";
                    const depth = cell.depth_m ?? cell.seismic?.estimated_depth_to_ore_m ?? "—";
                    const lithology = cell.lithology ?? cell.geology?.rock_type ?? "Gondite";
                    return (
                      <tr
                        key={cell.cell_id}
                        style={{
                          borderBottom: "1px solid #f1f5f9",
                          background: isSelected ? "#f0f9ff" : "transparent",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                        onClick={() => setSelectedCell(cell)}
                      >
                        <td style={{ padding: "0.55rem 0.75rem", fontWeight: 700, color: "#0284c7" }}>
                          {cell.cell_id}
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem", color: "#475569" }}>
                          {cell.block_id} · {cell.zone_id}
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem", fontWeight: 600 }}>
                          {mnGrade}%
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem", color: "#64748b" }}>
                          {depth} m
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem", color: "#334155" }}>
                          {lithology}
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem" }}>
                          <span
                            style={{
                              padding: "2px 6px",
                              borderRadius: "4px",
                              backgroundColor: ZONE_COLORS[zoneLabel] || "#64748b",
                              color: "#fff",
                              fontWeight: 600,
                              fontSize: "0.75rem",
                            }}
                          >
                            {formatPercent(prob)} ({zoneLabel})
                          </span>
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem", color: "#475569" }}>
                          {cell.active_equipment_count} units
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem", color: "#475569" }}>
                          {cell.nearest_seismic_station_id} ({Math.round(cell.seismic_station_distance_m)}m)
                        </td>
                        <td style={{ padding: "0.55rem 0.75rem", textAlign: "right" }}>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            style={{ padding: "2px 8px", fontSize: "0.75rem" }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedCell(cell);
                            }}
                          >
                            {isSelected ? "Inspecting" : "Inspect"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      <OreGradePanel />

      <GeophysicalEvidencePanel mineId={selectedMine} />

      <Section
        step="MODEL"
        title="Model Validation"
        subtitle="Held-out scores recomputed from the saved model artifacts. Every input behind the dashboard is listed centrally under “View Data Sources”."
      >
        <SystemInfoPanel />
      </Section>
    </div>
  );
}
