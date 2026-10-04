-- Reviewed upgrade for an existing schema matching main's Prisma models.
-- No production connection/migration is performed by application startup.
-- For an empty database, initialize the full schema with Prisma first, then
-- generate/apply an appropriate baseline rather than running this upgrade.
BEGIN;
ALTER TABLE conversations ADD COLUMN version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation_messages ADD COLUMN sequence INTEGER;
ALTER TABLE conversation_messages ADD COLUMN "requestId" UUID;
ALTER TABLE conversation_messages ADD COLUMN metadata JSONB;
WITH positions AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "conversationId" ORDER BY "createdAt", id) - 1 AS position
  FROM conversation_messages
)
UPDATE conversation_messages m SET sequence = p.position FROM positions p WHERE p.id = m.id;
ALTER TABLE conversation_messages ALTER COLUMN sequence SET NOT NULL;
UPDATE conversations c SET version = COALESCE((
  SELECT (MAX(sequence) + 2) / 2 FROM conversation_messages m WHERE m."conversationId" = c.id
), 0);
CREATE UNIQUE INDEX "conversation_messages_conversationId_sequence_key" ON conversation_messages ("conversationId", sequence);
CREATE UNIQUE INDEX "conversation_messages_conversationId_requestId_role_key" ON conversation_messages ("conversationId", "requestId", role);
CREATE INDEX "conversations_userId_notebookId_updatedAt_idx" ON conversations ("userId", "notebookId", "updatedAt");
ALTER TABLE message_sources ADD COLUMN id UUID;
ALTER TABLE message_sources ADD COLUMN "sourceId" TEXT;
-- Legacy rows never stored the original inline source ordinal. Preserve their
-- document references without inventing [Source N] mappings.
UPDATE message_sources SET id = gen_random_uuid(), "sourceId" = "documentId"::text;
ALTER TABLE message_sources DROP CONSTRAINT message_sources_pkey;
ALTER TABLE message_sources ALTER COLUMN id SET NOT NULL;
ALTER TABLE message_sources ALTER COLUMN "sourceId" SET NOT NULL;
ALTER TABLE message_sources ADD CONSTRAINT message_sources_pkey PRIMARY KEY (id);
CREATE UNIQUE INDEX "message_sources_messageId_sourceId_key" ON message_sources ("messageId", "sourceId");
CREATE INDEX "message_sources_messageId_idx" ON message_sources ("messageId");
COMMIT;
