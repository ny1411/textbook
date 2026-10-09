# Textbook frontend: AI document research assistant

The web frontend for Textbook, built with Next.js 16 (App Router), React 19, Tailwind CSS v4, and TypeScript.

---

## Tech stack

- **Framework:** [Next.js 16](https://nextjs.org/) (App Router)
- **Library:** [React 19](https://react.dev/)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Language:** TypeScript 5

---

## Directory structure

```text
textbook-frontend/
├── app/
│   ├── layout.tsx         # Root layout configuration and font loader
│   ├── page.tsx           # Home and research dashboard page
│   └── globals.css        # Tailwind CSS v4 styles
├── public/                # Static assets and icons
├── next.config.ts         # Next.js configuration
├── package.json           # Node dependencies and scripts
├── tsconfig.json          # TypeScript compiler options
└── eslint.config.mjs      # ESLint configuration
```

---

## Getting started

### 1. Prerequisites
- Node.js 20.x or higher
- npm / pnpm / yarn

### 2. Install dependencies
```bash
npm ci
cp .env.example .env.local
```

Set the two public Supabase values in `.env.local` from the intended project's
API settings. The anon/publishable key is browser configuration; the backend's
secret/service-role key must never be used here.

### 3. Run development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## Backend connection

The browser calls same-origin `/api` routes. `next.config.ts` rewrites them to
`${BACKEND_URL}/api`; the local default is `http://127.0.0.1:8000`. Set
`BACKEND_URL` to the backend origin without `/api`, a query, or credentials.
Changing it requires rebuilding the frontend.

For Vercel project settings, environment variables, OAuth callbacks, and release
verification, see [deployment.md](deployment.md). A live, verified deployment is
still required to complete issue #9.
