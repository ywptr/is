-- Candidate: apply only after exact-target/ledger review and separate approval.
-- Provider clients, credentials, sessions and existing association IDs are untouched.
ALTER TABLE nexus_application_oauth_clients
  ADD COLUMN purpose text NOT NULL DEFAULT 'oidc'
  CHECK (purpose IN ('oidc','nexus_consumer'));

-- Preserve already-established consumer bindings; classification grants nothing.
-- Reject ambiguous historical linkage rather than infer from scopes, names or email.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM identity_credential_bindings b
    JOIN nexus_application_oauth_clients l ON l.oauth_client_id=b.client_id
    WHERE l.application_id<>b.application_id OR l.environment<>b.environment
  ) THEN RAISE EXCEPTION 'OAuth binding reconciliation required'; END IF;
END $$;
UPDATE nexus_application_oauth_clients l SET purpose='nexus_consumer'
WHERE EXISTS (SELECT 1 FROM identity_credential_bindings b
  WHERE b.client_id=l.oauth_client_id AND b.application_id=l.application_id
    AND b.environment=l.environment);

ALTER TABLE nexus_application_oauth_clients
  DROP CONSTRAINT nexus_application_oauth_clients_application_id_environment_key,
  ADD CONSTRAINT nexus_oauth_application_environment_purpose_key
    UNIQUE (application_id,environment,purpose);
COMMENT ON COLUMN nexus_application_oauth_clients.purpose IS
  'Independent registration purpose. OIDC and Nexus consumer grants never imply each other. Service clients are not implemented.';
