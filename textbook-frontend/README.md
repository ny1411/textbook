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
npm install
```

### 3. Run development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the application.

---

## Backend connection

The frontend connects to the FastAPI backend at `http://localhost:8000/api`. Ensure the backend server is running when making API calls.
