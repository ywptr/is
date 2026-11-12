"use client";
import {OAuthProvision} from './oauth-provision';
import {ConsumerAdministration} from './consumer-administration';

export function ApplicationClientAreas({consumerAdminEnabled}:{consumerAdminEnabled:boolean}){
 return <>
  <nav aria-label="Application client purposes"><a href="#oidc-clients">OIDC Clients</a>{' · '}<a href="#nexus-consumer-clients">Nexus Consumer API Clients</a>{' · '}<a href="#service-clients">Service Clients (planned)</a></nav>
  <OAuthProvision/>
  {consumerAdminEnabled?<ConsumerAdministration/>:<section id="nexus-consumer-clients"><h2>Nexus Consumer API Clients</h2><p>Consumer credential administration is disabled pending review.</p></section>}
  <section id="service-clients" className="identity-box"><h2>Service Clients — planned</h2><p>Application-to-application operations, such as Sandcastle → IG, require distinct credentials, receiving audiences and explicit tenant/operation grants. Registration and service-token issuance are not implemented. Client credentials never imply human impersonation.</p></section>
 </>;
}
