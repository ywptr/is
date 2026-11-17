-- IS-ADMISSION-2 additive schema PROPOSAL. Not in the migration runner.
-- Assign a migration number only after actual target/branch ledger reconciliation.
-- Apply here only to synthetic disposable PostgreSQL fixtures.
CREATE TABLE identity_admission_transactions (
  id uuid PRIMARY KEY,
  issuer text NOT NULL REFERENCES identity_credential_authorities(issuer) ON DELETE RESTRICT,
  client_id text NOT NULL, application_id uuid NOT NULL REFERENCES nexus_applications(id) ON DELETE RESTRICT,
  environment text NOT NULL CHECK(environment IN ('development','staging','production')),
  binding jsonb NOT NULL CHECK(jsonb_typeof(binding)='object'),
  token_id text NOT NULL,
  redirect_uri text NOT NULL CHECK(redirect_uri ~ '^https://'),
  state text NOT NULL CHECK(length(state) BETWEEN 32 AND 512),
  nonce text NOT NULL CHECK(length(nonce) BETWEEN 32 AND 512),
  challenge text NOT NULL CHECK(challenge ~ '^[A-Za-z0-9_-]{43}$'),
  csrf_digest text NOT NULL CHECK(csrf_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL, expires_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  tenant_id uuid REFERENCES nexus_tenants(id) ON DELETE RESTRICT,
  code_digest text UNIQUE CHECK(code_digest ~ '^[a-f0-9]{64}$'),
  code_expires_at timestamptz, consumed_at timestamptz, policy_versions jsonb,
  FOREIGN KEY(issuer,token_id) REFERENCES identity_access_issuances(issuer,token_id) ON DELETE RESTRICT,
  CHECK(expires_at>created_at AND expires_at<=created_at+interval '5 minutes'),
  CHECK((tenant_id IS NULL AND code_digest IS NULL AND code_expires_at IS NULL AND policy_versions IS NULL) OR
    (tenant_id IS NOT NULL AND code_digest IS NOT NULL AND policy_versions IS NOT NULL AND jsonb_typeof(policy_versions)='object' AND code_expires_at>created_at AND code_expires_at<=expires_at)),
  CHECK(consumed_at IS NULL OR code_digest IS NOT NULL)
);
CREATE INDEX identity_admission_transaction_expiry ON identity_admission_transactions(expires_at);
CREATE INDEX identity_admission_transaction_user ON identity_admission_transactions((binding->>'userId'),expires_at);
CREATE TABLE identity_admissions (
  id uuid PRIMARY KEY, transaction_id uuid UNIQUE NOT NULL REFERENCES identity_admission_transactions(id) ON DELETE RESTRICT,
  token_digest text UNIQUE NOT NULL CHECK(token_digest ~ '^[a-f0-9]{64}$'),
  signing_key text NOT NULL, generation bigint NOT NULL DEFAULT 1 CHECK(generation>0),
  issued_at timestamptz NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  CHECK(expires_at>issued_at AND expires_at<=issued_at+interval '300 seconds')
);
CREATE TABLE identity_admission_cursors (
  digest text PRIMARY KEY CHECK(digest ~ '^[a-f0-9]{64}$'),
  transaction_id uuid NOT NULL REFERENCES identity_admission_transactions(id) ON DELETE RESTRICT,
  policy_revision bigint NOT NULL, after_id uuid NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE identity_admission_audit (
  id uuid PRIMARY KEY, transaction_id uuid REFERENCES identity_admission_transactions(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK(action IN ('start','choices','select','issue','revoke','validate')),
  context_digest text NOT NULL CHECK(context_digest ~ '^[a-f0-9]{64}$'), at timestamptz NOT NULL
);
CREATE TABLE identity_admission_budgets (
  key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts>0)
);
-- Retain receipt tombstones and immutable transaction lineage. No down migration.
CREATE FUNCTION identity_admission_retention_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') THEN RAISE EXCEPTION 'Admission history retained' USING ERRCODE='23514'; END IF;
  IF TG_TABLE_NAME='identity_admission_audit' THEN
    RAISE EXCEPTION 'Append only admission audit' USING ERRCODE='23514';
  ELSIF TG_TABLE_NAME='identity_admissions' THEN
    IF (NEW.id,NEW.transaction_id,NEW.token_digest,NEW.signing_key,NEW.issued_at,NEW.expires_at)
      IS DISTINCT FROM (OLD.id,OLD.transaction_id,OLD.token_digest,OLD.signing_key,OLD.issued_at,OLD.expires_at)
      OR NEW.generation<OLD.generation OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at)
      THEN RAISE EXCEPTION 'Immutable admission lineage' USING ERRCODE='23514'; END IF;
  ELSIF TG_TABLE_NAME='identity_admission_transactions' THEN
    IF (NEW.id,NEW.issuer,NEW.client_id,NEW.application_id,NEW.environment,NEW.binding,NEW.token_id,NEW.redirect_uri,NEW.state,NEW.nonce,NEW.challenge,NEW.csrf_digest,NEW.created_at,NEW.expires_at)
      IS DISTINCT FROM (OLD.id,OLD.issuer,OLD.client_id,OLD.application_id,OLD.environment,OLD.binding,OLD.token_id,OLD.redirect_uri,OLD.state,OLD.nonce,OLD.challenge,OLD.csrf_digest,OLD.created_at,OLD.expires_at)
      OR NEW.version<=OLD.version
      OR (OLD.code_digest IS NOT NULL AND (NEW.tenant_id,NEW.code_digest,NEW.code_expires_at,NEW.policy_versions) IS DISTINCT FROM (OLD.tenant_id,OLD.code_digest,OLD.code_expires_at,OLD.policy_versions))
      OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS DISTINCT FROM OLD.consumed_at)
      THEN RAISE EXCEPTION 'Immutable admission transaction' USING ERRCODE='23514'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER identity_admissions_guard BEFORE UPDATE OR DELETE ON identity_admissions FOR EACH ROW EXECUTE FUNCTION identity_admission_retention_guard();
CREATE TRIGGER identity_admissions_no_truncate BEFORE TRUNCATE ON identity_admissions FOR EACH STATEMENT EXECUTE FUNCTION identity_admission_retention_guard();
CREATE TRIGGER identity_admission_transactions_guard BEFORE UPDATE OR DELETE ON identity_admission_transactions FOR EACH ROW EXECUTE FUNCTION identity_admission_retention_guard();
CREATE TRIGGER identity_admission_transactions_no_truncate BEFORE TRUNCATE ON identity_admission_transactions FOR EACH STATEMENT EXECUTE FUNCTION identity_admission_retention_guard();
CREATE TRIGGER identity_admission_audit_no_delete BEFORE UPDATE OR DELETE ON identity_admission_audit FOR EACH ROW EXECUTE FUNCTION identity_admission_retention_guard();
CREATE TRIGGER identity_admission_audit_no_truncate BEFORE TRUNCATE ON identity_admission_audit FOR EACH STATEMENT EXECUTE FUNCTION identity_admission_retention_guard();
