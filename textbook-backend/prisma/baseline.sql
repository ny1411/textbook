-- CreateEnum
CREATE TYPE "STATUS" AS ENUM ('UPLOADED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "MESSAGEROLES" AS ENUM ('USER', 'LLM', 'SYSTEM');

-- CreateEnum
CREATE TYPE "DOCUMENTTYPE" AS ENUM ('IMAGE', 'VIDEO', 'PDF', 'WORD', 'CSV', 'EXCEL', 'PRESENTATION');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "profileImageUrl" TEXT,
    "bio" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notebooks" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notebooks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "uploaded_documents" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notebookId" UUID NOT NULL,
    "name" TEXT,
    "fileType" TEXT,
    "fileSize" TEXT,
    "storageUrl" TEXT,
    "status" "STATUS" NOT NULL DEFAULT 'UPLOADED',
    "pageCount" INTEGER,
    "sampleKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "uploaded_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notebookId" UUID NOT NULL,
    "title" TEXT,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_deletions" (
    "documentId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notebookId" UUID NOT NULL,
    "storagePath" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "document_deletions_pkey" PRIMARY KEY ("documentId")
);

-- CreateTable
CREATE TABLE "conversation_documents" (
    "conversationId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversation_documents_pkey" PRIMARY KEY ("conversationId","documentId")
);

-- CreateTable
CREATE TABLE "conversation_messages" (
    "id" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "role" "MESSAGEROLES" NOT NULL,
    "message" TEXT,
    "sequence" INTEGER NOT NULL,
    "requestId" UUID,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "message_sources" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "sourceId" TEXT NOT NULL,
    "pageNumber" INTEGER,
    "chunkRef" TEXT,
    "citationText" TEXT,

    CONSTRAINT "message_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_attachments" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notebookId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "messageId" UUID,
    "name" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "digest" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chat_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "generated_artifacts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notebookId" UUID NOT NULL,
    "conversationId" UUID NOT NULL,
    "type" "DOCUMENTTYPE" NOT NULL,
    "title" TEXT,
    "content" TEXT,
    "storageUrl" TEXT,
    "status" "STATUS" NOT NULL DEFAULT 'PROCESSING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "generated_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserMemory" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "notebookId" TEXT,
    "memoryText" TEXT,
    "memoryType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserMemory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "defaultLLM" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "notebooks_userId_idx" ON "notebooks"("userId");

-- CreateIndex
CREATE INDEX "uploaded_documents_userId_idx" ON "uploaded_documents"("userId");

-- CreateIndex
CREATE INDEX "uploaded_documents_notebookId_idx" ON "uploaded_documents"("notebookId");

-- CreateIndex
CREATE UNIQUE INDEX "uploaded_documents_userId_notebookId_sampleKey_key" ON "uploaded_documents"("userId", "notebookId", "sampleKey");

-- CreateIndex
CREATE INDEX "conversations_userId_idx" ON "conversations"("userId");

-- CreateIndex
CREATE INDEX "conversations_notebookId_idx" ON "conversations"("notebookId");

-- CreateIndex
CREATE INDEX "conversations_userId_notebookId_updatedAt_idx" ON "conversations"("userId", "notebookId", "updatedAt");

-- CreateIndex
CREATE INDEX "document_deletions_userId_notebookId_idx" ON "document_deletions"("userId", "notebookId");

-- CreateIndex
CREATE INDEX "conversation_documents_documentId_idx" ON "conversation_documents"("documentId");

-- CreateIndex
CREATE INDEX "conversation_messages_conversationId_createdAt_idx" ON "conversation_messages"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversationId_sequence_key" ON "conversation_messages"("conversationId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "conversation_messages_conversationId_requestId_role_key" ON "conversation_messages"("conversationId", "requestId", "role");

-- CreateIndex
CREATE INDEX "message_sources_messageId_idx" ON "message_sources"("messageId");

-- CreateIndex
CREATE INDEX "message_sources_documentId_idx" ON "message_sources"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "message_sources_messageId_sourceId_key" ON "message_sources"("messageId", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "chat_attachments_storagePath_key" ON "chat_attachments"("storagePath");

-- CreateIndex
CREATE INDEX "chat_attachments_userId_conversationId_idx" ON "chat_attachments"("userId", "conversationId");

-- CreateIndex
CREATE INDEX "chat_attachments_expiresAt_idx" ON "chat_attachments"("expiresAt");

-- CreateIndex
CREATE INDEX "chat_attachments_messageId_idx" ON "chat_attachments"("messageId");

-- CreateIndex
CREATE INDEX "generated_artifacts_userId_idx" ON "generated_artifacts"("userId");

-- CreateIndex
CREATE INDEX "generated_artifacts_notebookId_idx" ON "generated_artifacts"("notebookId");

-- CreateIndex
CREATE INDEX "generated_artifacts_conversationId_idx" ON "generated_artifacts"("conversationId");

-- AddForeignKey
ALTER TABLE "notebooks" ADD CONSTRAINT "notebooks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "uploaded_documents" ADD CONSTRAINT "uploaded_documents_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deletions" ADD CONSTRAINT "document_deletions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_deletions" ADD CONSTRAINT "document_deletions_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_documents" ADD CONSTRAINT "conversation_documents_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_documents" ADD CONSTRAINT "conversation_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "uploaded_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversation_messages" ADD CONSTRAINT "conversation_messages_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "conversation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_sources" ADD CONSTRAINT "message_sources_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "uploaded_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_attachments" ADD CONSTRAINT "chat_attachments_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "conversation_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_notebookId_fkey" FOREIGN KEY ("notebookId") REFERENCES "notebooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generated_artifacts" ADD CONSTRAINT "generated_artifacts_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserMemory" ADD CONSTRAINT "UserMemory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
