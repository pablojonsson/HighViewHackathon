import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

type GoogleCodeResponse = {
  code?: string;
  error?: string;
  scope?: string;
};

type GoogleCodeClient = {
  requestCode: (overrides?: Record<string, unknown>) => void;
};

declare global {
  interface Window {
    google?: {
      accounts?: {
        oauth2?: {
          initCodeClient: (options: {
            client_id: string;
            scope: string;
            ux_mode?: "popup" | "redirect";
            redirect_uri?: string;
            callback: (response: GoogleCodeResponse) => void;
          }) => GoogleCodeClient;
        };
      };
    };
  }
}

const GOOGLE_SCRIPT_ID = "google-identity-services";
const GOOGLE_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.rosters.readonly",
  "https://www.googleapis.com/auth/classroom.profile.emails",
  "https://www.googleapis.com/auth/classroom.profile.photos"
].join(" ");

const LoginPage = () => {
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const codeClientRef = useRef<GoogleCodeClient | null>(null);
  const { user, setUser } = useAuth();

  useEffect(() => {
    if (user) {
      const nextRoute = user.role === "teacher" ? "/mock/leaderboard" : "/mock/student";
      navigate(nextRoute, { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    if (!clientId) {
      console.warn(
        "Missing VITE_GOOGLE_CLIENT_ID. Google Sign-In button will stay disabled."
      );
      return;
    }

    const initClient = () => {
      if (!window.google?.accounts?.oauth2) {
        console.warn("Google Identity Services failed to load.");
        return;
      }

      document
        .getElementById(GOOGLE_SCRIPT_ID)
        ?.setAttribute("data-loaded", "true");

      codeClientRef.current = window.google.accounts.oauth2.initCodeClient({
        client_id: clientId,
        scope: GOOGLE_SCOPES,
        ux_mode: "popup",
        callback: (response: GoogleCodeResponse) => {
          if (response.error) {
            console.error("Google Sign-In error:", response.error);
            return;
          }

          if (response.code) {
            setIsProcessing(true);

            fetch("/api/classroom/sync", {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                code: response.code
              })
            })
              .then(async (res) => {
                if (!res.ok) {
                  const message = await res.text();
                  throw new Error(
                    message || "Failed to sync Google Classroom data."
                  );
                }

                const payload = (await res.json()) as {
                  user: {
                    id: string;
                    name: string;
                    email?: string | null;
                    role: "teacher" | "student";
                  };
                };

                setUser(payload.user);
                const nextRoute =
                  payload.user.role === "teacher" ? "/mock/leaderboard" : "/mock/student";
                navigate(nextRoute, { replace: true });
              })
              .catch((error) => {
                console.error("Failed to sync Google Classroom data", error);
              })
              .finally(() => {
                setIsProcessing(false);
              });
          }
        },
      });

      setIsReady(true);
    };

    let script = document.getElementById(GOOGLE_SCRIPT_ID) as
      | HTMLScriptElement
      | null;

    const handleLoad = () => {
      script?.setAttribute("data-loaded", "true");
      initClient();
    };

    if (window.google?.accounts?.oauth2 && !codeClientRef.current) {
      initClient();
      return () => { };
    }

    if (!script) {
      script = document.createElement("script");
      script.id = GOOGLE_SCRIPT_ID;
      script.src = "https://accounts.google.com/gsi/client";
      script.async = true;
      script.defer = true;
      script.addEventListener("load", handleLoad, { once: true });
      script.addEventListener("error", () => {
        console.error("Failed to load Google Identity Services script.");
      });
      document.head.appendChild(script);
      return () => {
        script?.removeEventListener("load", handleLoad);
      };
    }

    if (script.getAttribute("data-loaded") === "true") {
      initClient();
    } else {
      script.addEventListener("load", initClient, { once: true });
    }

    return () => {
      script?.removeEventListener("load", initClient);
    };
  }, [navigate]);

  const handleGoogleLogin = () => {
    if (!codeClientRef.current) {
      console.warn("Google Sign-In is not ready yet.");
      return;
    }

    codeClientRef.current.requestCode({
      prompt: "consent",
      scope: GOOGLE_SCOPES
    });
  };

  return (
    <div className="login-root">
      <div className="login-backdrop">
        <span className="pulse-shape pulse-1" />
        <span className="pulse-shape pulse-2" />
        <span className="pulse-shape pulse-3" />
        <div className="login-card">
          <h1 className="login-title">PulseBoard</h1>
          <p className="login-subtitle"> Track every heartbeat of engagement.</p>
          <button
            className="google-btn"
            onClick={handleGoogleLogin}
            disabled={!isReady || isProcessing}
          >
            <span className="google-icon" aria-hidden="true" />
            {isProcessing ? "Syncing Google Classroom…" : "Sign in with Google"}
          </button>
          <p className="login-helper">Use your Google Classroom account</p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
