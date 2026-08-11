// The portal's routing, behind the approval gate. The ride detail runs
// "bare" — no top bar, no tabs — because it is a single job in progress
// and the only action that matters is the one pinned to its foot.
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import DriverGuard from "./DriverGuard";
import DriverShell from "./DriverShell";
import Today from "./screens/Today";
import Pool from "./screens/Pool";
import RideDetail from "./screens/RideDetail";
import Earnings from "./screens/Earnings";
import History from "./screens/History";
import Profile from "./screens/Profile";

export default function DriverPortal() {
  const { pathname } = useLocation();
  const bare = /^\/drive\/ride\//.test(pathname);

  return (
    <DriverGuard>
      {(driver) => (
        <DriverShell driver={driver} bare={bare}>
          <Routes>
            <Route index element={<Today driver={driver} />} />
            <Route path="pool" element={<Pool />} />
            <Route path="ride/:id" element={<RideDetail />} />
            <Route path="earnings" element={<Earnings driver={driver} />} />
            <Route path="history" element={<History driver={driver} />} />
            <Route path="profile" element={<Profile driver={driver} />} />
            <Route path="*" element={<Navigate to="/drive" replace />} />
          </Routes>
        </DriverShell>
      )}
    </DriverGuard>
  );
}
