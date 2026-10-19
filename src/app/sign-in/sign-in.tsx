"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignIn() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({ provider: "google" });
      if (result.error) setError(result.error.message ?? "Sign-in failed.");
    } catch {
      setError("Unable to start Google sign-in.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <button className="button" type="button" disabled={busy} onClick={signIn}>
        {busy ? "Connecting…" : "Continue with Google"}
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
