"use client";

import { useCallback, useEffect, useState } from "react";

type Entry = { email: string; created_at: string; note: string | null };

export function AdmissionsManager() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const load = useCallback(async () => {
    const res = await fetch("/api/admin/admissions", { cache: "no-store", credentials: "same-origin" });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Unable to load admissions");
    setEntries(data.entries);
    setReady(true);
  }, []);
  useEffect(() => { void load().catch(err => setError(String(err))); }, [load]);
  async function mutate(method: "POST" | "DELETE", target: string, requestedNote?: string) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/admissions", {
        method, headers: { "Content-Type": "application/json" },
        credentials: "same-origin", body: JSON.stringify({ email: target, note: requestedNote }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");
      await load();
      if (method === "POST") { setEmail(""); setNote(""); }
    } catch (err) { setError(err instanceof Error ? err.message : "Request failed"); }
    finally { setBusy(false); }
  }
  return (
    <div className="stack">
      <form className="admin-form" onSubmit={e => { e.preventDefault(); void mutate("POST", email, note); }}>
        <label htmlFor="new-email">Google email</label>
        <input id="new-email" type="email" required maxLength={254} autoComplete="off"
          value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" />
        <label htmlFor="new-note">Note (optional)</label>
        <input id="new-note" maxLength={500} value={note} onChange={e => setNote(e.target.value)} />
        <button className="button" type="submit" disabled={busy}>Add permitted email</button>
      </form>
      <label htmlFor="search-email">Search permitted emails ({entries.length})</label>
      <input id="search-email" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" />
      {error && <p className="error" role="alert">{error}</p>}
      {!ready ? <p className="muted">Loading admissions…</p> : (
        <ul className="admin-list">
          {entries.filter(entry => entry.email.includes(search.toLowerCase())).map(entry => (
            <li key={entry.email}>
              <div><strong>{entry.email}</strong><br />
                <span className="muted small">Added {new Date(entry.created_at).toLocaleDateString()}</span>
                {entry.note && <p className="muted small">{entry.note}</p>}</div>
              <button type="button" className="button secondary" disabled={busy} onClick={() => {
                if (window.confirm(`Remove ${entry.email} from permitted emails? Existing sessions will not be revoked.`)) {
                  void mutate("DELETE", entry.email);
                }
              }}>Remove</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
