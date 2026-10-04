const { randomUUID } = require('node:crypto');

class VerificationError extends Error {
    constructor(code) { super(code); this.code = code; }
}
function requireCheck(condition, code) {
    if (!condition) throw new VerificationError(code);
}
const finite = (value) => typeof value === 'number' && Number.isFinite(value);

// A valid PDF, generated locally without third-party models or fixture downloads.
function makePdf(runId = randomUUID()) {
    const subject = `Aster-${runId}`;
    const text = `${subject} calibration interval is 47 hours. Its alarm threshold is 12 degrees. Boreal calibration interval is 19 hours.`;
    const stream = `BT /F1 12 Tf 40 740 Td (${subject}) Tj 0 -30 Td (Calibration interval: 47 hours.) Tj 0 -24 Td (Alarm threshold: 12 degrees.) Tj 0 -24 Td (Boreal calibration interval: 19 hours.) Tj ET`;
    const objects = [
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
        `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`,
    ];
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, i) => {
        offsets.push(Buffer.byteLength(pdf));
        pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(pdf);
    pdf += `xref\n0 6\n0000000000 65535 f \n`;
    pdf += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
    pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return { pdf: Buffer.from(pdf), subject, text,
        query: `According to the uploaded source, what is the calibration interval for ${subject}? Cite the source.` };
}

function validateSearch(result, documentId, subject) {
    requireCheck(Array.isArray(result.results) && result.results.length > 0, 'search:no-results');
    requireCheck(result.results.every((item) => item.document_id === documentId), 'search:wrong-document');
    requireCheck(result.results.some((item) => finite(item.dense_score)), 'search:missing-dense-signal');
    requireCheck(result.results.some((item) => finite(item.sparse_score)), 'search:missing-sparse-signal');
    requireCheck(result.results.every((item) => finite(item.rrf_score) && item.rrf_score > 0), 'search:missing-fusion-score');
    requireCheck(result.results.every((item) => finite(item.rerank_score) && item.rerank_score >= 0 && item.rerank_score <= 1), 'search:invalid-rerank-score');
    requireCheck(result.results.some((item) => item.text.includes(subject)), 'search:missing-fixture-content');
}

function validateAnswer(answer, documentId, subject, search) {
    requireCheck(answer.is_grounded === true && answer.intent === 'textbook_rag', 'generation:not-grounded-rag');
    requireCheck(typeof answer.answer === 'string' && /\b47\s*(?:hours?|hrs?)\b/i.test(answer.answer), 'generation:incorrect-fact');
    requireCheck(Array.isArray(answer.citations) && answer.citations.length > 0, 'generation:no-citations');
    requireCheck(answer.citations.every((item) => item.document_id === documentId), 'generation:wrong-document');
    const chunks = new Set(search.results.map((item) => item.id));
    requireCheck(answer.citations.every((item) => chunks.has(item.chunk_id)), 'generation:unknown-chunk');
    requireCheck(answer.citations.some((item) => item.text.includes(subject)), 'generation:missing-source-content');
    requireCheck(answer.citations.every((item) => finite(item.rerank_score)), 'generation:missing-rerank-score');
    const markers = [...answer.answer.matchAll(/\[(?:Source\s*|source_)?([\w-]+)\]/gi)].map((match) => match[1]);
    const sourceIds = new Set(answer.citations.map((item) => String(item.source_id)));
    requireCheck(markers.length > 0 && markers.every((id) => sourceIds.has(id)), 'generation:invalid-inline-citations');
    requireCheck(!!answer.message_id && !!answer.conversation_id, 'generation:turn-not-saved');
}

function createApi(origin, authorization, fetcher = fetch) {
    return async (path, data) => {
        try {
            const response = await fetcher(new URL(path, origin), {
                method: data ? 'POST' : 'GET',
                headers: { Authorization: authorization, ...(data ? { 'Content-Type': 'application/json' } : {}) },
                body: data ? JSON.stringify(data) : undefined,
                signal: AbortSignal.timeout(180000),
            });
            requireCheck(response.ok, `api:http-${response.status}`);
            return await response.json();
        } catch (error) {
            if (error instanceof VerificationError) throw error;
            // Exceptions and server bodies may contain tokens or connection URLs.
            throw new VerificationError('api:request-or-json-failed');
        }
    };
}

async function waitForIngestion(api, documentId, { timeoutMs = 300000, intervalMs = 2000 } = {}) {
    const deadline = Date.now() + timeoutMs;
    do {
        const status = await api(`/api/documents/${documentId}/status`);
        if (status.status === 'ready') return;
        requireCheck(status.status === 'processing', 'ingestion:failed-or-unknown-status');
        if (Date.now() >= deadline) break;
        await new Promise((resolve) => setTimeout(resolve, Math.min(intervalMs, Math.max(0, deadline - Date.now()))));
    } while (Date.now() < deadline);
    throw new VerificationError('ingestion:timeout');
}

module.exports = { VerificationError, requireCheck, makePdf, validateSearch, validateAnswer, createApi, waitForIngestion };
