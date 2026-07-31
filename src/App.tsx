import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BookingProvider, useBooking } from "./booking/BookingContext";
import { AuthModalProvider } from "./components/auth/AuthModal";
import Landing from "./pages/Landing";
import BookingOverlay from "./components/booking/BookingOverlay";
import AuthCallback from "./pages/AuthCallback";
import MyTrips from "./pages/MyTrips";
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
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/trips" element={<MyTrips />} />
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
