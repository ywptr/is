-- Nexus-owned, additive. Identity 0008 remains immutable.
CREATE TABLE nexus_consumer_operations (
  issuer text NOT NULL, client_id text NOT NULL, audience text NOT NULL, environment text NOT NULL,
  operation text NOT NULL CHECK(operation ~ '^[a-z][a-z0-9_.:-]{1,119}$'),
  enabled boolean NOT NULL DEFAULT false,
  PRIMARY KEY(issuer,client_id,audience,environment,operation),
  FOREIGN KEY(issuer,client_id,audience,environment) REFERENCES identity_credential_bindings(issuer,client_id,audience,environment) ON DELETE RESTRICT
);
-- A coarse global revision intentionally invalidates every outstanding cursor on policy change.
CREATE TABLE nexus_consumer_revision (id boolean PRIMARY KEY DEFAULT true CHECK(id), version bigint NOT NULL DEFAULT 1 CHECK(version>0));
INSERT INTO nexus_consumer_revision(id) VALUES(true);
CREATE TABLE nexus_consumer_epochs (
  kind text NOT NULL, subject_key text NOT NULL, version bigint NOT NULL CHECK(version>0),
  PRIMARY KEY(kind,subject_key)
);
CREATE FUNCTION nexus_consumer_policy_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k text; v text;
BEGIN
  IF TG_TABLE_NAME='nexus_tenants' THEN k:='tenant'; v:=COALESCE(NEW.id,OLD.id)::text;
  ELSIF TG_TABLE_NAME='nexus_applications' THEN k:='application'; v:=COALESCE(NEW.id,OLD.id)::text;
  ELSIF TG_TABLE_NAME='nexus_entitlements' THEN k:='entitlement'; v:=COALESCE(NEW.tenant_id,OLD.tenant_id)::text||':'||COALESCE(NEW.application_id,OLD.application_id)::text;
  ELSIF TG_TABLE_NAME='nexus_tenant_memberships' THEN k:='membership'; v:=COALESCE(NEW.tenant_id,OLD.tenant_id)::text||':'||COALESCE(NEW.user_id,OLD.user_id);
  ELSE k:='consumerGrant'; v:='global'; END IF;
  INSERT INTO nexus_consumer_epochs(kind,subject_key,version) VALUES(k,v,1)
    ON CONFLICT(kind,subject_key) DO UPDATE SET version=nexus_consumer_epochs.version+1;
  UPDATE nexus_consumer_revision SET version=version+1 WHERE id=true;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER nexus_consumer_tenant_revision AFTER INSERT OR UPDATE OR DELETE ON nexus_tenants FOR EACH ROW EXECUTE FUNCTION nexus_consumer_policy_revision();
CREATE TRIGGER nexus_consumer_application_revision AFTER INSERT OR UPDATE OR DELETE ON nexus_applications FOR EACH ROW EXECUTE FUNCTION nexus_consumer_policy_revision();
CREATE TRIGGER nexus_consumer_entitlement_revision AFTER INSERT OR UPDATE OR DELETE ON nexus_entitlements FOR EACH ROW EXECUTE FUNCTION nexus_consumer_policy_revision();
CREATE TRIGGER nexus_consumer_membership_revision AFTER INSERT OR UPDATE OR DELETE ON nexus_tenant_memberships FOR EACH ROW EXECUTE FUNCTION nexus_consumer_policy_revision();
CREATE TRIGGER nexus_consumer_operation_revision AFTER INSERT OR UPDATE OR DELETE ON nexus_consumer_operations FOR EACH ROW EXECUTE FUNCTION nexus_consumer_policy_revision();
-- Triggers use tombstones even when the underlying resource is deleted/recreated.
INSERT INTO nexus_consumer_epochs SELECT 'tenant',id::text,1 FROM nexus_tenants;
INSERT INTO nexus_consumer_epochs SELECT 'application',id::text,1 FROM nexus_applications;
INSERT INTO nexus_consumer_epochs SELECT 'entitlement',tenant_id::text||':'||application_id::text,1 FROM nexus_entitlements;
INSERT INTO nexus_consumer_epochs SELECT 'membership',tenant_id::text||':'||user_id,version FROM nexus_tenant_memberships;
INSERT INTO nexus_consumer_epochs VALUES('consumerGrant','global',1);
CREATE TABLE nexus_consumer_cursors (
  digest text PRIMARY KEY, issuer text NOT NULL, client_id text NOT NULL, user_id text NOT NULL,
  application_id uuid NOT NULL, token_id text NOT NULL, query_revision bigint NOT NULL,
  after_id uuid NOT NULL, page_limit integer NOT NULL CHECK(page_limit BETWEEN 1 AND 100),
  expires_at timestamptz NOT NULL
);
CREATE INDEX nexus_consumer_cursor_expiry ON nexus_consumer_cursors(expires_at);
CREATE TABLE nexus_consumer_audit (
  decision_id uuid PRIMARY KEY, request_id uuid NOT NULL, user_id text NOT NULL,
  client_id text NOT NULL, application_id uuid NOT NULL,
  outcome text NOT NULL CHECK(outcome IN('allow','deny','read')),
  operation text NOT NULL, context_digest text NOT NULL,
  evaluated_at timestamptz NOT NULL, valid_until timestamptz NOT NULL
);
CREATE INDEX nexus_consumer_audit_time ON nexus_consumer_audit(evaluated_at);
CREATE TABLE nexus_consumer_rate_limits (
  budget_key text PRIMARY KEY, window_start timestamptz NOT NULL, attempts integer NOT NULL
);
-- Sidecars are trigger-owned; retention must never reset a resource's epoch.
CREATE FUNCTION nexus_consumer_epoch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('DELETE','TRUNCATE') OR pg_trigger_depth()<2 OR
     (TG_OP='UPDATE' AND NEW.version<=OLD.version) THEN
    RAISE EXCEPTION 'Nexus consumer revisions are trigger maintained' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER nexus_consumer_epochs_guard BEFORE INSERT OR UPDATE OR DELETE ON nexus_consumer_epochs
  FOR EACH ROW EXECUTE FUNCTION nexus_consumer_epoch_guard();
CREATE TRIGGER nexus_consumer_epochs_no_truncate BEFORE TRUNCATE ON nexus_consumer_epochs
  FOR EACH STATEMENT EXECUTE FUNCTION nexus_consumer_epoch_guard();
CREATE TRIGGER nexus_consumer_revision_guard BEFORE INSERT OR UPDATE OR DELETE ON nexus_consumer_revision
  FOR EACH ROW EXECUTE FUNCTION nexus_consumer_epoch_guard();
CREATE TRIGGER nexus_consumer_revision_no_truncate BEFORE TRUNCATE ON nexus_consumer_revision
  FOR EACH STATEMENT EXECUTE FUNCTION nexus_consumer_epoch_guard();
