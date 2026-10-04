-- Test-only subset of main's pre-#19 Prisma schema, including real constraints.
-- Never run this fixture against an existing or production database.
CREATE TYPE "STATUS" AS ENUM ('UPLOADED','PROCESSING','COMPLETED','FAILED');
CREATE TYPE "MESSAGEROLES" AS ENUM ('USER','LLM','SYSTEM');
CREATE TABLE users (
 id UUID PRIMARY KEY, name TEXT, email TEXT NOT NULL UNIQUE,
 "profileImageUrl" TEXT, bio TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE notebooks (
 id UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 name TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE INDEX "notebooks_userId_idx" ON notebooks ("userId");
CREATE TABLE uploaded_documents (
 id UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "notebookId" UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE,
 name TEXT, "fileType" TEXT, "fileSize" TEXT, "storageUrl" TEXT,
 status "STATUS" NOT NULL DEFAULT 'UPLOADED', "pageCount" INTEGER,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE conversations (
 id UUID PRIMARY KEY, "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 "notebookId" UUID NOT NULL REFERENCES notebooks(id) ON DELETE CASCADE, title TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE conversation_documents (
 "conversationId" UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 "documentId" UUID NOT NULL REFERENCES uploaded_documents(id) ON DELETE CASCADE,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 "updatedAt" TIMESTAMP(3) NOT NULL,
 PRIMARY KEY ("conversationId", "documentId")
);
CREATE TABLE conversation_messages (
 id UUID PRIMARY KEY, "conversationId" UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
 role "MESSAGEROLES" NOT NULL, message TEXT,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "conversation_messages_conversationId_createdAt_idx" ON conversation_messages ("conversationId", "createdAt");
CREATE TABLE message_sources (
 "messageId" UUID NOT NULL REFERENCES conversation_messages(id) ON DELETE CASCADE,
 "documentId" UUID NOT NULL REFERENCES uploaded_documents(id) ON DELETE CASCADE,
 "pageNumber" INTEGER, "chunkRef" TEXT, "citationText" TEXT,
 CONSTRAINT message_sources_pkey PRIMARY KEY ("messageId", "documentId")
);
