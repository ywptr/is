-- Nexus-owned application catalog, tenant registry and application entitlements.
-- Better Auth tables and IS identity policy remain independently managed.
CREATE TABLE nexus_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app_key text NOT NULL UNIQUE CHECK (app_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  description text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nexus_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_key text NOT NULL UNIQUE CHECK (tenant_key ~ '^[a-z][a-z0-9_-]{1,62}$'),
  name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  admission_policy text NOT NULL DEFAULT 'invitation_only'
    CHECK (admission_policy IN ('invitation_only','public_registration','closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nexus_entitlements (
  tenant_id uuid NOT NULL REFERENCES nexus_tenants(id) ON DELETE RESTRICT,
  application_id uuid NOT NULL REFERENCES nexus_applications(id) ON DELETE RESTRICT,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL REFERENCES "user"(id),
  PRIMARY KEY(tenant_id, application_id)
);
CREATE INDEX nexus_entitlements_application_idx ON nexus_entitlements(application_id);

CREATE TABLE nexus_registry_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_user_id text NOT NULL REFERENCES "user"(id),
  entity_type text NOT NULL CHECK (entity_type IN ('application','tenant','entitlement')),
  entity_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('create','update','set_entitlement')),
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nexus_registry_audit_recent_idx ON nexus_registry_audit(created_at DESC);
