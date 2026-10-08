-- Apply once to the current schema before deploying sample onboarding.
BEGIN;
ALTER TABLE uploaded_documents ADD COLUMN "sampleKey" TEXT;
-- NULL remains unrestricted for ordinary uploads; one sample edition per scope.
CREATE UNIQUE INDEX "uploaded_documents_userId_notebookId_sampleKey_key"
    ON uploaded_documents ("userId", "notebookId", "sampleKey");
COMMIT;
