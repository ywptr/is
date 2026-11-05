import {membershipHandler} from "@/lib/nexus-memberships/runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const patch=membershipHandler("tenant","change");
export async function PATCH(req:Request,context:{params:Promise<{tenantId:string;userId?:string;invitationId?:string}>}){return patch(req,await context.params);}
