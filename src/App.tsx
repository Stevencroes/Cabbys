import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { BookingProvider, useBooking } from "./booking/BookingContext";
import { useAuth } from "./booking/useAuth";
import Landing from "./pages/Landing";
import BookingOverlay from "./components/booking/BookingOverlay";
import AuthCallback from "./pages/AuthCallback";
import MyTrips from "./pages/MyTrips";
import Confirmation from "./components/Confirmation";
import type { ConfirmedBooking } from "./components/booking/steps/StepRide";

function AppRoutes() {
  const { open, setField } = useBooking();
  const { user } = useAuth();
  const [confirmedBooking, setConfirmedBooking] = useState<ConfirmedBooking | null>(null);

  useEffect(() => {
    setField("signedIn", !!user);
  }, [user, setField]);

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
      <AppRoutes />
    </BookingProvider>
  );
}
