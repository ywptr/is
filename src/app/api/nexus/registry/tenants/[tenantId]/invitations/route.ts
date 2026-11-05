import {membershipHandler} from "@/lib/nexus-memberships/runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const get=membershipHandler("operator","invitations");
export async function GET(req:Request,context:{params:Promise<{tenantId:string;userId?:string;invitationId?:string}>}){return get(req,await context.params);}
const post=membershipHandler("operator","invite");
export async function POST(req:Request,context:{params:Promise<{tenantId:string;userId?:string;invitationId?:string}>}){return post(req,await context.params);}
