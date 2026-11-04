# GenieRoute AI

**English** · [Türkçe](README.md)

An LLM-powered travel planner.
The user enters a city, number of days, budget, and interests; the app fetches real place data from the Google Places API and uses OpenAI to show a daily route on the map.
It works worldwide (budgets and tips for all cities, including those in Turkey, are generated through an LLM ensemble + DB cache).

## Features

- LLM-powered daily plan generation (default: OpenAI gpt-5.4-mini)
- Real places/coordinates from Google Places + Geocoding
- Geographic clustering + nearest-neighbor TSP for route optimization within each day
- Multiple currencies (local + USD + EUR) + 1-hour exchange rate cache
- Weather forecast (Open-Meteo, no key required)
- Plan editing through streaming chat (Socket.io)
- TR/EN language support, light/dark theme
- `/admin` cache monitoring panel
- `/usage` API usage panel (OpenAI costs/tokens + Google Cloud Monitoring)

## Quick Start

### Requirements

- **Node.js 22**
- **Docker Desktop** (for the PostgreSQL container)
- **Google Cloud** account (Places API + Geocoding API enabled, billing enabled)
- **Mapbox** public access token (for map visualization)
- **OpenAI API** account (with credit added)

### Setup

```bash
git clone <repo-url>
cd GenieRoute-AI
```

