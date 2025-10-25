import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

type GoogleCodeResponse = {
  code?: string;
  error?: string;
};

type GoogleCodeClient = {
  requestCode: () => void;
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

const LoginPage = () => {
  const navigate = useNavigate();
  const [isReady, setIsReady] = useState(false);
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
        scope: "openid email profile",
        ux_mode: "popup",
        callback: (response: GoogleCodeResponse) => {
          if (response.error) {
            console.error("Google Sign-In error:", response.error);
            return;
          }

          if (response.code) {
            // In a real app you would exchange `response.code` with your backend.
            console.log("Received Google auth code:", response.code);
            navigate("/mock/leaderboard");
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

    codeClientRef.current.requestCode();
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
        disabled={!isReady}
      >
        Continue with Google
      </button>
      <p className="subtle">Need access? Contact your program admin.</p>
    </div>
  );
};

export default LoginPage;
