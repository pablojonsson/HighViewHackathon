import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type GoogleCredentialResponse = {
  credential: string;
  clientId: string;
  select_by: string;
};

type PromptMomentNotification = {
  isDismissedMoment: () => boolean;
};

type GsiButtonConfiguration = {
  type?: "standard" | "icon";
  theme?: "outline" | "filled_blue" | "filled_black";
  size?: "small" | "medium" | "large";
  text?: "signin_with" | "signup_with" | "continue_with" | "signin";
  shape?: "square" | "pill" | "rectangular" | "circle";
  width?: number;
  logo_alignment?: "left" | "center";
};

type GoogleAccountsId = {
  initialize: (options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: "signin" | "signup";
  }) => void;
  renderButton: (parent: HTMLElement, options: GsiButtonConfiguration) => void;
  prompt: (momentListener?: (moment: PromptMomentNotification) => void) => void;
  cancel: () => void;
};

declare global {
  interface Window {
    google?: {
      accounts: {
        id: GoogleAccountsId;
      };
    };
  }
}

export type GoogleProfile = {
  id: string;
  email: string;
  fullName: string;
  givenName: string;
  familyName: string;
  picture?: string;
  hostedDomain?: string;
};

export type GoogleSignInButtonProps = {
  onSuccess: (payload: { profile: GoogleProfile; credential: string }) => void;
  onError?: (message: string) => void;
  buttonOptions?: GsiButtonConfiguration;
  autoPrompt?: boolean;
};

const decodeJwtPayload = <T,>(token: string): T => {
  const segments = token.split(".");
  if (segments.length < 2) {
    throw new Error("Unexpected credential format");
  }

  const base64 = segments[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
  const json = atob(padded);
  return JSON.parse(json) as T;
};

const buildProfile = (credential: string): GoogleProfile => {
  type Payload = {
    sub: string;
    email: string;
    name: string;
    picture?: string;
    given_name: string;
    family_name: string;
    hd?: string;
  };

  const payload = decodeJwtPayload<Payload>(credential);

  return {
    id: payload.sub,
    email: payload.email,
    fullName: payload.name,
    givenName: payload.given_name,
    familyName: payload.family_name,
    picture: payload.picture,
    hostedDomain: payload.hd,
  };
};

const DEFAULT_BUTTON_OPTIONS: GsiButtonConfiguration = {
  theme: "outline",
  size: "large",
  shape: "pill",
  text: "continue_with",
};

const GoogleSignInButton = ({
  onSuccess,
  onError,
  buttonOptions,
  autoPrompt = true,
}: GoogleSignInButtonProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const mergedButtonOptions = useMemo(
    () => ({ ...DEFAULT_BUTTON_OPTIONS, ...buttonOptions }),
    [buttonOptions],
  );

  const clearRenderedButton = useCallback(() => {
    if (containerRef.current) {
      containerRef.current.innerHTML = "";
    }
  }, []);

  const reportError = useCallback(
    (text: string) => {
      setMessage(text);
      setStatus("error");
      onError?.(text);
    },
    [onError],
  );

  const handleCredential = useCallback(
    (response: GoogleCredentialResponse) => {
      try {
        const profile = buildProfile(response.credential);
        onSuccess({ profile, credential: response.credential });
        setMessage(null);
      } catch (error) {
        reportError("We were unable to read the Google sign-in response.");
        if (error instanceof Error) {
          console.error(error.message);
        } else {
          console.error(error);
        }
      }
    },
    [onSuccess, reportError],
  );

  useEffect(() => {
    const scriptId = "google-identity-services";

    if (window.google?.accounts?.id) {
      setStatus("ready");
      return;
    }

    const handleLoad = () => setStatus("ready");
    const handleError = () =>
      reportError("Google sign-in could not be loaded. Check your connection or ad blocker.");

    const existingScript = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (existingScript) {
      setStatus("loading");
      existingScript.addEventListener("load", handleLoad);
      existingScript.addEventListener("error", handleError);

      return () => {
        existingScript.removeEventListener("load", handleLoad);
        existingScript.removeEventListener("error", handleError);
      };
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.id = scriptId;
    script.addEventListener("load", handleLoad);
    script.addEventListener("error", handleError);

    setStatus("loading");
    document.head.appendChild(script);

    return () => {
      script.removeEventListener("load", handleLoad);
      script.removeEventListener("error", handleError);
    };
  }, [reportError]);

  useEffect(() => {
    if (status !== "ready" || !containerRef.current) {
      return;
    }

    const api = window.google?.accounts?.id;
    if (!api) {
      reportError("Google sign-in is unavailable in this browser.");
      return;
    }

    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId) {
      reportError("Missing Google Client ID. Add VITE_GOOGLE_CLIENT_ID to your environment.");
      return;
    }

    clearRenderedButton();
    api.initialize({
      client_id: clientId,
      callback: handleCredential,
    });

    api.renderButton(containerRef.current, mergedButtonOptions);

    if (autoPrompt) {
      api.prompt((moment) => {
        if (moment.isDismissedMoment()) {
          console.info("Google prompt dismissed by the user or browser.");
        }
      });
    }
  }, [autoPrompt, clearRenderedButton, handleCredential, mergedButtonOptions, reportError, status]);

  useEffect(
    () => () => {
      window.google?.accounts?.id.cancel();
    },
    [],
  );

  return (
    <div className="stack" style={{ width: "100%" }}>
      <div ref={containerRef} />
      {status === "loading" && (
        <button className="primary-btn" type="button" disabled>
          Loading Google Sign-in…
        </button>
      )}
      {message && <p className="error-text subtle">{message}</p>}
    </div>
  );
};

export default GoogleSignInButton;
