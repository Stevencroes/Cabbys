import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const [params] = useSearchParams();

  useEffect(() => {
    // `next` is set by signInWithProvider for flows that started outside
    // the passenger site (the driver portal) so OAuth returns them home.
    const next = params.get("next") || "/";
    supabase.auth.getSession().then(() => {
      navigate(next, { replace: true });
    });
  }, [navigate, params]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        color: "var(--mist, #EEF2F8)",
        fontSize: "15px",
        fontWeight: 300,
        letterSpacing: "0.04em",
      }}
    >
      Completing sign-in…
    </div>
  );
}
