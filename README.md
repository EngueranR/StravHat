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
