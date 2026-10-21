-- Nexus is an internal IS module. No automatic privilege inheritance from IS admins.
CREATE TABLE nexus_operators (
  user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
  granted_at timestamptz NOT NULL DEFAULT now(),
  granted_by text REFERENCES "user"(id) ON DELETE RESTRICT
);

CREATE TABLE nexus_operator_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  action text NOT NULL CHECK (action IN ('bootstrap','grant','revoke')),
  target_user_id text NOT NULL,
  actor_user_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX nexus_operator_audit_recent_idx ON nexus_operator_audit (occurred_at DESC);

-- Serialize deletions at transaction scope; after the lock, count committed operators.
-- DB-level protection also covers accidental SQL DELETE outside the API.
CREATE FUNCTION nexus_prevent_last_operator() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(83792422);
  IF (SELECT count(*) FROM nexus_operators) <= 1 THEN
    RAISE EXCEPTION 'cannot remove the final Nexus operator' USING ERRCODE = '23514';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER nexus_keep_last_operator
BEFORE DELETE ON nexus_operators
FOR EACH ROW EXECUTE FUNCTION nexus_prevent_last_operator();
