-- Server-side drafts for purchase/sales bill & challan entry forms (per admin user).
CREATE TABLE IF NOT EXISTS entry_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  draft_kind VARCHAR(32) NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_entry_drafts_user_kind UNIQUE (user_id, draft_kind)
);

CREATE INDEX IF NOT EXISTS ix_entry_drafts_user_id ON entry_drafts(user_id);
