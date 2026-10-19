"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function ConsentForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function decide(accept: boolean) {
    setBusy(true);
    setError(null);
    try {
      // OAuth Provider client carries the signed pending authorization query.
      const response = await authClient.oauth2.consent({ accept });
      if (response.error) setError(response.error.message ?? "Consent could not be recorded.");
    } catch {
      setError("Unable to process consent.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="stack">
      <div className="button-row">
        <button type="button" className="button" disabled={busy} onClick={() => decide(true)}>Allow</button>
        <button type="button" className="button secondary" disabled={busy} onClick={() => decide(false)}>Deny</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </div>
  );
}
