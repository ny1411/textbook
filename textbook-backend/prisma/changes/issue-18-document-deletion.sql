-- Apply once, after issue-19-history.sql, to an existing matching schema.
-- Startup never applies this migration. Keep tombstones for replay ownership.
BEGIN;
CREATE TABLE document_deletions (
  "documentId" UUID PRIMARY KEY,
  "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  "notebookId" UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
  "storagePath" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3)
);
CREATE INDEX "document_deletions_userId_notebookId_idx" ON document_deletions ("userId", "notebookId");
ALTER TABLE document_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON document_deletions FROM PUBLIC;
-- Fail closed for Supabase browser roles, even with project default grants.
-- Local verification databases need not define those provider-specific roles.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON document_deletions FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON document_deletions FROM authenticated';
  END IF;
END $$;
COMMIT;
