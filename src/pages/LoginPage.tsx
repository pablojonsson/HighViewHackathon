import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

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

                const payload = await res.json();
                console.info("Synced Google Classroom data", payload);
                navigate("/mock/leaderboard");
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
      return () => {};
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
    <div className="card stack" style={{ maxWidth: "520px" }}>
      <h2>Welcome back</h2>
      <p className="subtle">
        Sign in with your school Google account to view attendance diagnostics.
      </p>
      <button
        className="primary-btn"
        onClick={handleGoogleLogin}
        disabled={!isReady || isProcessing}
      >
        {isProcessing ? "Syncing Google Classroom..." : "Continue with Google"}
      </button>
      <p className="subtle">Need access? Contact your program admin.</p>
    </div>
  );
};

export default LoginPage;
