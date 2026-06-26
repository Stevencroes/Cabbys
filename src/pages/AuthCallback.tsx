import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(() => {
      navigate("/", { replace: true });
    });
  }, [navigate]);

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
