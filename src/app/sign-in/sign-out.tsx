"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOut() {
  const [busy, setBusy] = useState(false);
  return (
    <button
      className="button secondary"
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await authClient.signOut();
          window.location.assign("/sign-in");
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Signing out…" : "Sign out of IS"}
    </button>
  );
}
