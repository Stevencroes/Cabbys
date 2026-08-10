// The portal's own routing, behind the approval gate. Screens land here as
// they're built; anything not yet made falls back to the dashboard so a tab
// can never dead-end.
import { Routes, Route, Navigate } from "react-router-dom";
import DriverGuard from "./DriverGuard";
import DriverShell from "./DriverShell";
import Dashboard from "./screens/Dashboard";

export default function DriverPortal() {
  return (
    <DriverGuard>
      {(driver) => (
        <DriverShell>
          <Routes>
            <Route index element={<Dashboard driver={driver} />} />
            <Route path="*" element={<Navigate to="/drive" replace />} />
          </Routes>
        </DriverShell>
      )}
    </DriverGuard>
  );
}
