-- IS-DOMAIN#0001. Additive extension of the canonical, globally unique DNS registry.
-- Historical domains remain unverified. No client is opted in and no tenant is created.
CREATE TABLE nexus_domain_epochs (
 hostname varchar(255) PRIMARY KEY,
 revision bigint NOT NULL CHECK(revision>0)
);
INSERT INTO nexus_domain_epochs SELECT hostname,1 FROM nexus_tenant_domains;
ALTER TABLE nexus_tenant_domains
 ADD COLUMN application_id uuid REFERENCES nexus_applications(id) ON DELETE RESTRICT,
 ADD COLUMN environment text CHECK(environment IN ('development','staging','production')),
 ADD COLUMN admission_origin text,
 ADD COLUMN binding_status text NOT NULL DEFAULT 'unverified' CHECK(binding_status IN ('unverified','active','suspended')),
 ADD COLUMN domain_revision bigint NOT NULL DEFAULT 1 CHECK(domain_revision>0),
 ADD COLUMN verification_method text CHECK(verification_method IN ('dns_txt','platform')),
 ADD COLUMN verified_at timestamptz,
 ADD COLUMN challenge_digest text CHECK(challenge_digest ~ '^[a-f0-9]{64}$'),
 ADD COLUMN challenge_expires_at timestamptz,
 ADD CONSTRAINT nexus_domain_epoch_fk FOREIGN KEY(hostname) REFERENCES nexus_domain_epochs(hostname) ON DELETE RESTRICT,
 ADD CONSTRAINT nexus_domain_binding_complete CHECK(
   (application_id IS NULL AND environment IS NULL AND admission_origin IS NULL) OR
   (application_id IS NOT NULL AND environment IS NOT NULL AND admission_origin IS NOT NULL AND admission_origin ~ '^https://')),
 ADD CONSTRAINT nexus_domain_binding_active CHECK(binding_status<>'active' OR
   (application_id IS NOT NULL AND environment IS NOT NULL AND admission_origin IS NOT NULL AND verified_at IS NOT NULL AND verification_method IS NOT NULL));
CREATE TABLE nexus_domain_binding_audit (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 hostname varchar(255) REFERENCES nexus_domain_epochs(hostname) ON DELETE RESTRICT,
 client_id text,
 actor_user_id text REFERENCES "user"(id) ON DELETE RESTRICT,
 action text NOT NULL,
 reason text NOT NULL,
 request_id text,
 before_value jsonb,
 after_value jsonb,
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX nexus_domain_audit_hostname ON nexus_domain_binding_audit(hostname,id DESC);
CREATE FUNCTION nexus_domain_epoch_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP IN ('DELETE','TRUNCATE') OR pg_trigger_depth()<2 OR
   (TG_OP='UPDATE' AND (NEW.hostname<>OLD.hostname OR NEW.revision<=OLD.revision)) THEN
   RAISE EXCEPTION 'Domain generations are retained and trigger maintained' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER nexus_domain_epoch_guard BEFORE INSERT OR UPDATE OR DELETE ON nexus_domain_epochs
 FOR EACH ROW EXECUTE FUNCTION nexus_domain_epoch_guard();
CREATE TRIGGER nexus_domain_epoch_no_truncate BEFORE TRUNCATE ON nexus_domain_epochs
 FOR EACH STATEMENT EXECUTE FUNCTION nexus_domain_epoch_guard();
CREATE FUNCTION nexus_domain_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE h text; rev bigint;
BEGIN
 IF TG_OP='UPDATE' THEN
  IF NEW.hostname<>OLD.hostname OR NEW.domain_revision<>OLD.domain_revision THEN
   RAISE EXCEPTION 'Immutable domain key and trigger-owned revision' USING ERRCODE='23514';
  END IF;
  IF (NEW.tenant_id,NEW.application_id,NEW.environment,NEW.admission_origin)
     IS DISTINCT FROM (OLD.tenant_id,OLD.application_id,OLD.environment,OLD.admission_origin) THEN
    NEW.binding_status:='unverified';NEW.verified_at:=NULL;NEW.verification_method:=NULL;
    IF NEW.challenge_digest IS NOT DISTINCT FROM OLD.challenge_digest THEN NEW.challenge_digest:=NULL;NEW.challenge_expires_at:=NULL;END IF;
  END IF;
  IF NEW.binding_status='suspended' THEN
    NEW.verified_at:=NULL;NEW.verification_method:=NULL;NEW.challenge_digest:=NULL;NEW.challenge_expires_at:=NULL;
  END IF;
  IF (to_jsonb(NEW)-'domain_revision'-'is_primary'-'created_at')=(to_jsonb(OLD)-'domain_revision'-'is_primary'-'created_at') THEN RETURN NEW; END IF;
 END IF;
 h:=CASE WHEN TG_OP='DELETE' THEN OLD.hostname ELSE NEW.hostname END;
 INSERT INTO nexus_domain_epochs(hostname,revision) VALUES(h,1)
 ON CONFLICT(hostname) DO UPDATE SET revision=nexus_domain_epochs.revision+1 RETURNING revision INTO rev;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 NEW.domain_revision:=rev;
 RETURN NEW;
END $$;
CREATE TRIGGER nexus_domain_revision BEFORE INSERT OR UPDATE OR DELETE ON nexus_tenant_domains
 FOR EACH ROW EXECUTE FUNCTION nexus_domain_revision();
CREATE FUNCTION nexus_domain_audit() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE actor text:=NULLIF(current_setting('is.domain_actor',true),'');
BEGIN
 INSERT INTO nexus_domain_binding_audit(hostname,actor_user_id,action,reason,request_id,before_value,after_value)
 VALUES(COALESCE(NEW.hostname,OLD.hostname),actor,COALESCE(NULLIF(current_setting('is.domain_action',true),''),lower(TG_OP)),
 COALESCE(NULLIF(current_setting('is.domain_reason',true),''),'legacy/operational registry write'),NULLIF(current_setting('is.domain_request',true),''),
 CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD)-'challenge_digest' END,
 CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW)-'challenge_digest' END);
 RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER nexus_domain_audit AFTER INSERT OR UPDATE OR DELETE ON nexus_tenant_domains
 FOR EACH ROW EXECUTE FUNCTION nexus_domain_audit();
