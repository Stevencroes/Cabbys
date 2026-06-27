import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../booking/useAuth";
import { supabase } from "../lib/supabase";
import { formatMoney } from "../lib/currency";
import Nav from "../components/Nav";
import Footer from "../components/Footer";

interface Ride {
  id: string;
  pickup_location: string;
  dropoff_location: string;
  scheduled_date?: string;
  scheduled_time?: string;
  scheduled_at?: string;
  vehicle_type?: string;
  vehicle_class?: string;
  fare_total?: number | string;
  price?: number | string;
  status?: string;
  created_at?: string;
}

function formatTripDate(ride: Ride): string {
  if (ride.scheduled_date) {
    const parts = [ride.scheduled_date];
    if (ride.scheduled_time) parts.push(ride.scheduled_time);
    return parts.join(" · ");
  }
  if (ride.scheduled_at) {
    const d = new Date(ride.scheduled_at);
    return d.toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  return "—";
}

function statusLabel(status: string | undefined): string {
  if (!status) return "—";
  return status.charAt(0).toUpperCase() + status.slice(1).replace(/_/g, " ");
}

export default function MyTrips() {
  const { user, loading: authLoading } = useAuth();
  const [rides, setRides] = useState<Ride[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    supabase
      .from("rides")
      .select("*")
      .eq("passenger_id", user.id)
      .order("created_at", { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message);
        else setRides((data as Ride[]) ?? []);
        setLoading(false);
      });
  }, [user]);

  return (
    <>
      <Nav onSignIn={() => {}} />
      <main
        style={{
          minHeight: "100vh",
          background: "var(--zone-glow), var(--midnight)",
          paddingTop: "7rem",
          paddingBottom: "4rem",
        }}
      >
        <div className="wrap" style={{ maxWidth: "760px", margin: "0 auto", padding: "0 1.5rem" }}>
          <h1
            style={{
              fontFamily: "var(--disp)",
              fontWeight: 300,
              fontSize: "clamp(2rem, 5vw, 3rem)",
              color: "var(--mist)",
              letterSpacing: "0.02em",
              marginBottom: "0.25rem",
            }}
          >
            My trips
          </h1>
          <p
            style={{
              color: "var(--silver-dim)",
              fontSize: "0.9rem",
              letterSpacing: "0.04em",
              marginBottom: "2.5rem",
            }}
          >
            Your transfer history with Cabby's Aruba.
          </p>

          {authLoading && (
            <p style={{ color: "var(--silver-dim)", letterSpacing: "0.04em" }}>
              Loading…
            </p>
          )}

          {!authLoading && !user && (
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "2.5rem",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  color: "var(--silver)",
                  fontSize: "1rem",
                  letterSpacing: "0.03em",
                  marginBottom: "1.25rem",
                }}
              >
                Sign in to view your transfers.
              </p>
              <Link
                to="/"
                style={{
                  color: "var(--mist)",
                  fontSize: "0.875rem",
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  textDecoration: "none",
                  borderBottom: "1px solid var(--accent-line)",
                  paddingBottom: "2px",
                }}
              >
                Return home
              </Link>
            </div>
          )}

          {!authLoading && user && loading && (
            <p style={{ color: "var(--silver-dim)", letterSpacing: "0.04em" }}>
              Loading your trips…
            </p>
          )}

          {!authLoading && user && !loading && error && (
            <p style={{ color: "var(--silver-dim)", letterSpacing: "0.04em" }}>
              Unable to load trips.
            </p>
          )}

          {!authLoading && user && !loading && !error && rides.length === 0 && (
            <div
              style={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: "12px",
                padding: "2.5rem",
                textAlign: "center",
              }}
            >
              <p
                style={{
                  color: "var(--silver-dim)",
                  fontSize: "0.95rem",
                  letterSpacing: "0.03em",
                }}
              >
                No trips yet. Book your first transfer when you're ready.
              </p>
            </div>
          )}

          {!authLoading && user && !loading && !error && rides.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {rides.map((ride) => {
                const fare = formatMoney(
                  Number(ride.fare_total ?? ride.price ?? 0),
                  "AWG"
                );
                const vehicle = [ride.vehicle_class, ride.vehicle_type]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <article
                    key={ride.id}
                    className="trip-card"
                    style={{
                      background: "var(--card)",
                      borderRadius: "12px",
                      padding: "1.5rem 1.75rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "1rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <p
                          style={{
                            color: "var(--mist)",
                            fontSize: "1rem",
                            letterSpacing: "0.02em",
                            margin: 0,
                          }}
                        >
                          {ride.pickup_location}
                        </p>
                        <p
                          style={{
                            color: "var(--silver-dim)",
                            fontSize: "0.8rem",
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                            margin: "0.2rem 0",
                          }}
                        >
                          to
                        </p>
                        <p
                          style={{
                            color: "var(--mist)",
                            fontSize: "1rem",
                            letterSpacing: "0.02em",
                            margin: 0,
                          }}
                        >
                          {ride.dropoff_location}
                        </p>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <p
                          style={{
                            color: "var(--silver)",
                            fontSize: "1.1rem",
                            letterSpacing: "0.02em",
                            margin: 0,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fare}
                        </p>
                        <span
                          style={{
                            display: "inline-block",
                            marginTop: "0.4rem",
                            fontSize: "0.75rem",
                            letterSpacing: "0.08em",
                            textTransform: "uppercase",
                            color: "var(--silver-dim)",
                            border: "1px solid var(--border)",
                            borderRadius: "4px",
                            padding: "2px 8px",
                          }}
                        >
                          {statusLabel(ride.status)}
                        </span>
                      </div>
                    </div>
                    <div
                      style={{
                        marginTop: "1rem",
                        paddingTop: "0.75rem",
                        borderTop: "1px solid var(--hairline)",
                        display: "flex",
                        gap: "1.5rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <span
                        style={{
                          color: "var(--silver-dim)",
                          fontSize: "0.8rem",
                          letterSpacing: "0.04em",
                        }}
                      >
                        {formatTripDate(ride)}
                      </span>
                      {vehicle && (
                        <span
                          style={{
                            color: "var(--silver-dim)",
                            fontSize: "0.8rem",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {vehicle}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  );
}
