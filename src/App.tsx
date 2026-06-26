import { Routes, Route } from "react-router-dom";
import Landing from "./pages/Landing";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={
          <Landing
            onOpenBooking={(journeyKey) => {
              // TODO(Task 10): open booking overlay
              console.log("openBooking", journeyKey);
            }}
          />
        }
      />
    </Routes>
  );
}
