import { MembershipError } from "./policy.ts";
import type { Role, Status } from "./policy.ts";
export const uuid = (v:unknown):v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
export const userId = (v:unknown):v is string => typeof v === "string" && v.length>0 && v.length<=255 && !/[\x00-\x1f]/.test(v);
export const role = (v:unknown):v is Role => v === "owner" || v === "admin" || v === "member";
export const status = (v:unknown):v is Status => v === "active" || v === "inactive";
export function object(value:unknown, keys:string[]):Record<string,unknown> {
  if(!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(k=>!keys.includes(k))) throw new MembershipError("invalid_body",400);
  return value as Record<string,unknown>;
}
export function reason(v:unknown):string {
  if(typeof v !== "string" || !v.trim() || v.trim().length>500) throw new MembershipError("invalid_reason",400);
  return v.trim();
}
export function email(v:unknown):string {
  if(typeof v !== "string") throw new MembershipError("invalid_email",400);
  const e=v.trim().toLowerCase();
  if(e.length>254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new MembershipError("invalid_email",400);
  return e;
}
export function page(url:URL) {
  const limit=Number(url.searchParams.get("limit")??50), cursor=url.searchParams.get("cursor");
  if(!Number.isInteger(limit) || limit<1 || limit>100 || (cursor!==null && !userId(cursor))) throw new MembershipError("invalid_page",400);
  return {limit,cursor};
}
export type Operation = "list"|"add"|"change"|"bootstrap"|"invitations"|"invite"|"revoke"|"accept";
export function input(op:Operation, value:unknown):Record<string,unknown> {
  if(op==="accept") {const b=object(value,["token"]); if(typeof b.token!=="string" || !/^[A-Za-z0-9_-]{43}$/.test(b.token)) throw new MembershipError("invalid_invitation",400); return b;}
  const keys=op==="change"?["role","status","expectedVersion","reason"]:op==="invite"?["email","userId","role","reason"]:op==="revoke"?["reason"]:["userId","role","reason"];
  const b=object(value,keys); b.reason=reason(b.reason);
  if(op==="invite") {b.email=email(b.email); if(b.userId!==undefined&&!userId(b.userId)) throw new MembershipError("invalid_user_id",400);}
  else if(op==="add"||op==="bootstrap") {if(!userId(b.userId)) throw new MembershipError("invalid_user_id",400);}
  if(op==="change"||op==="invite"||op==="add") {if(!role(b.role)) throw new MembershipError("invalid_role",400);}
  if(op==="bootstrap"&&b.role!==undefined) throw new MembershipError("invalid_body",400);
  if(op==="change"&&(!status(b.status)||!Number.isSafeInteger(b.expectedVersion)||Number(b.expectedVersion)<1)) throw new MembershipError("invalid_change",400);
  return b;
}
