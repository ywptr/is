-- Identity-owned durable operation journal. Candidate only; no provider table changes.
CREATE TABLE identity_credential_administration (
 request_id uuid PRIMARY KEY,
 actor_id text NOT NULL REFERENCES "user"(id) ON DELETE RESTRICT,
 issuer text NOT NULL CHECK(issuer ~ '^https://'),
 environment text NOT NULL CHECK(environment='development'),
 action text NOT NULL CHECK(action IN ('resource','provision','disable','enable','keys','revoke_token','invalidate')),
 payload_digest text NOT NULL CHECK(payload_digest ~ '^[0-9a-f]{64}$'),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 512),
 state text NOT NULL DEFAULT 'started' CHECK(state IN ('started','complete','failed')),
 result jsonb NOT NULL DEFAULT '{}',
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
