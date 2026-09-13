// The board's routing, behind the operator gate.
//
// Three screens, and the list is closed:
//
//   Drivers  the one that is currently a hand-typed UPDATE against
//            production. Approve, suspend, reinstate.
//   Rides    today and ahead, filterable, with the unassigned ones
//            impossible to miss — that is the row that needs a human.
//   Assign   put a named driver on a named unassigned ride, for when
//            the pool does not clear on its own.
//
// There is no analytics screen, no revenue chart, no pricing editor and
// no messaging centre, and that is a decision rather than an omission.
// Every one of those would be a second version of something that already
// has a home: fares come out of src/lib/quote.ts, a driver's own money
// is the Earnings screen they already have, and the island runs on
// WhatsApp. A dispatch board that grows a dashboard stops being read.
import { useEffect } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AdminGuard from "./AdminGuard";
import AdminShell from "./AdminShell";
import Drivers from "./screens/Drivers";
import Rides from "./screens/Rides";
import Assign from "./screens/Assign";

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
        <AdminShell user={user}>
          <Routes>
            <Route index element={<Drivers />} />
            <Route path="rides" element={<Rides />} />
            <Route path="assign" element={<Assign />} />
            <Route path="*" element={<Navigate to="/admin" replace />} />
          </Routes>
        </AdminShell>
      )}
    </AdminGuard>
  );
}
