# GymBro

GymBro is a mobile-first web app for gym training tracking.

Current implementation includes:
- Next.js 16 + TypeScript app foundation
- Neon Postgres environment wiring with Prisma 7
- Auth0 SDK base setup (proxy boundary + login/logout routes)
- First training slice: plate loading calculator with barbell weight
- Unit tests for plate calculator logic

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Fill environment variables in `.env` (see `.env.example`).

3. Validate Prisma and generate client:

```bash
pnpm prisma validate
pnpm prisma generate
```

4. Start the app:

```bash
pnpm dev
```

## Useful commands

```bash
pnpm lint
pnpm test:unit
pnpm test:e2e
pnpm prisma:studio
pnpm prisma:migrate:dev --name init
```

## E2E offline sync tests

- Run with:

```bash
pnpm test:e2e
```

- E2E uses a local auth bypass (`E2E_AUTH_BYPASS=true`) only for Playwright webServer.

## Vercel database env vars

To avoid Prisma authentication errors (`P1000`) in production, ensure one valid Postgres URL is set.

- Preferred: `DATABASE_URL`
- Supported fallbacks (auto-detected by the app): `POSTGRES_URL`, `DATABASE_URL_UNPOOLED`, `POSTGRES_URL_NON_POOLING`

Notes:
- The URL must start with `postgresql://` or `postgres://`.
- Do not use `prisma://` with `@prisma/adapter-pg`.
- Do not deploy placeholder values like `username:password@host/database`.
- The production build runs `prisma migrate deploy` before `next build`, so set `DATABASE_URL_UNPOOLED` or `POSTGRES_URL_NON_POOLING` when your provider requires a direct connection for migrations.
