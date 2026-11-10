import { consumerHandler } from "@/lib/nexus-consumer/runtime";
export const runtime="nodejs";
export const dynamic="force-dynamic";
const handler=consumerHandler("decision");
export async function POST(request:Request){return handler(request);}
