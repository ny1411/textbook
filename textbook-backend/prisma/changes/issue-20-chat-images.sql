-- Apply once after issue-19-history.sql, in the intended schema; startup never migrates.
BEGIN;
CREATE TABLE chat_attachments (
    id UUID PRIMARY KEY,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "notebookId" UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
    "conversationId" UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    "messageId" UUID REFERENCES conversation_messages(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    "mediaType" TEXT NOT NULL CHECK ("mediaType" IN ('image/png', 'image/jpeg', 'image/webp')),
    size INTEGER NOT NULL CHECK (size > 0 AND size <= 10485760),
    digest TEXT NOT NULL,
    "storagePath" TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('uploading', 'pending', 'attached', 'deleting')),
    "expiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((state = 'attached' AND "messageId" IS NOT NULL AND "expiresAt" IS NULL)
        OR (state <> 'attached' AND "messageId" IS NULL AND "expiresAt" IS NOT NULL))
);
CREATE INDEX "chat_attachments_userId_conversationId_idx" ON chat_attachments ("userId", "conversationId");
CREATE INDEX "chat_attachments_expiresAt_idx" ON chat_attachments ("expiresAt");
CREATE INDEX "chat_attachments_messageId_idx" ON chat_attachments ("messageId");
ALTER TABLE chat_attachments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON chat_attachments FROM PUBLIC;
-- Some local PostgreSQL instances have no Supabase roles. Production browser
-- roles receive no direct table access; backend service credentials own the API.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON chat_attachments FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON chat_attachments FROM authenticated';
    END IF;
END $$;
COMMIT;
