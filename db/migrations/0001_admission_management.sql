-- IS-owned admission policy. Better Auth tables remain managed separately.
CREATE TABLE IF NOT EXISTS is_admission_emails (
    email text PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text,
    note text,
    CONSTRAINT is_admission_email_normalized CHECK (email = lower(trim(email))),
    CONSTRAINT is_admission_email_length CHECK (length(email) BETWEEN 3 AND 254)
);

CREATE TABLE IF NOT EXISTS is_administrators (
    user_id text PRIMARY KEY REFERENCES "user"(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    created_by text
);

CREATE TABLE IF NOT EXISTS is_admission_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    action text NOT NULL CHECK (action IN ('add', 'remove')),
    email text NOT NULL,
    actor_user_id text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS is_admission_audit_occurred_at ON is_admission_audit (occurred_at DESC);
