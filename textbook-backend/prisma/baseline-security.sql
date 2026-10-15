-- Companion to baseline.sql: backend-only tables in a Supabase exposed schema.
-- Run in the same transaction and search_path as the generated baseline.
-- Keep attachment invariants from changes/issue-20-chat-images.sql, which Prisma
-- cannot represent. Do not rerun the historical upgrade scripts on this baseline.
ALTER TABLE chat_attachments
    ADD CONSTRAINT chat_attachments_media_type_check
        CHECK ("mediaType" IN ('image/png', 'image/jpeg', 'image/webp')),
    ADD CONSTRAINT chat_attachments_size_check
        CHECK (size > 0 AND size <= 10485760),
    ADD CONSTRAINT chat_attachments_state_check
        CHECK (state IN ('uploading', 'pending', 'attached', 'deleting')),
    ADD CONSTRAINT chat_attachments_lifecycle_check
        CHECK ((state = 'attached' AND "messageId" IS NOT NULL AND "expiresAt" IS NULL)
            OR (state <> 'attached' AND "messageId" IS NULL AND "expiresAt" IS NOT NULL));

DO $$
DECLARE
    table_name text;
    role_name text;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'users', 'notebooks', 'uploaded_documents', 'conversations',
        'document_deletions', 'conversation_documents', 'conversation_messages',
        'message_sources', 'chat_attachments', 'generated_artifacts',
        'UserMemory', 'UserPreferences'
    ] LOOP
        EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
        EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC', table_name);
        FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
                EXECUTE format('REVOKE ALL ON TABLE %I FROM %I', table_name, role_name);
            END IF;
        END LOOP;
    END LOOP;
END $$;
