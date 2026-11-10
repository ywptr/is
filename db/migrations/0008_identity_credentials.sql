-- Candidate 0008: Identity-owned infrastructure, default unconfigured/deny.
-- No Better Auth schema, historical migration or Nexus governance changes.
CREATE TABLE identity_credential_authorities (
  issuer text PRIMARY KEY CHECK (issuer ~ '^https://'),
  revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0)
);
CREATE TABLE identity_credential_epochs (
  issuer text NOT NULL REFERENCES identity_credential_authorities(issuer) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('client','session','user','sender_key','signing_key')),
  subject_key text NOT NULL CHECK (length(subject_key) BETWEEN 1 AND 2048),
  generation bigint NOT NULL DEFAULT 1 CHECK (generation > 0),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (issuer,kind,subject_key)
);
CREATE TABLE identity_credential_bindings (
  issuer text NOT NULL REFERENCES identity_credential_authorities(issuer) ON DELETE RESTRICT,
  client_id text NOT NULL,
  audience text NOT NULL CHECK (audience ~ '^https://'),
  environment text NOT NULL CHECK (environment IN ('development','staging','production')),
  application_id uuid NOT NULL REFERENCES nexus_applications(id) ON DELETE RESTRICT,
  scopes text[] NOT NULL CHECK (cardinality(scopes) > 0),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY (issuer,client_id,audience,environment)
);
CREATE TABLE identity_subject_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL REFERENCES identity_credential_authorities(issuer) ON DELETE RESTRICT,
  client_id text NOT NULL,
  namespace text NOT NULL CHECK (namespace IN ('provider_access_subject','pairwise')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 2048),
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  evidence_id uuid NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz,
  UNIQUE (issuer,client_id,namespace,subject)
);
CREATE INDEX identity_subject_user_idx ON identity_subject_mappings(user_id);
CREATE TABLE identity_access_issuances (
  issuer text NOT NULL REFERENCES identity_credential_authorities(issuer) ON DELETE RESTRICT,
  token_id text NOT NULL,
  audience text NOT NULL,
  environment text NOT NULL,
  client_id text NOT NULL,
  mapping_id uuid NOT NULL REFERENCES identity_subject_mappings(id) ON DELETE RESTRICT,
  token_digest text NOT NULL CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  -- Immutable original session lineage deliberately has no provider FK SET NULL.
  session_id text NOT NULL,
  grant_class text NOT NULL CHECK (grant_class = 'human_authorization_code'),
  grant_id text,
  sender_key text NOT NULL,
  signing_key text NOT NULL,
  scopes text[] NOT NULL,
  generations jsonb NOT NULL CHECK (jsonb_typeof(generations)='object' AND generations ?& ARRAY['client','session','user','sender_key','signing_key']),
  issued_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  retain_until timestamptz NOT NULL,
  evidence_id uuid NOT NULL UNIQUE,
  PRIMARY KEY (issuer,token_id),
  FOREIGN KEY (issuer,client_id,audience,environment)
    REFERENCES identity_credential_bindings(issuer,client_id,audience,environment) ON DELETE RESTRICT,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '300 seconds'),
  CHECK (retain_until >= expires_at + interval '30 days')
);
CREATE INDEX identity_issuance_mapping_idx ON identity_access_issuances(mapping_id);
CREATE INDEX identity_issuance_binding_idx ON identity_access_issuances(issuer,client_id,audience,environment);
CREATE INDEX identity_issuance_session_idx ON identity_access_issuances(issuer,session_id);
CREATE INDEX identity_issuance_retention_idx ON identity_access_issuances(retain_until);
CREATE TABLE identity_credential_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL REFERENCES identity_credential_authorities(issuer) ON DELETE RESTRICT,
  request_id uuid NOT NULL,
  actor_id text NOT NULL,
  action text NOT NULL,
  target_digest text NOT NULL CHECK (target_digest ~ '^[0-9a-f]{64}$'),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 512),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (issuer,request_id)
);
CREATE TABLE identity_dpop_nonces (
  digest text PRIMARY KEY CHECK (digest ~ '^[0-9a-f]{64}$'),
  issuer text NOT NULL REFERENCES identity_credential_authorities(issuer) ON DELETE RESTRICT,
  audience text NOT NULL,
  environment text NOT NULL,
  sender_key text NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamptz NOT NULL,
  CHECK (expires_at > issued_at AND expires_at <= issued_at + interval '60 seconds')
);
CREATE INDEX identity_nonce_expiry_idx ON identity_dpop_nonces(expires_at);

-- Guard irreversible state and immutable credential provenance even for SQL writers.
CREATE FUNCTION identity_credential_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'identity_access_issuances' THEN
    IF (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at')
       OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
      RAISE EXCEPTION 'immutable Identity issuance' USING ERRCODE = '23514';
    END IF;
  ELSIF TG_TABLE_NAME = 'identity_subject_mappings' THEN
    IF (to_jsonb(NEW) - 'revoked_at') IS DISTINCT FROM (to_jsonb(OLD) - 'revoked_at')
       OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
      RAISE EXCEPTION 'immutable Identity mapping' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.generation < OLD.generation OR
      (NEW.enabled IS DISTINCT FROM OLD.enabled AND NEW.generation <= OLD.generation) THEN
    RAISE EXCEPTION 'nonmonotonic Identity generation' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER identity_issuance_immutable BEFORE UPDATE ON identity_access_issuances
  FOR EACH ROW EXECUTE FUNCTION identity_credential_immutable();
CREATE TRIGGER identity_mapping_immutable BEFORE UPDATE ON identity_subject_mappings
  FOR EACH ROW EXECUTE FUNCTION identity_credential_immutable();
CREATE TRIGGER identity_epoch_monotonic BEFORE UPDATE ON identity_credential_epochs
  FOR EACH ROW EXECUTE FUNCTION identity_credential_immutable();
CREATE INDEX identity_nonce_authority_key_idx ON identity_dpop_nonces(issuer,sender_key,expires_at);
CREATE INDEX identity_binding_application_idx ON identity_credential_bindings(application_id);
CREATE FUNCTION identity_credential_epoch_retention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Identity generation tombstones must be retained' USING ERRCODE = '23514';
END $$;
CREATE TRIGGER identity_epoch_no_delete BEFORE DELETE OR TRUNCATE ON identity_credential_epochs
  FOR EACH STATEMENT EXECUTE FUNCTION identity_credential_epoch_retention();
