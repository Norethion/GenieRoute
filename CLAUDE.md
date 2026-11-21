# GenieRoute

## Project

GenieRoute is a local web application that generates daily travel plans from real places based on city, duration, budget and interests.
Google Places supplies the places, OpenAI creates the route, and the user views the plan on a map and edits it through chat.

- Backend: Node.js 22, Express, Socket.io and PostgreSQL 18.
- Frontend: React 19, Vite, react-i18next and Mapbox GL JS.

Keep `CLAUDE.md` and `AGENTS.md` byte-for-byte identical and in English; documentation is written in Turkish.
`README.md` is in Turkish; `README.en.md` is its English translation, and both must be kept up to date together.

- Setup and environment variables: [README.md](README.md), `backend/.env.example` and `frontend/.env.example`.
- Architectural decisions and domain rules: [architecture notes](docs/MIMARI_NOTLARI.md); use `backend/src/routes/` as the source for the current API and `database/migrations/` for the schema.

## Map

- Backend: HTTP entry points are in `backend/src/routes/`, business logic in `backend/src/services/`, and SQL access in `backend/src/models/`.
- Frontend: pages are in `frontend/src/pages/`, components in `frontend/src/components/`, and API and socket clients in `frontend/src/services/`.
- Database: `database/migrations/*.sql`; `backend/src/config/migrate.js` applies the files by name at backend startup.

## Commands and checks

Run commands in the specified directory; there is no npm workspace at the root.
`helper.bat` can be used for the Windows menu.

| Task | Command and directory |
| --- | --- |
| Install dependencies | `cd backend && npm ci`; also `cd frontend && npm ci` |
| Start the database | At the root, `docker-compose up -d postgres`; host port `5435`, container port `5432` |
| API development | `cd backend && npm run dev` (`localhost:3001`) |
| Web development | `cd frontend && npm run dev` (`localhost:5173`) |
| Frontend build | `cd frontend && npm run build` |
| Backend lint | `cd backend && npm run lint` |
| Frontend lint | `cd frontend && npm run lint` |
| Browser tests | `cd frontend && npm run test:e2e` |

There is no build or test script for the backend, and neither package has a typecheck script.
The required PR checks in [CI](.github/workflows/ci.yml) are `Kod kalitesi` (backend and frontend lint and formatting checks) and `Önyüz derlemesi` (frontend build); E2E tests do not run in CI, so run them locally when needed.
For E2E, PostgreSQL and the backend must be running; start the frontend in a separate terminal with `cd frontend && npm run dev -- --port 5174`, then follow the key and test requirements in the [E2E guide](frontend/tests/e2e/README.md).
Playwright does not start the servers itself, and the base URL in `frontend/playwright.config.js` is `localhost:5174`.

## Boundaries

- Do not invent places in plans that did not come from the API; preserve the geographic filter and daily route limits ([architecture notes](docs/MIMARI_NOTLARI.md)).
- Preserve the `[PLAN_UPDATE]` chat protocol and the change preview/approval flow ([architecture notes](docs/MIMARI_NOTLARI.md)).
- Keep Google Places and OpenAI secret keys in the backend; serve photos through the proxy and use the Mapbox public token only for the map ([architecture notes](docs/MIMARI_NOTLARI.md)).
- Update visible text in `frontend/src/i18n/locales/tr.json` and `en.json` together; preserve Turkish characters ([architecture notes](docs/MIMARI_NOTLARI.md)).
- Make schema changes with a new SQL migration; do not rewrite existing migrations ([architecture notes](docs/MIMARI_NOTLARI.md)).

## Git and deployment

Create a short-lived branch from `main` and submit the change through a PR targeting `main`.
Do not assign anyone to the PR; the project owner merges it with a normal merge commit.
Commit messages and PR text (titles, descriptions, comments) are written in Turkish.
This project is not deployed on the shared server; it has no deployment infrastructure connection.
