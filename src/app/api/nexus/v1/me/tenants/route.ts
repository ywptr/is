import { consumerHandler } from "@/lib/nexus-consumer/runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handler=consumerHandler("tenants");
export async function GET(request:Request){return handler(request);}