CREATE FUNCTION nexus_domain_retention() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Domain audit/history cannot be erased' USING ERRCODE='23514'; END $$;
CREATE TRIGGER nexus_domain_audit_append_only BEFORE UPDATE OR DELETE ON nexus_domain_binding_audit
 FOR EACH ROW EXECUTE FUNCTION nexus_domain_retention();
CREATE TRIGGER nexus_domain_audit_no_truncate BEFORE TRUNCATE ON nexus_domain_binding_audit
 FOR EACH STATEMENT EXECUTE FUNCTION nexus_domain_retention();
CREATE TRIGGER nexus_domain_registry_no_truncate BEFORE TRUNCATE ON nexus_tenant_domains
 FOR EACH STATEMENT EXECUTE FUNCTION nexus_domain_retention();

ALTER TABLE nexus_application_oauth_clients
 ADD COLUMN admission_mode text NOT NULL DEFAULT 'choice' CHECK(admission_mode IN ('choice','domain')),
 ADD COLUMN admission_mode_revision bigint NOT NULL DEFAULT 1 CHECK(admission_mode_revision>0);
CREATE FUNCTION nexus_domain_client_mode() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.admission_mode_revision<>OLD.admission_mode_revision THEN
  RAISE EXCEPTION 'Admission mode revision is trigger maintained' USING ERRCODE='23514';
 END IF;
 IF (NEW.admission_mode,NEW.application_id,NEW.environment,NEW.oauth_client_id,NEW.purpose)
 IS DISTINCT FROM (OLD.admission_mode,OLD.application_id,OLD.environment,OLD.oauth_client_id,OLD.purpose) THEN
  NEW.admission_mode_revision:=OLD.admission_mode_revision+1;
  INSERT INTO nexus_domain_binding_audit(client_id,actor_user_id,action,reason,request_id,before_value,after_value)
  VALUES(NEW.oauth_client_id,NULLIF(current_setting('is.domain_actor',true),''),'client_mode',
   COALESCE(NULLIF(current_setting('is.domain_reason',true),''),'operational client linkage write'),NULLIF(current_setting('is.domain_request',true),''),
   jsonb_build_object('mode',OLD.admission_mode,'revision',OLD.admission_mode_revision),
   jsonb_build_object('mode',NEW.admission_mode,'revision',NEW.admission_mode_revision));
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER nexus_domain_client_mode BEFORE UPDATE ON nexus_application_oauth_clients
 FOR EACH ROW EXECUTE FUNCTION nexus_domain_client_mode();
