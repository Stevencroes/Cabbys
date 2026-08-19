import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BookingProvider, useBooking } from "./booking/BookingContext";
import { AuthModalProvider } from "./components/auth/AuthModal";
import Landing from "./pages/Landing";
import HashScroll from "./components/HashScroll";
import BookingOverlay from "./components/booking/BookingOverlay";
import AuthCallback from "./pages/AuthCallback";
import MyTrips from "./pages/MyTrips";
import Profile from "./pages/Profile";
import ResetPassword from "./pages/ResetPassword";
import DriverPortal from "./driver/DriverPortal";
import Confirmation from "./components/Confirmation";
import type { ConfirmedBooking } from "./booking/types";

function AppRoutes() {
  const { close } = useBooking();
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  function handleConfirmed(booking: ConfirmedBooking) {
    setConfirmedBooking(booking);
    close();
  }

  function handleDone() {
    // Confirmation already called reset() + close(); clear local state.
    setConfirmedBooking(null);
  }

  return (
    <>
      <HashScroll />
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/trips" element={<MyTrips />} />
        <Route path="/profile" element={<Profile />} />
        {/* where the password-recovery mail lands */}
        <Route path="/reset-password" element={<ResetPassword />} />
        {/* the driver portal is its own world: dark ground, own shell, own guard */}
        <Route path="/drive/*" element={<DriverPortal />} />
      </Routes>
      <BookingOverlay onConfirmed={handleConfirmed} />
      <Confirmation booking={confirmedBooking} onDone={handleDone} />
    </>
  );
}

export default function App() {
  return (
    <BookingProvider>
      <AuthModalProvider>
        <AppRoutes />
      </AuthModalProvider>
    </BookingProvider>
  );
}
