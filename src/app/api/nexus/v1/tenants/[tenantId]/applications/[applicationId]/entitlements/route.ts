import { consumerHandler } from "@/lib/nexus-consumer/runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handler=consumerHandler("entitlements");
export async function GET(request:Request,context:{params:Promise<{tenantId:string;applicationId:string}>}){return handler(request,await context.params);}
