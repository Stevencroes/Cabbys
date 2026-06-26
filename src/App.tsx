import { Routes, Route } from "react-router-dom";
import { BookingProvider, useBooking } from "./booking/BookingContext";
import Landing from "./pages/Landing";
import BookingOverlay from "./components/booking/BookingOverlay";

function AppRoutes() {
  const { open } = useBooking();
  return (
    <>
      <Routes>
        <Route path="/" element={<Landing onOpenBooking={open} />} />
      </Routes>
      <BookingOverlay />
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
