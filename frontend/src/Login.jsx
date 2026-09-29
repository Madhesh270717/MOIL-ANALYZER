import { useState } from "react";

export const MOIL_MINES = [
  {
    id: "balaghat",
    name: "Balaghat Mine",
    state: "Madhya Pradesh",
    district: "Balaghat",
    type: "Underground (Deepest Mn Mine in Asia)",
    enabled: true,
    statusText: "Active • Live Telemetry Online",
  },
  {
    id: "dongri-buzurg",
    name: "Dongri Buzurg Mine",
    state: "Maharashtra",
    district: "Bhandara",
    type: "Opencast (High Grade MnO₂)",
    enabled: false,
    statusText: "Disabled • Sensor Calibration",
  },
  {
    id: "chikla",
    name: "Chikla Mine",
    state: "Maharashtra",
    district: "Bhandara",
    type: "Underground",
    enabled: false,
    statusText: "Disabled • Offline",
  },
  {
    id: "gumgaon",
    name: "Gumgaon Mine",
    state: "Maharashtra",
    district: "Nagpur",
    type: "Underground",
    enabled: false,
    statusText: "Disabled • Offline",
  },
  {
    id: "kandri",
    name: "Kandri Mine",
    state: "Maharashtra",
    district: "Nagpur",
    type: "Underground",
    enabled: false,
    statusText: "Disabled • Offline",
  },
  {
    id: "mansar",
    name: "Mansar (Munsar) Mine",
    state: "Maharashtra",
    district: "Nagpur",
    type: "Underground",
    enabled: false,
    statusText: "Disabled • Offline",
  },
  {
    id: "beldongri",
    name: "Beldongri Mine",
    state: "Maharashtra",
    district: "Nagpur",
    type: "Underground",
    enabled: false,
    statusText: "Disabled • Offline",
  },
  {
    id: "parsoda",
    name: "Parsoda Mine",
    state: "Maharashtra",
    district: "Nagpur",
    type: "Opencast (11th MOIL Mine)",
    enabled: false,
    statusText: "Disabled • Offline",
  },
  {
    id: "tirodi",
    name: "Tirodi Mine",
    state: "Madhya Pradesh",
    district: "Balaghat",
    type: "Opencast",
    enabled: false,
    statusText: "Disabled • Offline",
  },
  {
    id: "ukwa",
    name: "Ukwa Mine",
    state: "Madhya Pradesh",
    district: "Balaghat",
    type: "Underground (~8.6 MT Reference Reserve)",
    enabled: true,
    statusText: "Active • Live Telemetry Online",
  },
  {
    id: "sitapatore",
    name: "Sitapatore / Sukli Mine",
    state: "Madhya Pradesh",
    district: "Balaghat",
    type: "Underground & Opencast",
    enabled: false,
    statusText: "Disabled • Offline",
  },
];

