-- Stage 2D Identity integration sidecar. Does not modify 0008 or provider tables.
CREATE TABLE identity_consumer_codes (
  code_digest text PRIMARY KEY CHECK(code_digest ~ '^[0-9a-f]{64}$'),
  issuer text NOT NULL REFERENCES identity_credential_authorities(issuer) ON DELETE RESTRICT,
  client_id text NOT NULL, session_id text NOT NULL, user_id text NOT NULL,
  generations jsonb NOT NULL, expires_at timestamptz NOT NULL,
  token_id text, token_digest text, registered_until timestamptz,
  UNIQUE(issuer,token_id),
  CHECK ((token_id IS NULL AND token_digest IS NULL AND registered_until IS NULL) OR
    (token_id IS NOT NULL AND token_digest ~ '^[0-9a-f]{64}$' AND registered_until IS NOT NULL)),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX identity_consumer_code_expiry ON identity_consumer_codes(expires_at);
