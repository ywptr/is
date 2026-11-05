-- Additive Nexus governance. Existing tenants remain uninitialized; no identity backfill.
CREATE TABLE nexus_tenant_membership_governance (
  tenant_id uuid PRIMARY KEY REFERENCES nexus_tenants(id) ON DELETE RESTRICT,
  active_admin_count integer NOT NULL DEFAULT 0 CHECK (active_admin_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE nexus_tenant_memberships (
  tenant_id uuid NOT NULL REFERENCES nexus_tenant_membership_governance(tenant_id) ON DELETE RESTRICT,
  user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  status text NOT NULL CHECK (status IN ('active','inactive')),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_by text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  updated_by text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id,user_id)
);
CREATE INDEX nexus_memberships_user_idx ON nexus_tenant_memberships(user_id,status,tenant_id);
CREATE TABLE nexus_tenant_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES nexus_tenant_membership_governance(tenant_id) ON DELETE RESTRICT,
  email text NOT NULL CHECK (email = lower(trim(email)) AND length(email) BETWEEN 3 AND 254),
  user_id text REFERENCES "user"(id) ON DELETE RESTRICT,
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  token_digest text NOT NULL UNIQUE CHECK (token_digest ~ '^[a-f0-9]{64}$'),
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','accepted','revoked','expired')),
  expires_at timestamptz NOT NULL,
  created_by text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  created_as text NOT NULL CHECK (created_as IN ('operator','tenant')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  accepted_by text REFERENCES "user"(id) ON DELETE RESTRICT,
  CHECK ((state = 'pending' AND resolved_at IS NULL) OR (state <> 'pending' AND resolved_at IS NOT NULL)),
  CHECK ((state = 'accepted') = (accepted_by IS NOT NULL))
);
CREATE UNIQUE INDEX nexus_invitation_pending_idx ON nexus_tenant_invitations(tenant_id,email) WHERE state='pending';
CREATE INDEX nexus_invitation_tenant_idx ON nexus_tenant_invitations(tenant_id,id);
CREATE TABLE nexus_tenant_membership_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES nexus_tenants(id) ON DELETE RESTRICT,
  actor_user_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
  target_user_id text REFERENCES "user"(id) ON DELETE RESTRICT,
  invitation_id uuid REFERENCES nexus_tenant_invitations(id) ON DELETE RESTRICT,
  action text NOT NULL CHECK (action IN ('bootstrap','add','change','invite','revoke_invitation','expire_invitation','accept_invitation')),
  before_value jsonb,
  after_value jsonb,
  reason text NOT NULL CHECK (length(trim(reason)) BETWEEN 1 AND 500),
  request_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nexus_membership_audit_tenant_idx ON nexus_tenant_membership_audit(tenant_id,id DESC);
-- Persisted per-user redemption budget, independent of failed redemption transactions.
CREATE TABLE nexus_invitation_redemption_limits (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
  window_start timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);

-- Counter changes can only originate in membership triggers. No SECURITY DEFINER.
CREATE FUNCTION nexus_guard_membership_governance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND
      (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR pg_trigger_depth() < 2)) OR
      (TG_OP = 'INSERT' AND NEW.active_admin_count <> 0) THEN
    RAISE EXCEPTION 'membership governance is trigger maintained' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nexus_membership_governance_guard BEFORE INSERT OR UPDATE OR DELETE
ON nexus_tenant_membership_governance FOR EACH ROW EXECUTE FUNCTION nexus_guard_membership_governance();

CREATE FUNCTION nexus_count_active_admins() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE delta integer := 0; target uuid;
BEGIN
  IF TG_OP = 'UPDATE' AND (NEW.tenant_id IS DISTINCT FROM OLD.tenant_id OR NEW.user_id IS DISTINCT FROM OLD.user_id) THEN
    RAISE EXCEPTION 'membership keys are immutable' USING ERRCODE='23514';
  END IF;
  IF TG_OP <> 'INSERT' THEN
    target := OLD.tenant_id;
    IF OLD.status='active' AND OLD.role IN ('owner','admin') THEN delta := delta - 1; END IF;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    target := NEW.tenant_id;
    IF NEW.status='active' AND NEW.role IN ('owner','admin') THEN delta := delta + 1; END IF;
  END IF;
  -- Atomic UPDATE serializes different membership rows on the same governance row.
  -- Updating even for delta=0 ensures every membership write participates.
  UPDATE nexus_tenant_membership_governance
    SET active_admin_count=active_admin_count+delta WHERE tenant_id=target;
  IF NOT FOUND THEN RAISE EXCEPTION 'membership governance missing' USING ERRCODE='23514'; END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER nexus_membership_admin_counter AFTER INSERT OR UPDATE OR DELETE
ON nexus_tenant_memberships FOR EACH ROW EXECUTE FUNCTION nexus_count_active_admins();

CREATE FUNCTION nexus_verify_membership_governance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE stored integer; actual integer;
BEGIN
  SELECT active_admin_count INTO stored FROM nexus_tenant_membership_governance WHERE tenant_id=NEW.tenant_id;
  SELECT count(*) INTO actual FROM nexus_tenant_memberships
    WHERE tenant_id=NEW.tenant_id AND status='active' AND role IN ('owner','admin');
  IF stored IS NULL OR stored < 1 OR stored <> actual THEN
    RAISE EXCEPTION 'last_admin_protected' USING ERRCODE='23514', CONSTRAINT='nexus_last_active_admin';
  END IF;
  RETURN NULL;
END;
$$;
-- Bootstrap may temporarily have zero admins, but may never commit that state.
CREATE CONSTRAINT TRIGGER nexus_membership_governance_valid AFTER INSERT OR UPDATE
ON nexus_tenant_membership_governance DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION nexus_verify_membership_governance();

CREATE FUNCTION nexus_reject_membership_truncate() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'membership history cannot be truncated' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER nexus_membership_no_truncate BEFORE TRUNCATE ON nexus_tenant_memberships
EXECUTE FUNCTION nexus_reject_membership_truncate();
CREATE TRIGGER nexus_governance_no_truncate BEFORE TRUNCATE ON nexus_tenant_membership_governance
EXECUTE FUNCTION nexus_reject_membership_truncate();
CREATE TRIGGER nexus_membership_audit_no_truncate BEFORE TRUNCATE ON nexus_tenant_membership_audit
EXECUTE FUNCTION nexus_reject_membership_truncate();

CREATE FUNCTION nexus_reject_membership_audit_edit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'membership audit is append only' USING ERRCODE='23514'; END;
$$;
CREATE TRIGGER nexus_membership_audit_append_only BEFORE UPDATE OR DELETE ON nexus_tenant_membership_audit
FOR EACH ROW EXECUTE FUNCTION nexus_reject_membership_audit_edit();