export const ROLE_CONFIGS = [
  {
    value: "Geologist",
    title: "Geologist",
    code: "GEO-01",
    badge: "Exploration & Grade",
    icon: "🪨",
    desc: "Ore body 3D block models, borehole lithology, prospectivity estimation, and seismic evidence overlay.",
    defaultUser: "geo.balaghat@moil.nic.in",
    empId: "MOIL-GEO-204",
    tags: ["Borehole Lithology", "Grade Kriging", "Seismic Evidence"],
    accentColor: "#0284c7",
  },
  {
    value: "Surveyor",
    title: "Mine Surveyor",
    code: "SURV-02",
    badge: "Spatial Boundaries",
    icon: "📐",
    desc: "Grid coordinate registry, block/zone elevation contours, stope boundary survey, and AOI polygon geometry.",
    defaultUser: "survey.officer@moil.nic.in",
    empId: "MOIL-SRV-108",
    tags: ["Grid Hierarchy", "Z-Elevations", "AOI Polygon Analysis"],
    accentColor: "#0284c7",
  },
  {
    value: "Operations Manager",
    title: "Operations Manager",
    code: "OPS-03",
    badge: "Production AI & Planning",
    icon: "🏭",
    desc: "Weekly forecast simulation, stope extraction quotas, bottleneck mitigation, and managerial schedule approval.",
    defaultUser: "ops.manager@moil.nic.in",
    empId: "MOIL-OPS-102",
    tags: ["Weekly Forecast", "Quota Rebalancing", "Directive Approvals"],
    accentColor: "#0284c7",
  },
  {
    value: "Blasting Supervisor",
    title: "Blasting Supervisor",
    code: "BLST-04",
    badge: "Drill & Blast Timing",
    icon: "💥",
    desc: "Scheduled blast cycles, drill/charge delay monitoring, post-detonation clearance, and DGMS vibration thresholds.",
    defaultUser: "blast.supervisor@moil.nic.in",
    empId: "MOIL-BLS-044",
    tags: ["Delay Stages", "Clearance Timing", "Vibration PPV"],
    accentColor: "#0284c7",
  },
  {
    value: "Equipment/Maintenance",
    title: "Equipment & Maintenance",
    code: "EQM-05",
    badge: "Fleet Telemetry & OEE",
    icon: "🚜",
    desc: "Heavy machinery IoT telemetry, breakdown triage, maintenance scheduling, and rule-based fleet redeployment.",
    defaultUser: "maint.eng@moil.nic.in",
    empId: "MOIL-EQP-089",
    tags: ["IoT Telemetry", "OEE Tracking", "Fleet Redeployment"],
    accentColor: "#0284c7",
  },
  {
    value: "Safety Officer",
    title: "Safety & Compliance Officer",
    code: "SAFE-06",
    badge: "DGMS & ESZ Protection",
    icon: "🛡️",
    desc: "DGMS statutory standards, Eco-Sensitive-Zone buffer compliance, micro-seismic fracture monitoring, and weather alerts.",
    defaultUser: "safety.officer@moil.nic.in",
    empId: "MOIL-SAF-012",
    tags: ["DGMS Standards", "ESZ Eco Buffers", "Rockburst Monitoring"],
    accentColor: "#0284c7",
  },
  {
    value: "Management",
    title: "Executive Management",
    code: "MGT-07",
    badge: "Enterprise Overview",
    icon: "📊",
    desc: "Enterprise production trends, cross-mine reserve comparison, shortfall mitigation directives, and strategic decisions.",
    defaultUser: "mgmt.director@moil.nic.in",
    empId: "MOIL-EXEC-001",
    tags: ["Enterprise KPIs", "Two-Mine Benchmark", "Strategic Approvals"],
    accentColor: "#0284c7",
  },
];

