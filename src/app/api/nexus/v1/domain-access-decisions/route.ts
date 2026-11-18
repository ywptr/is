import {domainDecisionHandler} from '@/lib/identity/admission/runtime';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export async function POST(request:Request){return domainDecisionHandler()(request);}
