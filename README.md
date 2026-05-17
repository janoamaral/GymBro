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
pnpm prisma:studio
pnpm prisma:migrate:dev --name init
```