export function Login({ onLogin }) {
  const [selectedRole, setSelectedRole] = useState(ROLE_CONFIGS[0].value);
  const [selectedMine, setSelectedMine] = useState("Balaghat Mine");
  const [username, setUsername] = useState(ROLE_CONFIGS[0].defaultUser);
  const [password, setPassword] = useState("moil@2026");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState(null);
  const [showDemoModal, setShowDemoModal] = useState(false);

  const currentRoleConfig =
    ROLE_CONFIGS.find((r) => r.value === selectedRole) || ROLE_CONFIGS[0];

  const handleSelectRole = (item) => {
    setSelectedRole(item.value);
    setUsername(item.defaultUser);
    setPassword("moil@2026");
    setError(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setError("Please enter your Username or Employee ID.");
      return;
    }
    if (!password.trim()) {
      setError("Please enter your security password.");
      return;
    }
    setError(null);
    onLogin(selectedRole, {
      username: username.trim(),
      role: selectedRole,
      empId: currentRoleConfig?.empId || "MOIL-USER",
      mine: selectedMine,
      loginTime: new Date().toISOString(),
    });
  };

  return (
    <div className="login-portal-wrapper">
      {/* Ambient background glows */}
      <div className="login-glow login-glow-1" aria-hidden="true" />
      <div className="login-glow login-glow-2" aria-hidden="true" />

      {/* Top corporate banner */}
      <header className="login-corporate-bar">
        <div className="corp-brand-cluster">
          <div className="corp-emblem">
            <svg
              viewBox="0 0 24 24"
              width="24"
              height="24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          </div>
          <div className="corp-titles">
            <h1 className="corp-name">MOIL Analyzer</h1>
            <span className="corp-sub">
              A Miniratna Govt. of India Enterprise • Smart Mining Telemetrics
            </span>
          </div>
        </div>

        <div className="corp-telemetry-badge">
          <span className="live-telemetry-pulse" />
          <span>Integrated Pit Operations Portal</span>
        </div>
      </header>

      {/* Main split authentication viewport */}
      <main className="login-main-container">
        <div className="login-split-card">
          
          {/* ================= LEFT SIDE: CREDENTIALS ================= */}
          <section className="login-credentials-pane">
            <div className="pane-header-box">
              <span className="security-tag-pill">
                <svg
                  viewBox="0 0 24 24"
                  width="13"
                  height="13"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
                Secure SSO Authentication
              </span>
              <h2 className="pane-heading">Sign In to MOIL Analyzer</h2>
              <p className="pane-subtext">
                Select your mine site and enter authorized credentials to access
                real-time telemetrics, pit models, and operational alerts.
              </p>
            </div>

            {/* Active Selected Role Preview Bar */}
            <div
              className="active-role-preview"
              style={{
                borderColor: `${currentRoleConfig.accentColor}55`,
                backgroundColor: `${currentRoleConfig.accentColor}0d`,
              }}
            >
              <div
                className="active-role-avatar"
                style={{ backgroundColor: `${currentRoleConfig.accentColor}25` }}
              >
                <span>{currentRoleConfig.icon}</span>
              </div>
              <div className="active-role-meta">
                <span className="active-role-lead">Current Role:</span>
                <span className="active-role-name">
                  {currentRoleConfig.title}
                </span>
              </div>
              <span
                className="active-role-badge"
                style={{
                  backgroundColor: `${currentRoleConfig.accentColor}20`,
                  color: currentRoleConfig.accentColor,
                  borderColor: `${currentRoleConfig.accentColor}40`,
                }}
              >
                {currentRoleConfig.badge}
              </span>
            </div>

            {error && (
              <div className="login-alert-error" role="alert">
                <span className="alert-icon">⚠️</span>
                <span className="alert-text">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="login-auth-form">
              {/* Choose Mine Field (All 11 MOIL Mines; Balaghat enabled, others disabled) */}
              <div className="auth-field-group">
                <div className="field-label-wrapper">
                  <label htmlFor="auth-mine">Choose Mine</label>
                  <span className="field-status-pill">
                    <span className="dot-green" /> Balaghat Enabled
                  </span>
                </div>
                <div className="input-prefix-container">
                  <span className="input-prefix-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                      <circle cx="12" cy="10" r="3" />
                    </svg>
                  </span>
                  <select
                    id="auth-mine"
                    className="auth-input auth-select"
                    value={selectedMine}
                    onChange={(e) => setSelectedMine(e.target.value)}
                    required
                  >
                    {MOIL_MINES.map((mine) => (
                      <option
                        key={mine.id}
                        value={mine.name}
                        disabled={!mine.enabled}
                        className={mine.enabled ? "mine-opt-enabled" : "mine-opt-disabled"}
                      >
                        {mine.name} ({mine.district}, {mine.state === "Madhya Pradesh" ? "MP" : "MH"}) — {mine.enabled ? "[ACTIVE • ONLINE]" : "[DISABLED • OFFLINE]"}
                      </option>
                    ))}
                  </select>
                  <span className="select-chevron" aria-hidden="true">
                    ▼
                  </span>
                </div>
                <p className="mine-hint-note">
                  * 1 of 11 MOIL mines active. Balaghat is currently live with telemetry. All other 10 mines are disabled.
                </p>
              </div>

              {/* Username Input */}
              <div className="auth-field-group">
                <div className="field-label-wrapper">
                  <label htmlFor="auth-username">Username / Employee ID</label>
                  <button
                    type="button"
                    className="field-helper-link"
                    onClick={() => setUsername(currentRoleConfig.defaultUser)}
                    title="Insert default role email"
                  >
                    Use {currentRoleConfig.empId}
                  </button>
                </div>
                <div className="input-prefix-container">
                  <span className="input-prefix-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  </span>
                  <input
                    id="auth-username"
                    type="text"
                    className="auth-input"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. MOIL-GEO-204 or user@moil.nic.in"
                    autoComplete="username"
                    required
                  />
                </div>
              </div>

              {/* Password Input */}
              <div className="auth-field-group">
                <div className="field-label-wrapper">
                  <label htmlFor="auth-password">Password</label>
                  <button
                    type="button"
                    className="field-helper-link"
                    onClick={() => setShowDemoModal(true)}
                  >
                    Demo credentials?
                  </button>
                </div>
                <div className="input-prefix-container">
                  <span className="input-prefix-icon" aria-hidden="true">
                    <svg
                      viewBox="0 0 24 24"
                      width="16"
                      height="16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </svg>
                  </span>
                  <input
                    id="auth-password"
                    type={showPassword ? "text" : "password"}
                    className="auth-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter security password"
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="btn-toggle-eye"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        width="16"
                        height="16"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              {/* Remember checkbox & encryption badge */}
              <div className="auth-meta-options">
                <label className="auth-remember-label">
                  <input
                    type="checkbox"
                    className="auth-checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Keep session active</span>
                </label>
                <span className="auth-encryption-pill">
                  <span className="dot-green" /> 256-Bit TLS
                </span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="btn btn-auth-submit"
                style={{
                  background: `linear-gradient(135deg, ${currentRoleConfig.accentColor}, #0284c7)`,
                }}
              >
                <span>Sign In as {currentRoleConfig.title}</span>
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </button>
            </form>

            {/* Quick Demo Helper Hint */}
            <div className="login-quick-tip-card">
              <span className="tip-badge">Tip</span>
              <p className="tip-text">
                Select any operational role on the right card panel to auto-fill
                its verified demo credentials for <strong>Balaghat Mine</strong>.
              </p>
            </div>

            <footer className="credentials-security-foot">
              <span>DGMS Safety Standards Compliant</span>
              <span className="foot-sep">•</span>
              <span>ISO 27001 Secure Access</span>
            </footer>
          </section>

          {/* ================= RIGHT SIDE: ROLE CARDS ================= */}
          <section className="login-roles-pane">
            <div className="pane-header-box">
              <span className="security-tag-pill role-pill">
                Operational Profiles
              </span>
              <h2 className="pane-heading">Choose Operational Role</h2>
              <p className="pane-subtext">
                Select your functional designation to configure workspace
                views, maps, dispatch feeds, and telemetric controls for Balaghat Mine.
              </p>
            </div>

            <div
              className="role-cards-deck"
              role="radiogroup"
              aria-label="Select Operational Role"
            >
              {ROLE_CONFIGS.map((item) => {
                const isSelected = selectedRole === item.value;
                return (
                  <div
                    key={item.value}
                    className={`role-select-card ${isSelected ? "is-selected" : ""}`}
                    onClick={() => handleSelectRole(item)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectRole(item);
                      }
                    }}
                    role="radio"
                    aria-checked={isSelected}
                    tabIndex={0}
                    style={{
                      "--card-accent": item.accentColor,
                    }}
                  >
                    <div className="role-card-header">
                      <div
                        className="role-icon-box"
                        style={{
                          backgroundColor: `${item.accentColor}18`,
                          borderColor: `${item.accentColor}35`,
                        }}
                      >
                        <span className="role-emoji">{item.icon}</span>
                      </div>
                      <div className="role-card-badges">
                        <span
                          className="role-badge-tag"
                          style={{
                            color: item.accentColor,
                            backgroundColor: `${item.accentColor}15`,
                          }}
                        >
                          {item.badge}
                        </span>
                        <span className="role-code-pill">{item.code}</span>
                      </div>
                    </div>

                    <div className="role-card-content">
                      <h3 className="role-card-title">{item.title}</h3>
                      <p className="role-card-desc">{item.desc}</p>
                    </div>

                    <div className="role-card-tags">
                      {item.tags.map((tag) => (
                        <span key={tag} className="role-tag-chip">
                          {tag}
                        </span>
                      ))}
                    </div>

                    <div className="role-card-footer">
                      <div className="role-emp-info">
                        <span className="emp-label">Auth ID:</span>
                        <code className="emp-code">{item.empId}</code>
                      </div>
                      <div className="role-select-status">
                        {isSelected ? (
                          <span
                            className="role-active-indicator"
                            style={{
                              backgroundColor: item.accentColor,
                              color: "#fff",
                            }}
                          >
                            <svg
                              viewBox="0 0 24 24"
                              width="12"
                              height="12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                            Active
                          </span>
                        ) : (
                          <span className="role-select-prompt">
                            Select Role →
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

        </div>
      </main>

      {/* Demo Credentials Help Modal */}
      {showDemoModal && (
        <div
          className="demo-help-overlay"
          onClick={() => setShowDemoModal(false)}
          role="presentation"
        >
          <div
            className="demo-help-card"
            role="dialog"
            aria-modal="true"
            aria-label="Preset Demo Credentials"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="demo-modal-head">
              <h3>MOIL Analyzer - Operational Access Directory</h3>
              <button
                type="button"
                className="demo-modal-close"
                onClick={() => setShowDemoModal(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="demo-modal-body">
              <p className="demo-modal-note">
                For testing and evaluation, selecting any operational card on
                the right will automatically configure the appropriate username
                and standard demo passcode (<code>moil@2026</code>) for <strong>Balaghat Mine</strong>.
              </p>
              <table className="demo-accounts-table">
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>User Email / ID</th>
                    <th>Employee Code</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLE_CONFIGS.map((r) => (
                    <tr
                      key={r.value}
                      className={r.value === selectedRole ? "active-row" : ""}
                      onClick={() => {
                        handleSelectRole(r);
                        setShowDemoModal(false);
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <strong>{r.icon} {r.title}</strong>
                      </td>
                      <td><code>{r.defaultUser}</code></td>
                      <td><code>{r.empId}</code></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ marginTop: "1.25rem" }}>
                <h4 style={{ fontSize: "0.88rem", color: "var(--text, #0f172a)", marginBottom: "0.5rem", fontWeight: 700 }}>
                  MOIL Mines Status (11 Official Mining Units)
                </h4>
                <div style={{ maxHeight: "150px", overflowY: "auto", border: "1px solid var(--border, #e2e8f0)", borderRadius: "10px", padding: "0.5rem", background: "#f8fafc" }}>
                  {MOIL_MINES.map((m) => (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "0.35rem 0.6rem",
                        fontSize: "0.78rem",
                        color: m.enabled ? "#0284c7" : "#64748b",
                        borderBottom: "1px solid rgba(226, 232, 240, 0.6)",
                        fontWeight: m.enabled ? 600 : 400,
                      }}
                    >
                      <span>{m.enabled ? "🟢" : "⚪"} {m.name} ({m.district}, {m.state === "Madhya Pradesh" ? "MP" : "MH"})</span>
                      <span style={{ fontWeight: 700 }}>{m.enabled ? "Active" : "Disabled"}</span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="demo-modal-foot">
                Click any row above to auto-select that profile and close this dialog.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
