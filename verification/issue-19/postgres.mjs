import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
const db = await PGlite.create();
// Sequential tests can open their next socket before the previous FIN has
// reached Node. Allow that closing socket; do not run concurrent SQL suites.
const server = new PGLiteSocketServer({ db, port: 55419, host: '127.0.0.1', maxConnections: 2 });
await server.start();
console.log('Disposable PostgreSQL-compatible test server ready on 127.0.0.1:55419');
async function stop() { await server.stop(); await db.close(); process.exit(0); }
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
