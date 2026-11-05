import {auth} from "@/lib/auth";
import {pool} from "@/lib/database";
import {hasTrustedOrigin} from "@/lib/admin-access";
import {createMembershipService} from "./service.ts";
import {hasMembershipAuthority} from "./access.ts";
import {createMembershipHandler} from "./http.ts";
import type {Mode} from "./policy.ts";
import type {Operation} from "./validation.ts";
export const membershipsEnabled=()=>process.env.NEXUS_MEMBERSHIPS_ENABLED==="true";
export async function membershipAuthorized(mode:Mode,id:string,tenant:string):Promise<boolean> {
  return hasMembershipAuthority(pool,mode,id,tenant);
}
const deps={enabled:membershipsEnabled,trustedOrigin:hasTrustedOrigin,
  sessionUser:async(headers:Headers)=>(await auth.api.getSession({headers}))?.user.id??null,
  authorized:membershipAuthorized,service:createMembershipService(pool)};
export const membershipHandler=(mode:Mode,op:Operation)=>createMembershipHandler(deps,mode,op);
