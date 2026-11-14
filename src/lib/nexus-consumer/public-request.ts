import { ConsumerError } from "./service.ts";

function configuredOrigin(value:string):URL {
  const url=new URL(value);
  if(url.protocol!=="https:"||url.origin!==value||url.username||url.password)throw new Error("Invalid consumer HTTPS transport configuration");
  return url;
}

/** Direct HTTPS listener only. Next.js may construct Request.url using its bind
 * hostname. An explicitly configured transport origin permits that exact alias;
 * Host must still be the public authority. No proxy metadata selects a URL.
 * The deployment must terminate TLS in Next.js and expose no plain HTTP ingress.
 */
export function canonicalConsumerRequest(request:Request,publicOrigin:string,transportOrigin?:string):Request {
  const canonical=configuredOrigin(publicOrigin);
  const transport=transportOrigin?configuredOrigin(transportOrigin):canonical;
  const url=new URL(request.url);
  const deny=()=>{throw new ConsumerError(401,"invalid_dpop_proof");};
  if(url.protocol!=="https:"||![canonical.origin,transport.origin].includes(url.origin)||url.username||url.password||url.hash)deny();
  // Exact strings reject lists, duplicates, userinfo, whitespace, alternate ports
  // and ambiguous authorities. Next.js supplies these X-Forwarded fields when
  // absent; matching caller values are redundant, never trusted as evidence.
  if(request.headers.get("host")!==canonical.host)deny();
  for(const [name,expected] of [["x-forwarded-host",canonical.host],["x-forwarded-proto","https"],["x-forwarded-port",canonical.port||"443"]]){
    const value=request.headers.get(name);
    if(value!==null&&value!==expected)deny();
  }
  if(request.headers.has("forwarded"))deny();
  url.protocol=canonical.protocol;
  url.host=canonical.host;
  url.port=canonical.port;
  // Preserve method, headers, body and query; the Identity adapter receives the
  // same external URL that the client signs. Never resolve a // path as a host.
  return new Request(url,request);
}
