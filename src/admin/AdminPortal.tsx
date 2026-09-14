// The board's routing, behind the operator gate.
//
// Eight screens and four detail views, and the shape is the same one
// everywhere: a list answers "which", a detail answers "what about this
// one", and nothing on a list expands in place. That is the rule the
// whole portal is laid out around — an operator comparing thirty rides
// wants thirty rows the same height, and the row that grows to show you
// its contents is the row that makes the other twenty-nine move.
//
//   Dashboard      what needs you, what is happening now, what is next.
//   Ride requests  every booking as a table, filtered and searchable.
//   Ride           one booking, its timeline, its driver, its map, and
//                  the three or four things that can be done to it.
//   Schedule       a day, read down the clock, with the collisions and
//                  the gaps drawn where they fall.
//   Drivers        the directory; a driver opens their own profile,
//                  which is where the car, the paperwork, the work and
//                  the money live.
//   Customers      derived from bookings, because there is no customers
//                  table — see src/admin/lib/customers.ts.
//   Earnings       completed work only, on the same arithmetic the
//                  driver's own earnings screen uses.
//   Support        what needs a person, derived from live state rather
//                  than from a tickets table nobody would close.
//   Settings       what this company is currently configured to do, and
//                  which half of it can be changed without a deploy.
//
// /admin/assign is gone and redirects here. It was a second way to put a
// driver on a ride, and the ride's own screen is a better one — it has
// the guest, the route, the money and the timeline on it while the
// decision is made, which a two-pane picker never did. Its warnings (a
// driver with no car, a driver already booked at that hour) moved with
// it and are tested in AssignPanel.test.tsx.
import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AdminGuard from "./AdminGuard";
import AdminShell from "./AdminShell";
import { BoardProvider } from "./BoardContext";
import Dashboard from "./screens/Dashboard";
import Rides from "./screens/Rides";
import RideView from "./screens/RideView";
import Schedule from "./screens/Schedule";
import Drivers from "./screens/Drivers";
import DriverProfile from "./screens/DriverProfile";
import Customers from "./screens/Customers";
import CustomerView from "./screens/CustomerView";
import Earnings from "./screens/Earnings";
import Support from "./screens/Support";
import Settings from "./screens/Settings";

export default function AdminPortal() {
  // Suppresses the site-wide grain for as long as an admin screen is up,
  // the same way the driver portal does. Set on <body> rather than
  // scoped in CSS because the overlay belongs to body::after, which no
  // selector inside this portal can reach.
  useEffect(() => {
    document.body.classList.add("drive-route");
    return () => document.body.classList.remove("drive-route");
  }, []);

  return (
    <AdminGuard>
      {(user) => (
        <BoardProvider>
          <AdminShell user={user}>
            <Routes>
              <Route index element={<Dashboard />} />
              <Route path="rides" element={<Rides />} />
              <Route path="rides/:id" element={<RideView />} />
              <Route path="schedule" element={<Schedule />} />
              <Route path="drivers" element={<Drivers />} />
              <Route path="drivers/:id" element={<DriverProfile />} />
              <Route path="customers" element={<Customers />} />
              <Route path="customers/:key" element={<CustomerView />} />
              <Route path="earnings" element={<Earnings />} />
              <Route path="support" element={<Support />} />
              <Route path="settings" element={<Settings />} />
              {/* the old two-pane assign screen's links, kept working */}
              <Route path="assign" element={<Navigate to="/admin/rides" replace />} />
              <Route path="*" element={<Navigate to="/admin" replace />} />
            </Routes>
          </AdminShell>
        </BoardProvider>
      )}
    </AdminGuard>
  );
}
