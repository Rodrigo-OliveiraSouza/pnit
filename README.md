# GTERF Platform

This repository is the initial technical specification and skeleton for a serverless web platform
with a public map of resident points and authenticated CRUD for staff.

## Architecture summary
- Frontend: S3 + CloudFront + Route 53 + ACM (OAC for S3 access)
- Backend: API Gateway + Lambda + SSM Parameter Store + Cognito (JWT)
- Database: RDS PostgreSQL (PostGIS recommended) + optional RDS Proxy
- Observability: CloudWatch Logs/Metrics + X-Ray
- Security: IAM least privilege, WAF, throttling, CSP headers

## Repository structure
- `docs/architecture.md` - architecture and security
- `docs/rbac.md` - roles and data visibility
- `docs/data-model.md` - logical model and constraints
- `docs/api.md` - API routes, schemas, errors
- `docs/ux.md` - MVP pages and map behavior
- `docs/implementation-plan.md` - phased backlog and risks
- `db/schema.sql` - initial SQL schema for PostgreSQL
- `web/` - frontend (React + Vite)

## Frontend quickstart
From `web/`:
1. Install dependencies: `npm install`
2. Run dev server: `npm run dev`
3. Optional map key: copy `web/.env.example` to `web/.env.local` and set `VITE_GOOGLE_MAPS_API_KEY` (and optional `VITE_GOOGLE_MAPS_MAP_ID`)
4. API base URL: set `VITE_API_BASE_URL` when the backend is running

## Backend (Cloudflare Worker)
- Required env vars:
  - `DATABASE_URL` (Postgres connection string)
  - `AUTH_JWT_SECRET` (random secret for JWT)
  - `GOOGLE_MAPS_API_KEY` (used for geocoding cache)
- Optional:
  - `GOOGLE_GEOCODING_API_KEY` (separate key for geocode)
  - `PUBLIC_BASE_URL` (base URL for attachments)
- R2 bucket:
  - Create an R2 bucket (ex: `pnit-assets`) and bind to `R2_BUCKET`

### Database migrations
If the database is already created, apply:
- `db/migrations/2026-01-20_profile.sql`

## Next steps
- Create IaC (CDK or Terraform) to provision the baseline stack
- Implement API Lambdas and DTOs
- Build the frontend map experience and auth flows
