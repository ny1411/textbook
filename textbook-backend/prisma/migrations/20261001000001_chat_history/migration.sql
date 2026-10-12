BEGIN;

-- CreateEnum
CREATE TYPE "MESSAGESTATUS" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- DropForeignKey
ALTER TABLE "message_sources" DROP CONSTRAINT "message_sources_documentId_fkey";

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "nextSequence" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "titleGenerated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "titleIsManual" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "conversation_messages" ADD COLUMN     "allDocuments" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "appliedQuery" TEXT,
ADD COLUMN     "confidenceScore" INTEGER,
ADD COLUMN     "critique" TEXT,
ADD COLUMN     "intent" TEXT,
ADD COLUMN     "isAgentMode" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isGrounded" BOOLEAN,
ADD COLUMN     "iterationCount" INTEGER,
ADD COLUMN     "leaseExpiresAt" TIMESTAMP(3),
ADD COLUMN     "processingToken" UUID,
ADD COLUMN     "query" TEXT,
ADD COLUMN     "requestFingerprint" TEXT,
ADD COLUMN     "requestId" UUID,
ADD COLUMN     "selectedDocumentIds" TEXT[],
ADD COLUMN     "sequence" INTEGER,
ADD COLUMN     "status" "MESSAGESTATUS" NOT NULL DEFAULT 'COMPLETED',
ADD COLUMN     "topK" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "useAnalysis" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "warning" TEXT;

-- AlterTable
ALTER TABLE "message_sources" DROP CONSTRAINT "message_sources_pkey",
ADD COLUMN     "documentName" TEXT,
ADD COLUMN     "id" UUID,
ADD COLUMN     "originalDocumentId" TEXT,
ADD COLUMN     "position" INTEGER,
ADD COLUMN     "rerankScore" DOUBLE PRECISION,
ADD COLUMN     "sourceId" TEXT,
ALTER COLUMN "documentId" DROP NOT NULL;

-- Preserve existing rows before making the new identity/order columns mandatory.
WITH ordered AS (
    SELECT id, row_number() OVER (PARTITION BY "conversationId" ORDER BY "createdAt", id) - 1 AS seq
    FROM conversation_messages
)
UPDATE conversation_messages AS m
SET "sequence" = ordered.seq, "requestId" = m.id, "requestFingerprint" = 'legacy',
    "selectedDocumentIds" = ARRAY[]::text[]
FROM ordered WHERE ordered.id = m.id;

UPDATE conversations AS c SET "nextSequence" = COALESCE((
    SELECT max(m.sequence) + 1 FROM conversation_messages m WHERE m."conversationId" = c.id
), 0), "titleIsManual" = (c.title IS NOT NULL);

WITH ordered AS (
    SELECT "messageId", "documentId",
           row_number() OVER (PARTITION BY "messageId" ORDER BY "documentId") - 1 AS pos
    FROM message_sources
)
UPDATE message_sources AS s
SET id = md5(s."messageId"::text || ':' || s."documentId"::text)::uuid,
    position = ordered.pos, "sourceId" = (ordered.pos + 1)::text,
    "originalDocumentId" = s."documentId"::text, "documentName" = d.name
FROM ordered, uploaded_documents d
WHERE ordered."messageId" = s."messageId" AND ordered."documentId" = s."documentId" AND d.id = s."documentId";

ALTER TABLE conversation_messages ALTER COLUMN "requestId" SET NOT NULL, ALTER COLUMN sequence SET NOT NULL;
ALTER TABLE message_sources ALTER COLUMN id SET NOT NULL, ALTER COLUMN position SET NOT NULL,
    ALTER COLUMN "sourceId" SET NOT NULL, ADD CONSTRAINT "message_sources_pkey" PRIMARY KEY (id);

-- CreateIndex
CREATE INDEX "conversations_userId_notebookId_updatedAt_idx" ON "conversations"("userId", "notebookId", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversationId_sequence_key" ON "conversation_messages"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversationId_requestId_role_key" ON "conversation_messages"("conversationId", "requestId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "message_sources_messageId_position_key" ON "message_sources"("messageId", "position");

-- AddForeignKey
ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "uploaded_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- These tables are accessed through the authenticated backend, never through browser writes.
-- Enable RLS and remove default Supabase Data API grants. The server's database role
-- must have the privileges required by Prisma; route handlers verify ownership explicitly.
DO $$
DECLARE table_name text; client_role text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY['users', 'notebooks', 'uploaded_documents', 'conversations',
        'conversation_documents', 'conversation_messages', 'message_sources', 'generated_artifacts',
        'UserMemory', 'UserPreferences'] LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
        FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
                EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, client_role);
            END IF;
        END LOOP;
    END LOOP;
END $$;

COMMIT;
