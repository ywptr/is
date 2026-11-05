import {membershipHandler} from "@/lib/nexus-memberships/runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const post=membershipHandler("tenant","revoke");
export async function POST(req:Request,context:{params:Promise<{tenantId:string;userId?:string;invitationId?:string}>}){return post(req,await context.params);}
