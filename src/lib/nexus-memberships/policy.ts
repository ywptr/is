export type Role = "owner" | "admin" | "member";
export type Status = "active" | "inactive";
export type Mode = "operator" | "tenant";
export type Member = {user_id:string; role:Role; status:Status; version:number};
export class MembershipError extends Error {
  status: number;
  constructor(code:string, status=409) { super(code); this.status=status; }
}
export function canManage(mode:Mode, actor:Member|null, previous:Pick<Member,"role">|null, nextRole:Role):boolean {
  if(mode === "operator") return true;
  if(actor?.status !== "active") return false;
  if(actor.role === "owner") return true;
  return actor.role === "admin" && (!previous || previous.role === "member") && nextRole === "member";
}
export function isAdmin(member:Pick<Member,"role"|"status">):boolean {
  return member.status === "active" && member.role !== "member";
}
