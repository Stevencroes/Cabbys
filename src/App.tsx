import { useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BookingProvider, useBooking } from "./booking/BookingContext";
import Landing from "./pages/Landing";
import BookingOverlay from "./components/booking/BookingOverlay";
import AuthCallback from "./pages/AuthCallback";
import Confirmation from "./components/Confirmation";
import type { ConfirmedBooking } from "./components/booking/steps/StepPayment";

function AppRoutes() {
  const { open } = useBooking();
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  function handleConfirmed(booking: ConfirmedBooking) {
    setConfirmedBooking(booking);
  }

  function handleDone() {
    // Confirmation already called reset() + close(); clear local state.
    setConfirmedBooking(null);
  }

  return (
    <>
      <Routes>
        <Route path="/" element={<Landing onOpenBooking={open} />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
      </Routes>
      <BookingOverlay onConfirmed={handleConfirmed} />
      <Confirmation booking={confirmedBooking} onDone={handleDone} />
    </>
  );
}

export default function App() {
  return (
    <BookingProvider>
      <AppRoutes />
    </BookingProvider>
  );
}
