# StravHat

Monorepo React + Fastify + Prisma pour importer et analyser toutes les activites Strava.

## Structure
- `server`: API Fastify TypeScript + Prisma/Postgres
- `web`: React + Vite + Tailwind + ECharts

## Demarrage
1. Copier `server/.env.example` vers `server/.env` et remplir les variables.
2. Installer les dependances:
   - `npm install`
3. Generer Prisma:
   - `npm run prisma:generate --workspace server`
4. Appliquer la migration:
   - `npm run prisma:migrate --workspace server`
5. Lancer:
   - `npm run dev`

## OAuth Strava
- Secret Strava uniquement cote serveur.
- Flux: `GET /auth/strava/start` -> callback web -> `POST /auth/strava/exchange`.

## Deploy Railway (Monorepo)
Le projet se deploie avec 3 services Railway:
1. PostgreSQL
2. API (backend `server`)
3. WEB (frontend `web`)

### API service
- Build Command: `bun run --filter=@stravhat/server build`
- Start Command: `bun run --filter=@stravhat/server start`
- Variables:
  - `DATABASE_URL` -> URL Postgres Railway
  - `WEB_URL` -> URL publique du frontend (ex: `https://web-xxx.up.railway.app`)
    - option temporaire test: `WEB_URL=*` (CORS ouvert, a eviter en prod)
  - `JWT_SECRET`
  - `STRAVA_CLIENT_ID`
  - `STRAVA_CLIENT_SECRET`
  - `STRAVA_REDIRECT_URI` -> `https://<frontend>/auth/callback`
  - `HF_API_KEY` (optionnel)
  - `HF_MODEL` (optionnel)
  - `HF_MAX_TOKENS` (optionnel)
  - `HF_ROUTER_URL` (optionnel)

Important:
- Ne pas definir `PORT` manuellement sur Railway.
- Ne pas utiliser `localhost` en production Railway.

### WEB service
- Build Command: `bun run --filter=@stravhat/web build`
- Start Command: `bun run --filter=@stravhat/web start`
- Variable:
  - `VITE_API_URL=https://<api-railway>/api`

### Migrations Prisma
Apres le premier deploy backend:
- `bunx prisma migrate deploy --schema server/prisma/schema.prisma`
