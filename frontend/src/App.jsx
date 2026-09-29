import { useState } from "react";
import { AlertsSidebar } from "./AlertsSidebar";
import { AssistantWidget } from "./AssistantWidget";
import { Login, Navbar } from "./ui";
import { GeologistView } from "./views/GeologistView";
import { SurveyorView } from "./views/SurveyorView";
import { OperationsManagerView } from "./views/OperationsManagerView";
import { BlastingSupervisorView } from "./views/BlastingSupervisorView";
import { EquipmentMaintenanceView } from "./views/EquipmentMaintenanceView";
import { SafetyOfficerView } from "./views/SafetyOfficerView";
import { ManagementView } from "./views/ManagementView";
import { MineCommandHubView } from "./views/MineCommandHubView";

// Role-based login with persistent cross-view navigation and active risk alerts
// drawer accessible from every view across the 7 MOIL roles.
export default function App() {
  const [role, setRole] = useState(null);
  const [user, setUser] = useState(null);
  const [currentView, setCurrentView] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [alertCount, setAlertCount] = useState(0);

  const handleLogin = (selectedRole, userInfo) => {
    setRole(selectedRole);
    setUser(userInfo || { username: selectedRole });
    setCurrentView(selectedRole);
  };

  const handleLogout = () => {
    setRole(null);
    setUser(null);
    setCurrentView(null);
    setAlertsOpen(false);
  };

  if (!role) return <Login onLogin={handleLogin} />;

  const activeView = currentView || role;

  return (
    <div className="app">
      <Navbar
        role={role}
        user={user}
        currentView={activeView}
        onViewChange={setCurrentView}
        alertsOpen={alertsOpen}
        onToggleAlerts={() => setAlertsOpen((prev) => !prev)}
        alertCount={alertCount}
        onLogout={handleLogout}
      />

      <div className={`app-workspace ${alertsOpen ? "has-sidebar-open" : ""}`}>
        <AlertsSidebar
          open={alertsOpen}
          onClose={() => setAlertsOpen(false)}
          onAlertCountChange={setAlertCount}
        />

        <div className="main-content-pane">
          {!alertsOpen && (
            <button
              type="button"
              className="alerts-dock-tab"
              onClick={() => setAlertsOpen(true)}
              aria-label="Open field alerts side panel"
              title="Open field alerts and live weather advisories"
            >
              <span className="alerts-dock-pulse" aria-hidden="true" />
              <span className="alerts-dock-icon">⚠</span>
              <span className="alerts-dock-label">Alerts</span>
              {alertCount > 0 && (
                <span className="alerts-dock-count">{alertCount}</span>
              )}
            </button>
          )}

          {activeView === "Geologist" && <GeologistView />}
          {activeView === "Surveyor" && <SurveyorView />}
          {(activeView === "Operations Manager" ||
            activeView === "Production Manager") && <OperationsManagerView />}
          {activeView === "Blasting Supervisor" && <BlastingSupervisorView />}
          {(activeView === "Equipment/Maintenance" ||
            activeView === "Operations") && <EquipmentMaintenanceView />}
          {activeView === "Safety Officer" && <SafetyOfficerView />}
          {activeView === "Management" && <ManagementView />}
          {activeView === "Mine Command" && (
            <MineCommandHubView role={role} user={user} />
          )}

          <AssistantWidget
            currentView={activeView}
            currentSite={user?.mine || "Balaghat"}
          />
        </div>
      </div>
    </div>
  );
}


