-- IG-compatible 36-character UUIDs: nexus_tenants.id is UUID and serializes to this format.
-- Do not replace IDs during a subsequent IG data migration.
CREATE TABLE nexus_tenant_domains (
  hostname varchar(255) PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES nexus_tenants(id) ON DELETE RESTRICT,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nexus_domain_lowercase CHECK (hostname = lower(hostname)),
  CONSTRAINT nexus_domain_shape CHECK (hostname ~ '^[a-z0-9][a-z0-9.-]*[a-z0-9]$' AND position('..' in hostname) = 0)
);
CREATE INDEX nexus_tenant_domains_tenant_idx ON nexus_tenant_domains(tenant_id);
CREATE UNIQUE INDEX nexus_tenant_domains_one_primary ON nexus_tenant_domains(tenant_id) WHERE is_primary;

-- OAuth clients are managed by Better Auth. This table stores only linkage and no secrets.
CREATE TABLE nexus_application_oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL REFERENCES nexus_applications(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK (environment IN ('development','staging','production')),
  oauth_client_id text NOT NULL UNIQUE,
  redirect_uris jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by text NOT NULL REFERENCES "user"(id),
  UNIQUE (application_id, environment)
);
CREATE INDEX nexus_app_oauth_app_idx ON nexus_application_oauth_clients(application_id);