Then copy `backend/.env.example` and `frontend/.env.example` to `backend/.env` and `frontend/.env`, respectively, and fill them in by following the steps under [Environment Variables](#environment-variables).

```bash
# Install dependencies and start the database container
helper.bat
# → [i] Ilk Kurulum   (npm install + docker pull)

# Start all services
helper.bat
# → [1] Tumunu Baslat
```

- Backend: <http://localhost:3001>
- Frontend: <http://localhost:5173>
- Usage panel: <http://localhost:5173/usage>
- Admin panel: <http://localhost:5173/admin>

Migrations are applied automatically when the backend starts (`database/migrations/`).

### Migrating to PostgreSQL 18

PostgreSQL 16 data remains in the old `pgdata` volume; PostgreSQL 18 uses the new `pgdata18` volume.
To move the data, mount the old `pgdata` volume at `/var/lib/postgresql/data` in a temporary `postgres:16` container and create an SQL dump with `pg_dumpall`, then restore the dump with `psql` in the new PostgreSQL 18 container.
If you want a fresh start, use the new volume as it is; migrations are applied automatically when the backend starts.

## Environment Variables

### `backend/.env`

#### `PORT`
Backend port.
Default: `3001`.

#### `DATABASE_URL`
PostgreSQL connection string.
Use the default provided by Docker compose:
```
DATABASE_URL=postgresql://genieroute:genieroute123@localhost:5435/genieroute
```

#### `GOOGLE_PLACES_API_KEY` (required)
The API key the backend uses for Places + Geocoding + Photo proxy calls.

**How to get it:**
1. <https://console.cloud.google.com/> → sign up for free or sign in
2. Create a project from the top menu (e.g., `GenieRoute`) — its project ID will later be used for `GCP_PROJECT_ID`
3. Left menu → **APIs & Services → Library**
4. Enable these APIs (click "Enable" for each):
   - **Places API**
   - **Geocoding API**
5. **APIs & Services → Credentials → Create Credentials → API Key**
6. Copy the key → paste it into `backend/.env`

> **Billing:** Google Maps Platform provides $200 in free monthly credit.
> This is roughly equivalent to 6,250 Text Search / 40,000 Geocoding / 28,500 Photo requests.
> Usage beyond that is billed to your card, so enabling billing and setting a budget alert is recommended.

#### `OPENAI_API_KEY` (required)
The **project** API key used for plan generation and chat.

**How to get it:**
1. <https://platform.openai.com/api-keys>
2. **Create new secret key** → Project: default → Role: All
3. Copy it (it is shown only once) → paste it into `backend/.env`
4. Add credit to your account at <https://platform.openai.com/settings/organization/billing> (new accounts may receive $5–$18 in promotional credit)

#### `OPENAI_ADMIN_API_KEY` (optional — for `/usage`)
Access to OpenAI's organization-level usage and cost APIs.
This key is separate from the project key and must be obtained separately.
The app works without it; only the OpenAI section of the `/usage` page shows a "not configured" message.

**How to get it:**
1. <https://platform.openai.com/settings/organization/admin-keys>
2. **Create new admin key** → copy it → paste it into `backend/.env`
3. **Note:** You must be an organization owner to obtain this key (if it is your personal account, you are already its owner).

#### `GCP_PROJECT_ID` (optional — for `/usage`)
The ID of your Google Cloud project (not its name).
Used to read `places-backend.googleapis.com` call counts from Cloud Monitoring.

**How to find it:**
1. <https://console.cloud.google.com/>
2. Click the project selector at the top (next to the Google Cloud logo)
3. **ALL** tab → **ID** column in your project's row (e.g., `genieroute-457821` — include the numeric suffix, not just "genieroute")
4. Paste this value into `backend/.env`

#### `GOOGLE_APPLICATION_CREDENTIALS` (optional — for `/usage`)
The **absolute path** to the service account JSON file used to authenticate with the Cloud Monitoring API.
The Places API key is not sufficient for this API; a service account is required.

**How to get it:**
1. <https://console.cloud.google.com/iam-admin/serviceaccounts>
2. Select the GenieRoute project you created above
3. **Create Service Account**
   - Name: `genieroute-monitoring`
   - Continue
4. **Grant access** → Role: **Monitoring Viewer** (`roles/monitoring.viewer`) → Done
5. Click the new row → **Keys** tab → **Add Key → Create new key → JSON** → save the downloaded file as `backend/gcp-monitoring-sa.json`
6. Write the full path in `backend/.env`:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=D:\workspace-ali\GenieRoute-AI\backend\gcp-monitoring-sa.json
   ```

> ⚠️ **NEVER commit this JSON file to git.**
> If it enters the repository, Google automatically revokes it and considers the key leaked.
> `.gitignore` already excludes the `**/gcp-*-sa.json` pattern; name the file to match this pattern.

### `frontend/.env`

#### `VITE_API_URL`
Backend URL.
Keep the default:
```
VITE_API_URL=http://localhost:3001/api
```

#### `VITE_MAPBOX_TOKEN` (required)
The map is rendered with Mapbox in `frontend/src/components/MapView.jsx`; get your public access token from <https://account.mapbox.com/access-tokens/> and add it to `frontend/.env`.
Do not add the Google Places key to the frontend; place and photo calls go through the backend.

## /usage Panel

View OpenAI and Google Cloud usage on one page.
URL: <http://localhost:5173/usage>

Two panels:
- **OpenAI (Admin API):** token count, breakdown by model, estimated USD (tokens × model price), official USD (Costs API)
- **Google Cloud (Monitoring API):** request count by service (places-backend, geocoding-backend, maps-backend), estimated USD

Date range: 24 hours / 7 days / 30 days / All Time.

If the relevant environment variables (`OPENAI_ADMIN_API_KEY`, `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS`) are not configured, the corresponding panel shows a "not configured" message; the rest of the app continues to work normally.

## Folder Structure

For a code map, see [CLAUDE.md](CLAUDE.md); for behavior details, see the [architecture notes](docs/MIMARI_NOTLARI.md).

```
backend/    Express + Socket.io API, PostgreSQL, services/models/routes
frontend/   React 19 + Vite, i18n, ThemeContext
database/   migrations/ (kalkışta otomatik uygulanır)
helper.bat  Windows başlatıcı (Türkçe menü)
```

## License and Attributions

- Code: all rights reserved, see [LICENSE](LICENSE).
- City data: [GeoNames](https://www.geonames.org/) (CC BY 4.0)
- Weather data: [Open-Meteo](https://open-meteo.com/) (no key required)
- Exchange rates: [open.er-api.com](https://www.exchangerate-api.com/) (free tier, no key required)
- `frontend/public/images/routes/antalya.jpg`: [Marmaris harbor (aerial view)](https://commons.wikimedia.org/wiki/File:Marmaris_harbor_(aerial_view),_Mu%C4%9Fla_Province,_southwest_Turkey,_Mediterranean.jpg), Mstyslav Chernov, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)

## Troubleshooting

| Symptom | Possible cause |
|---|---|
| `EADDRINUSE :::3001` | Another backend instance is running. Find it with `Get-NetTCPConnection -LocalPort 3001` and stop it with `Stop-Process`. |
| `/usage` OpenAI panel "OPENAI_ADMIN_API_KEY not configured" | The admin key has not been added, or the backend has not been restarted. |
| `/usage` Cloud Monitoring "GCP_PROJECT_ID not configured" | `GCP_PROJECT_ID` or the service account JSON is missing. |
| "Places API error: REQUEST_DENIED" during plan generation | Billing is disabled or the API is not enabled. Check Cloud Console. |
| "401 Unauthorized" (OpenAI) during plan generation | The API key is invalid or the credit has run out. |
| Migration error at startup | The Postgres container may not have started: `docker-compose up -d postgres`. |
