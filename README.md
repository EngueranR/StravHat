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
- Credentials Strava stockes en DB par utilisateur (chiffres), plus de `STRAVA_CLIENT_ID/SECRET/REDIRECT_URI` dans `.env`.
- Flux: login applicatif (`/auth/register`, `/auth/login`) -> config credentials Strava dans l'app -> `GET /auth/strava/start` -> callback web -> `POST /auth/strava/exchange`.
- Les nouveaux comptes sont en attente de validation (`isApproved=false`) jusqu'a whitelist manuelle en DB.
- Les credentials Strava custom utilisateur et les tokens OAuth Strava sont stockes chiffres en base (page `Strava Credentials`).
- Les actions sensibles (auth/credentials/OAuth) sont auditees dans la table `SecurityEvent`.

## Securite
- Hash mot de passe: `scrypt` + `AUTH_PASSWORD_PEPPER`.
- Chiffrement donnees sensibles: AES-256-GCM (credentials Strava + tokens OAuth Strava).
- Anti brute-force: rate-limit Redis persistant (fallback memoire si Redis indisponible) + lockout sur login/endpoints sensibles.
- Audit securite: events critiques en DB (`SecurityEvent`) avec IP hachee (HMAC).
- Headers HTTP durcis + reponses API non-cacheables (`Cache-Control: no-store`).
- Le rate-limit s'applique uniquement aux endpoints sensibles auth/credentials/OAuth et ne bloque pas les routes d'import Strava ni d'analyse IA.

### Whitelist manuelle (DB)
- Exemple approbation:
  - `UPDATE "User" SET "isApproved" = true WHERE "email" = 'user@example.com';`
- Exemple revoke:
  - `UPDATE "User" SET "isApproved" = false WHERE "email" = 'user@example.com';`

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
  - `REDIS_URL` (recommande en prod pour rate-limit persistant multi-instance)
  - `JWT_SECRET`
  - `JWT_TTL` (ex: `12h`)
  - `AUDIT_LOG_KEY` (cle HMAC pour hash des IP dans les logs d audit)
  - `AUTH_PASSWORD_PEPPER` (long secret random)
  - `STRAVA_CREDENTIALS_ENCRYPTION_KEY` (base64 32 bytes)
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
