import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { useFlightProvider } from "./lib/flightStatus";
import { supabaseFlights } from "./lib/providers/supabaseFlights";
import "./styles/tokens.css";
import "./styles/globals.css";

// Flight answers come from our own table, never from the vendor — the
// scheduled function is the only thing holding a key. See
// docs/flight-schema.sql.
useFlightProvider(supabaseFlights);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </React.StrictMode>
);
