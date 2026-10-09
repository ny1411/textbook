-- Apply once in the intended schema after issue-18/19; startup never migrates.
BEGIN;
ALTER TABLE notebooks ADD CONSTRAINT "notebooks_id_userId_key" UNIQUE (id, "userId");
CREATE TABLE concept_figures (
    id UUID PRIMARY KEY,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "notebookId" UUID NOT NULL,
    prompt TEXT NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 1200),
    caption TEXT NOT NULL CHECK (char_length(caption) <= 1200),
    "mediaType" TEXT NOT NULL DEFAULT 'image/png' CHECK ("mediaType" = 'image/png'),
    width INTEGER CHECK (width BETWEEN 1 AND 2048),
    height INTEGER CHECK (height BETWEEN 1 AND 2048),
    size INTEGER NOT NULL DEFAULT 0 CHECK (size BETWEEN 0 AND 8388608),
    digest TEXT,
    model TEXT NOT NULL,
    -- Snapshot survives source deletion; no FK to uploaded_documents.
    source JSONB CHECK (source IS NULL OR jsonb_typeof(source) = 'object'),
    "storagePath" TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('pending', 'saved', 'deleting')),
    "expiresAt" TIMESTAMPTZ,
    "uploadedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    FOREIGN KEY ("notebookId", "userId") REFERENCES notebooks(id, "userId") ON DELETE CASCADE,
    CHECK ((state = 'saved' AND "expiresAt" IS NULL AND "uploadedAt" IS NOT NULL)
        OR (state <> 'saved' AND "expiresAt" IS NOT NULL)),
    CHECK (("uploadedAt" IS NULL AND size = 0 AND width IS NULL AND height IS NULL AND digest IS NULL)
        OR ("uploadedAt" IS NOT NULL AND size > 0 AND width IS NOT NULL AND height IS NOT NULL AND digest IS NOT NULL AND digest ~ '^[a-f0-9]{64}$')),
    CHECK ("storagePath" = "userId"::text || '/' || "notebookId"::text || '/' || id::text || '.png')
);
CREATE INDEX "concept_figures_userId_notebookId_idx" ON concept_figures ("userId", "notebookId");
CREATE INDEX "concept_figures_expiresAt_idx" ON concept_figures ("expiresAt");
CREATE TABLE concept_figure_attempts (
    id UUID PRIMARY KEY,
    "userId" UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX "concept_figure_attempts_userId_createdAt_idx" ON concept_figure_attempts ("userId", "createdAt");
ALTER TABLE concept_figures ENABLE ROW LEVEL SECURITY;
ALTER TABLE concept_figure_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON concept_figures, concept_figure_attempts FROM PUBLIC;
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE 'REVOKE ALL ON concept_figures, concept_figure_attempts FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE 'REVOKE ALL ON concept_figures, concept_figure_attempts FROM authenticated';
    END IF;
END $$;
COMMIT;
