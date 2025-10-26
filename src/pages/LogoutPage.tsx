import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const SESSION_KEYS_TO_CLEAR = [
  "hvAuthToken",
  "hvRefreshToken",
  "hvUserProfile",
  "hvSelectedClassId",
  "highview-auth-user"
];

type Stage = "confirm" | "redirect";

const LogoutPage = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [stage, setStage] = useState<Stage>("confirm");

  useEffect(() => {
    if (stage === "redirect") {
      navigate("/login", { replace: true });
    }
  }, [stage, navigate]);

  const handleCancel = () => {
    if (user) {
      const destination = user.role === "teacher" ? "/mock/leaderboard" : "/mock/student";
      navigate(destination, { replace: true });
    } else {
      navigate(-1);
    }
  };

  const handleConfirm = () => {
    SESSION_KEYS_TO_CLEAR.forEach((key) => {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    });

    logout();
    setStage("redirect");
  };

  const redirecting = stage === "redirect";
  const disableButtons = redirecting;

  return (
    <div className="logout-root">
      <div className="logout-sheen" />
      <div className="logout-modal">
        <header className="logout-header">
          <h1>{redirecting ? "Signed out of pulseboard" : "Sign out of pulseboard?"}</h1>
          <p>
            {redirecting
              ? "Your session is cleared. Redirecting you to the Google sign-in screen."
              : "You'll disconnect your Google Classroom sync and return to the login screen."}
          </p>
        </header>

        {!redirecting && (
          <ul className="logout-list">
          </ul>
        )}

        <div className="logout-actions">
          <button
            type="button"
            className="logout-btn ghost"
            onClick={handleCancel}
            disabled={disableButtons}
          >
            Stay signed in
          </button>
          <button
            type="button"
            className="logout-btn primary"
            onClick={handleConfirm}
            disabled={disableButtons}
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
};

export default LogoutPage;
