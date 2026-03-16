# Contributing

Thanks for contributing to the Radiology Department Simulator.

## Local setup

1. Use the pinned Node version:

```bash
nvm use
```

2. Install dependencies:

```bash
npm install
```

3. Create your environment file:

```bash
cp .env.example .env
```

4. Set `DATABASE_URL` to a Prisma Postgres database.

5. Apply the schema:

```bash
npm run db:migrate
```

6. Start the app:

```bash
npm run dev
```

## Verification

Before opening a PR, run:

```bash
npm run lint
npm test
npm run test:coverage
npm run build
```

## Project structure

- `app/`: Next.js routes and page-level UI
- `components/`: reusable UI components
- `lib/`: simulation engine, persistence, actions, utilities, and validation
- `prisma/`: Prisma schema, migrations, and database bootstrap assets
- `tests/`: Vitest coverage for simulator, storage, and server actions

## Testing approach

- `tests/simulator.test.ts` covers the simulation engine behavior.
- `tests/scenario-store.test.ts` covers Prisma-backed scenario storage mapping with mocked database calls.
- `tests/actions.test.ts` covers server actions and persistence payload shaping with mocked dependencies.

This split keeps contributor tests fast and deterministic while still checking the most important repository behavior.

## Pull request guidance

- Keep changes focused and small where possible.
- Prefer adding or updating tests when behavior changes.
- Preserve the existing scenario model unless the change intentionally updates the simulation rules.
- If you change the rules of the simulator, update both:
  - `README.md`
  - `/app/how-it-works/page.tsx`

## Notes

- The app uses Prisma Postgres for persistence.
- The simulation is stochastic but seed-driven, so identical inputs with the same seed should remain reproducible.
