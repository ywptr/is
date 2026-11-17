import { randomBytes, randomUUID } from "node:crypto";
import { IdentityOperationError } from "../operation-error.ts";
import { nonceChallenge } from "../dpop-nonce.ts";
import { ConsumerError } from "../../nexus-consumer/service.ts";
import { canonicalConsumerRequest } from "../../nexus-consumer/public-request.ts";
import { fail, uuid } from "./validation.ts";
import type { createAdmissionService } from "./service.ts";
export type AdmissionOperation = "authorize" | "choices" | "selection" | "redemptions";
export interface AdmissionHTTPOptions {
  enabled: () => boolean; publicOrigin: string; transportOrigin?: string;
  authenticated: (headers: Headers) => Promise<boolean>;
  service: ReturnType<typeof createAdmissionService>;
}
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
function selectionPage(id: string, csrf: string, nonce: string) {
  // Data stays in inert escaped HTML; no user text is placed into executable JS.
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Choose tenant · IS</title>
<body><main><h1>Choose a tenant</h1><p>Confirm the tenant for this application. Your application maintains its own active tenant.</p>
<p id="status" role="status">Loading eligible tenants…</p><form id="selection" data-transaction="${escape(id)}" data-csrf="${escape(csrf)}"><label>Tenant <select id="tenant" required><option value="" selected disabled>Choose a tenant…</option></select></label>
<button id="confirm" disabled>Confirm tenant</button><button type="button" id="more" hidden>Load more tenants</button></form></main>
<script nonce="${nonce}">
const form=document.getElementById('selection'),select=document.getElementById('tenant'),status=document.getElementById('status'),confirm=document.getElementById('confirm'),more=document.getElementById('more');
const base='/api/is/v1/admission/transactions/'+form.dataset.transaction;let version,cursor;
async function load(){try{const r=await fetch(base+(cursor?'?cursor='+encodeURIComponent(cursor):''),{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)throw Error();const data=await r.json();version=data.version;for(const tenant of data.tenants){const o=document.createElement('option');o.value=tenant.tenantId;o.textContent=tenant.displayName;select.append(o);}cursor=data.cursor;more.hidden=!cursor;confirm.disabled=!select.value;status.textContent=select.options.length>1?'Confirm your tenant choice.':'No eligible tenants. Contact your tenant administrator.';}catch{confirm.disabled=true;more.hidden=true;status.textContent='Admission is unavailable. Return to your application and try again.';}}
select.onchange=()=>{confirm.disabled=!select.value;};
more.onclick=()=>{more.disabled=true;load().finally(()=>more.disabled=false);};
form.onsubmit=async event=>{event.preventDefault();confirm.disabled=true;try{const r=await fetch(base+'/selection',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':form.dataset.csrf,Accept:'application/json'},body:JSON.stringify({tenantId:select.value,expectedVersion:version})});if(r.ok){location.assign((await r.json()).redirect);}else throw Error();}catch{status.textContent='Selection failed. Return to your application and start again.';}};load();
</script></body></html>`;
}
export function createAdmissionHandler(deps: AdmissionHTTPOptions, operation: AdmissionOperation) {
  return async (request: Request, id?: string): Promise<Response> => {
    const requestId = randomUUID();
    const headers = { "Cache-Control": "no-store", "Pragma": "no-cache", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Request-ID": requestId };
    const json = (body: unknown, status = 200, extra: HeadersInit = {}) => Response.json(body, { status, headers: { ...headers, ...Object.fromEntries(new Headers(extra)) } });
    if (!deps.enabled()) return json({ error: "resource_not_available", requestId }, 404);
    try {
      request = canonicalConsumerRequest(request, deps.publicOrigin, deps.transportOrigin);
      const url = new URL(request.url), method = ["authorize", "choices"].includes(operation) ? "GET" : "POST";
      if (request.method !== method) return json({ error: "invalid_request", requestId }, 405, { Allow: method });
      if ([...request.headers.keys()].some(k => /^(x-actor|x-user|x-tenant|x-application)(-|$)/.test(k))) return fail();
      if (operation !== "redemptions") {
        const origin = request.headers.get("origin");
        if ((origin && origin !== deps.publicOrigin) || (operation === "selection" && origin !== deps.publicOrigin)) return fail(403, "invalid_origin");
        if (!await deps.authenticated(request.headers)) return fail(401, "authentication_required");
      }
      if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length !== 1)) return fail();
      if (operation === "authorize") {
        const started = await deps.service.start(request.headers, Object.fromEntries(url.searchParams));
        return new Response(null, { status: 302, headers: { ...headers, Location: `/api/is/v1/admission/transactions/${started.transactionId}`,
          "Set-Cookie": `__Host-is_admission_csrf=${started.csrf}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=300` } });
      }
      if (operation === "choices") {
        if (!id || !uuid(id) || [...url.searchParams.keys()].some(key => key !== "cursor")) return fail();
        const choices = await deps.service.choices(request.headers, id, url.searchParams.get("cursor") ?? undefined);
        if (request.headers.get("accept")?.includes("text/html")) {
          const csrf = cookie(request.headers, "__Host-is_admission_csrf"), nonce = randomBytes(24).toString("base64url");
          if (!csrf) return fail(403, "invalid_csrf");
          return new Response(selectionPage(id, csrf, nonce), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8",
            "Content-Security-Policy": `default-src 'none'; script-src 'nonce-${nonce}'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'` } });
        }
        return json(choices);
      }
      if (url.search) return fail();
      if (operation === "selection") {
        if (!id || !uuid(id) || request.headers.get("content-type")?.split(";")[0] !== "application/json") return fail();
        const csrf = request.headers.get("x-csrf-token"), stored = cookie(request.headers, "__Host-is_admission_csrf");
        if (!csrf || csrf !== stored) return fail(403, "invalid_csrf");
        const selected = await deps.service.confirm(request.headers, id, csrf, await readBody(request, 16384, true));
        if (request.headers.get("accept") === "application/json") return json(selected);
        return new Response(null, { status: 303, headers: { ...headers, Location: selected.redirect } });
      }
      if (request.headers.get("content-type")?.split(";")[0] !== "application/x-www-form-urlencoded") return fail();
      return json(await deps.service.redeem(request, await readBody(request, 32768, false)));
    } catch (error) {
      const challenge = nonceChallenge(error);
      if (challenge) return json({ ...(await challenge.json()), requestId }, 401, challenge.headers);
      if (error instanceof ConsumerError) return json({ error: "invalid_request", requestId }, 401);
      if (error instanceof IdentityOperationError) return json({ error: error.error, requestId }, error.status, error.status === 429 ? { "Retry-After": "60" } : {});
      return json({ error: "dependency_unavailable", requestId }, 503);
    }
  };
}
function cookie(headers: Headers, name: string) {
  const values = (headers.get("cookie") ?? "").split(";").map(v => v.trim()).filter(v => v.startsWith(name + "="));
  return values.length === 1 ? values[0].slice(name.length + 1) : null;
}
async function readBody(request: Request, max: number, json: boolean) {
  const reader = request.body?.getReader(); if (!reader) return fail();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([(async () => {
      const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > max) return fail(413, "request_too_large"); chunks.push(value); }
      let raw: string; try { raw = new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks)); } catch { return fail(); }
      if (json) { try { return JSON.parse(raw); } catch { return fail(); } }
      const params = new URLSearchParams(raw);
      if ([...params.keys()].some(key => params.getAll(key).length !== 1)) return fail();
      return Object.fromEntries(params);
    })(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new IdentityOperationError(400, "invalid_request")), 2000); })]);
  } finally { if (timer) clearTimeout(timer); void reader.cancel().catch(() => undefined); }
}
