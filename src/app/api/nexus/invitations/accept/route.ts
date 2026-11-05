import {membershipHandler} from "@/lib/nexus-memberships/runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const accept=membershipHandler("tenant","accept");
export async function POST(req:Request){return accept(req);}
