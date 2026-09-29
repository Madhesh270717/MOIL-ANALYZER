import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend as ChartLegend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiGet } from "../api";
import {
  AlertBanner,
  DataBadge,
  EmptyState,
  ErrorState,
  KpiCard,
  Loader,
  Section,
  formatTonnes,
  formatTonnesShort,
} from "../ui";

// Indicative suitability caution badge
const SUITABILITY_CAUTION =
  "Indicative Guideline — Not a certified commercial blending schedule or JORC-classified reserve.";

export function OreGradePanel() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // View state: 'donut' | 'bar'
  const [chartType, setChartType] = useState("donut");
  // Metric state: 'tonnage' | 'sites'
  const [chartMetric, setChartMetric] = useState("tonnage");
  // Active band filter for sample sites table
  const [selectedBand, setSelectedBand] = useState("all");
  const [searchSite, setSearchSite] = useState("");

  const fetchData = () => {
    setLoading(true);
    setError(null);
    apiGet("/api/ore-grade-summary")
      .then((res) => {
        setData(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message || "Failed to load ore grade summary data.");
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchData();
  }, []);

  const summary = data?.summary;
  const bands = data?.bands || [];
  const sampleSites = data?.sample_sites || [];

  // Filtered sample sites
  const filteredSites = useMemo(() => {
    return sampleSites.filter((s) => {
      if (selectedBand !== "all" && s.band_key !== selectedBand) return false;
      if (searchSite.trim()) {
        const q = searchSite.toLowerCase().trim();
        if (
          !s.site_id.toLowerCase().includes(q) &&
          !s.rock_type.toLowerCase().includes(q) &&
          !s.geological_unit.toLowerCase().includes(q)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [sampleSites, selectedBand, searchSite]);

  // Chart data formatting
  const chartData = useMemo(() => {
    return bands.map((b) => ({
      name: b.label,
      fullName: b.name,
      value: chartMetric === "tonnage" ? b.tonnage_tonnes : b.count,
      tonnage: b.tonnage_tonnes,
      count: b.count,
      avgGrade: b.avg_grade_pct,
      color: b.color,
      sharePct: chartMetric === "tonnage" ? b.share_tonnage_pct : b.share_count_pct,
    }));
  }, [bands, chartMetric]);

  return (
    <Section
      step="ORE QUALITY"
      title="Manganese Ore Grade Distribution & Quality"
      subtitle="Geological grade bucketing, metallurgical suitability assessments, and reserve distribution across reference exploration sites"
      actions={
        <div className="section-actions-row">
          <DataBadge kind="estimated" label="Geological Assay Model" />
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={fetchData}
            disabled={loading}
          >
            {loading ? "Refreshing…" : "↻ Refresh Grades"}
          </button>
        </div>
      }
    >
      <AlertBanner severity="info" title="Indicative Geological Quality Reference">
        {data?.disclaimer ||
          "Ore grade classifications and suitability notes are statistical reference estimates derived from geological and geochemical indicators in 01_Geological_Data.csv. They represent indicative metallurgical groupings and do not constitute certified blending schedules, commercial assay certificates, or JORC-classified reserve grades."}
      </AlertBanner>

      {loading && !data && <Loader message="Analyzing geological ore grade distributions…" />}
      {error && <ErrorState message="Could not fetch ore grade summary." hint={error} />}

      {summary && (
        <div className="ore-grade-container">
          {/* Top KPI Metrics */}
          <div className="kpi-grid">
            <KpiCard
              value={summary.total_sites}
              label="Evaluated Sites"
              hint="300 reference exploration sites"
            />
            <KpiCard
              value={summary.economic_sites_count}
              label="Economic Mineralization"
              hint="Sites with commercial grade ≥25% Mn"
              tone="good"
            />
            <KpiCard
              value={`${formatTonnesShort(summary.economic_tonnage_tonnes)} t`}
              label="Commercial Reserves"
              hint={`${Math.round((summary.economic_tonnage_tonnes / summary.total_tonnage_tonnes) * 100)}% of total evaluated resource`}
              tone="good"
            />
            <KpiCard
              value={`${summary.economic_avg_grade_pct}% Mn`}
              label="Economic Avg Grade"
              hint="Mean grade across economic sites"
              tone="good"
            />
            <KpiCard
              value={`${summary.overall_avg_grade_pct}% Mn`}
              label="Overall Resource Grade"
              hint="Including sub-economic host formations"
            />
          </div>

          {/* Chart Section */}
          <div className="ore-chart-card">
            <div className="ore-chart-header">
              <div>
                <h4 className="ore-chart-title">Resource Quality Allocation</h4>
                <p className="ore-chart-subtitle">
                  Visual breakdown of manganese reserves categorized by standard metallurgical grade bands
                </p>
              </div>

              <div className="ore-chart-controls">
                <div className="button-group">
                  <button
                    type="button"
                    className={`btn btn-sm ${chartMetric === "tonnage" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setChartMetric("tonnage")}
                  >
                    Tonnage (Tonnes)
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${chartMetric === "sites" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setChartMetric("sites")}
                  >
                    Site Count
                  </button>
                </div>

                <div className="button-group">
                  <button
                    type="button"
                    className={`btn btn-sm ${chartType === "donut" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setChartType("donut")}
                  >
                    Donut Chart
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${chartType === "bar" ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setChartType("bar")}
                  >
                    Bar Chart
                  </button>
                </div>
              </div>
            </div>

            <div className="ore-chart-wrapper">
              <ResponsiveContainer width="100%" height={320}>
                {chartType === "donut" ? (
                  <PieChart>
                    <Pie
                      data={chartData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={115}
                      paddingAngle={3}
                      label={({ name, sharePct }) => `${name} (${sharePct}%)`}
                    >
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val, name, item) => [
                        chartMetric === "tonnage"
                          ? `${formatTonnes(val)} tonnes (${item.payload.sharePct}%)`
                          : `${val} sites (${item.payload.sharePct}%)`,
                        item.payload.fullName,
                      ]}
                    />
                    <ChartLegend />
                  </PieChart>
                ) : (
                  <BarChart
                    data={chartData}
                    margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="name" />
                    <YAxis
                      tickFormatter={(val) =>
                        chartMetric === "tonnage" ? formatTonnesShort(val) : val
                      }
                    />
                    <Tooltip
                      formatter={(val, name, item) => [
                        chartMetric === "tonnage"
                          ? `${formatTonnes(val)} tonnes (${item.payload.sharePct}%)`
                          : `${val} sites (${item.payload.sharePct}%)`,
                        item.payload.fullName,
                      ]}
                    />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                      {chartData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>

          {/* Grade Bands with Indicative Suitability Notes */}
          <div className="grade-bands-list">
            <h4 className="bands-section-title">
              Grade Bands & Indicative Metallurgical Suitability
            </h4>
            <div className="bands-grid">
              {bands.map((band) => (
                <div
                  key={band.key}
                  className="band-card"
                  style={{ borderLeftColor: band.color }}
                >
                  <div className="band-card-header">
                    <div>
                      <span className="band-pill" style={{ backgroundColor: band.color }}>
                        {band.grade_range}
                      </span>
                      <h4 className="band-name">{band.name}</h4>
                    </div>
                    <span className="band-app-tag">{band.application}</span>
                  </div>

                  <div className="band-metrics-row">
                    <div className="band-metric">
                      <span className="metric-label">Estimated Reserves</span>
                      <strong className="metric-val">
                        {formatTonnesShort(band.tonnage_tonnes)} t
                      </strong>
                      <span className="metric-sub">({band.share_tonnage_pct}% of total)</span>
                    </div>

                    <div className="band-metric">
                      <span className="metric-label">Reference Sites</span>
                      <strong className="metric-val">{band.count}</strong>
                      <span className="metric-sub">({band.share_count_pct}% of sites)</span>
                    </div>

                    <div className="band-metric">
                      <span className="metric-label">Average Grade</span>
                      <strong className="metric-val" style={{ color: band.color }}>
                        {band.avg_grade_pct}% Mn
                      </strong>
                      <span className="metric-sub">in-situ assay</span>
                    </div>
                  </div>

                  {/* Indicative Suitability Box */}
                  <div className="suitability-box">
                    <div className="suitability-head">
                      <strong>Indicative Metallurgical Suitability</strong>
                      <span className="suitability-caution-tag">
                        {SUITABILITY_CAUTION}
                      </span>
                    </div>
                    <p className="suitability-text">{band.indicative_suitability}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Reference Site Assay Registry Table */}
          <div className="site-assay-table-card">
            <div className="table-card-head">
              <div>
                <h4>Exploration Site Assay Registry (Reference Dataset)</h4>
                <p className="table-card-sub">
                  Sampling of representative geochemical sites categorized by quality tier
                </p>
              </div>

              <div className="table-filters-row">
                <select
                  value={selectedBand}
                  onChange={(e) => setSelectedBand(e.target.value)}
                  className="table-select"
                >
                  <option value="all">All Grade Bands</option>
                  <option value="gt_44">&gt;44% Mn (High Grade)</option>
                  <option value="35_44">35–44% Mn (Medium Grade)</option>
                  <option value="25_35">25–35% Mn (Low Grade)</option>
                  <option value="lt_25">&lt;25% Mn (Sub-economic)</option>
                </select>

                <input
                  type="text"
                  placeholder="Search Site ID or Rock Type…"
                  value={searchSite}
                  onChange={(e) => setSearchSite(e.target.value)}
                  className="table-search-input"
                />
              </div>
            </div>

            <div className="table-responsive">
              <table className="ore-sites-table">
                <thead>
                  <tr>
                    <th>Site ID</th>
                    <th>Rock Type</th>
                    <th>Geological Unit</th>
                    <th>Geochem Mn (ppm)</th>
                    <th>Est. Grade %</th>
                    <th>Est. Reserves (tonnes)</th>
                    <th>Quality Tier</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSites.slice(0, 15).map((site) => (
                    <tr key={site.site_id}>
                      <td>
                        <strong>{site.site_id}</strong>
                      </td>
                      <td>{site.rock_type}</td>
                      <td>{site.geological_unit}</td>
                      <td>{site.geochemical_mn_ppm} ppm</td>
                      <td>
                        <strong style={{ color: site.grade_pct >= 35 ? "#198754" : "#fd7e14" }}>
                          {site.grade_pct}% Mn
                        </strong>
                      </td>
                      <td>{formatTonnes(site.tonnage_tonnes)}</td>
                      <td>
                        <span
                          className={`quality-chip tier-${site.band_key}`}
                        >
                          {site.band_label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredSites.length === 0 && (
                <EmptyState>No exploration sites found matching filter criteria.</EmptyState>
              )}
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}
