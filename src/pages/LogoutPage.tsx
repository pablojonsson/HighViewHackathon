import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const SESSION_KEYS_TO_CLEAR = [
  "hvAuthToken",
  "hvRefreshToken",
  "hvUserProfile",
  "hvSelectedClassId",
  "highview-auth-user"
];

const pageStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  minHeight: "100vh",
  width: "100%",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "24px",
  boxSizing: "border-box",
  color: "#f8fafc",
  fontFamily: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const cardStyle: React.CSSProperties = {
  width: "min(420px, 100%)",
  backgroundColor: "#1e293b",
  borderRadius: "16px",
  border: "1px solid #334155",
  padding: "32px",
  display: "flex",
  flexDirection: "column",
  gap: "16px",
  textAlign: "center",
  boxShadow: "0 25px 45px rgba(15, 23, 42, 0.35)",
};

const accentTextStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "#94a3b8",
  lineHeight: 1.6,
};

const headlineStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 700,
};

const buttonStyle: React.CSSProperties = {
  marginTop: "8px",
  padding: "14px 18px",
  borderRadius: "12px",
  backgroundColor: "#38bdf8",
  color: "#0f172a",
  fontWeight: 600,
  fontSize: "15px",
  border: "none",
  cursor: "pointer",
  transition: "transform 0.15s ease, box-shadow 0.15s ease",
  boxShadow: "0 15px 35px rgba(56, 189, 248, 0.28)",
};

const listStyle: React.CSSProperties = {
  textAlign: "left",
  margin: "0",
  paddingLeft: "18px",
  color: "#cbd5f5",
  fontSize: "14px",
  lineHeight: 1.6,
};

const CountdownText: React.FC<{ seconds: number }> = ({ seconds }) => (
  <span style={{ color: "#38bdf8", fontWeight: 600 }}>{seconds}s</span>
);

export default function LogoutPage() {
  const navigate = useNavigate();
  const [seconds, setSeconds] = useState<number>(5);
  const { logout } = useAuth();

  useEffect(() => {
    SESSION_KEYS_TO_CLEAR.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });
    logout();
  }, [logout]);

  useEffect(() => {
    if (seconds <= 0) {
      navigate("/login", { replace: true });
      return;
    }

    const timeout = window.setTimeout(() => {
      setSeconds((prev) => prev - 1);
    }, 1000);

    return () => window.clearTimeout(timeout);
  }, [seconds, navigate]);

  const allKeysCleared = useMemo(() => seconds <= 0, [seconds]);

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <div>
          <div style={{ ...headlineStyle, marginBottom: "4px" }}>Signed out of HighView</div>
          <div style={accentTextStyle}>
            Your Google session and app data have been cleared from this browser.
          </div>
        </div>

        <ul style={listStyle}>
          <li>Removed session tokens from local storage</li>
          <li>Cleared cached class + student selection</li>
          <li>Reset mentor dashboard state for the next sign in</li>
        </ul>

        <div style={accentTextStyle}>
          Redirecting to login in <CountdownText seconds={seconds} />.
        </div>

        <button
          type="button"
          style={buttonStyle}
          onClick={() => navigate("/login", { replace: true })}
          disabled={allKeysCleared}
        >
          Back to Google Sign-In
        </button>
      </div>
    </div>
  );
}