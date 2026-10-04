// Protocol fixtures exercise the verifier, not live retrieval/generation.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { makePdf, validateSearch, validateAnswer, createApi, waitForIngestion } = require('./protocol.cjs');
const subject = 'Aster-test';
const search = { results: [{ id: 'chunk-1', document_id: 'doc-1', text: `${subject}: 47 hours`, dense_score: 0.8, sparse_score: 1.2, rrf_score: 0.03, rerank_score: 0.9 }] };
const answer = { intent: 'textbook_rag', is_grounded: true, answer: '47 hours [Source 1].',
    message_id: 'message-1', conversation_id: 'conversation-1',
    citations: [{ document_id: 'doc-1', chunk_id: 'chunk-1', source_id: 1, text: `${subject}: 47 hours`, rerank_score: 0.9 }] };

test('accepts both retrieval signals and grounded citation provenance', () => {
    validateSearch(search, 'doc-1', subject);
    validateAnswer(answer, 'doc-1', subject, search);
});
for (const [field, value, code] of [
    ['dense_score', null, 'missing-dense-signal'], ['sparse_score', null, 'missing-sparse-signal'],
    ['document_id', 'another-document', 'wrong-document'], ['rerank_score', Infinity, 'invalid-rerank-score'],
    ['rerank_score', 1.1, 'invalid-rerank-score'], ['rrf_score', 0, 'missing-fusion-score'],
]) test(`rejects invalid retrieval ${field}=${value}`, () => {
    const result = structuredClone(search);
    result.results[0][field] = value;
    assert.throws(() => validateSearch(result, 'doc-1', subject), { message: `search:${code}` });
});
for (const [patch, code] of [
    [{ answer: '19 hours [Source 1]' }, 'incorrect-fact'],
    [{ answer: '47 hours' }, 'invalid-inline-citations'],
    [{ answer: '47 hours [Source 99]' }, 'invalid-inline-citations'],
    [{ is_grounded: false }, 'not-grounded-rag'], [{ citations: [] }, 'no-citations'],
    [{ message_id: null }, 'turn-not-saved'],
    [{ citations: [{ ...answer.citations[0], chunk_id: 'invented' }] }, 'unknown-chunk'],
    [{ citations: [{ ...answer.citations[0], document_id: 'other' }] }, 'wrong-document'],
]) test(`rejects invalid generation: ${code}`, () => {
    assert.throws(() => validateAnswer({ ...answer, ...patch }, 'doc-1', subject, search), { message: `generation:${code}` });
});

test('PDF contains unique facts and a complete xref/trailer', () => {
    const first = makePdf(), second = makePdf();
    assert.notEqual(first.subject, second.subject);
    assert.match(first.pdf.toString(), /^%PDF-1.4/);
    assert.match(first.pdf.toString(), /startxref\n\d+\n%%EOF/);
    assert.match(first.query, new RegExp(first.subject));
});

async function fixtureServer(handler, run) {
    const server = http.createServer(handler);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try { await run(`http://127.0.0.1:${server.address().port}`); }
    finally { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
}

test('real HTTP protocol fixture polls processing then ready with bearer auth', async () => {
    let calls = 0;
    await fixtureServer((request, response) => {
        assert.equal(request.url, '/api/documents/doc-1/status');
        assert.equal(request.headers.authorization, 'Bearer protocol-fixture-token');
        calls++;
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify({ status: calls === 1 ? 'processing' : 'ready' }));
    }, async (origin) => {
        await waitForIngestion(createApi(origin, 'Bearer protocol-fixture-token'), 'doc-1', { intervalMs: 1, timeoutMs: 1000 });
    });
    assert.equal(calls, 2);
});

test('HTTP errors and invalid JSON never expose credential-bearing response bodies', async () => {
    for (const status of [200, 503]) {
        await fixtureServer((_request, response) => {
            response.statusCode = status;
            response.end('postgres://private-password Bearer private-token');
        }, async (origin) => {
            await assert.rejects(createApi(origin, 'Bearer private-token')('/api/search', { query: 'fixture' }),
                { message: status === 503 ? 'api:http-503' : 'api:request-or-json-failed' });
        });
    }
});

test('failed and timed-out ingestion cannot advance to search', async () => {
    await assert.rejects(waitForIngestion(async () => ({ status: 'failed' }), 'doc-1'), { message: 'ingestion:failed-or-unknown-status' });
    await assert.rejects(waitForIngestion(async () => ({ status: 'processing' }), 'doc-1', { timeoutMs: 0 }), { message: 'ingestion:timeout' });
});
