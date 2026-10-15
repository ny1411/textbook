"""Initialize an empty application schema; never reset or upgrade existing tables."""
import argparse
import os
from pathlib import Path
import ssl
import sys
from urllib.parse import parse_qs, urlsplit

import certifi
from dotenv import load_dotenv
import psycopg

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND))
from db.postgres import connection_url


def initialize():
    load_dotenv(BACKEND / '.env')
    value = os.environ.get('DATABASE_URL', '')
    url = connection_url(value)
    schema = parse_qs(urlsplit(value).query).get('schema', ['public'])[0]
    if schema in {'auth', 'storage', 'realtime', 'vault', 'information_schema'} or schema.startswith('pg_'):
        raise ValueError('Choose an application schema, not a provider/system schema')
    ca_file = os.environ.get('PGSSLROOTCERT') or ssl.get_default_verify_paths().cafile or certifi.where()
    if not Path(ca_file).is_file():
        raise ValueError('PGSSLROOTCERT must point to an existing trusted CA PEM file')

    # Both DDL and protections commit together. Any failure rolls back everything.
    with psycopg.connect(url, sslrootcert=ca_file, connect_timeout=10, prepare_threshold=None) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT pg_advisory_xact_lock(hashtextextended(%s, 0))", ('textbook:init:' + schema,))
            cursor.execute('SELECT 1 FROM pg_namespace WHERE nspname = %s', (schema,))
            if cursor.fetchone() is None:
                raise ValueError('The configured application schema does not exist')
            cursor.execute("SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
                "WHERE n.nspname = %s AND c.relkind IN ('r', 'p', 'v', 'm', 'f') LIMIT 1", (schema,))
            if cursor.fetchone() is not None:
                raise ValueError('Application schema is not empty; use a reviewed upgrade instead')
            cursor.execute("SELECT set_config('search_path', quote_ident(%s) || ', pg_catalog', true)", (schema,))
            cursor.execute("SET LOCAL lock_timeout = '10s'")
            cursor.execute("SET LOCAL statement_timeout = '60s'")
            for filename in ('baseline.sql', 'baseline-security.sql'):
                cursor.execute((BACKEND / 'prisma' / filename).read_text(encoding='utf-8'), prepare=False)
            cursor.execute("SELECT count(*) FROM pg_tables WHERE schemaname = %s", (schema,))
            count = cursor.fetchone()[0]
    print(f'Initialized {count} application tables with RLS and backend-only access.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Apply the committed baseline to the configured empty schema')
    args = parser.parse_args()
    if not args.apply:
        parser.error('Review prisma/baseline.sql and prisma/baseline-security.sql, then pass --apply')
    try:
        initialize()
    except ValueError as error:
        print(str(error), file=sys.stderr)
        return 1
    except psycopg.Error as error:
        # Connection errors can contain passwords/URLs; emit only a SQLSTATE.
        print(f'Database initialization failed ({error.sqlstate or "connection error"}); no partial baseline was committed.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
