# Architecture

## Core components (AWS)
- S3: static assets (SPA)
- CloudFront: CDN with OAC to S3
- Route 53 + ACM: DNS + TLS
- Cognito User Pool: auth and JWT groups
- API Gateway: REST API with JWT authorizer
- Lambda: handlers for public and private endpoints
- SSM Parameter Store: config and secrets (non-DB)
- RDS PostgreSQL: system of record
- CloudWatch + X-Ray: logs and tracing
- WAF: protection at edge

## Public map flow
1. Browser loads SPA from CloudFront (cached)
2. SPA requests public map points with `bbox` filter
3. API Gateway routes to Lambda (no auth)
4. Lambda queries Postgres public cache (daily snapshot or materialized view)
5. Response is cached by CloudFront or API Gateway (short TTL)

## API preservation and daily sync
- Public map points are served from a Postgres cache table or materialized view
- External API usage (ex: geocoding) is cached in the database
- Frontend uses `/geocode` to avoid direct geocoding API calls
- A scheduled job (EventBridge + Lambda) refreshes public cache once per day
- New records are saved immediately, but public data is exposed on daily sync
- Refresh SQL reference: `db/refresh_public_cache.sql`

## Private flow (employee/admin)
1. User authenticates via Cognito (Hosted UI or SDK)
2. SPA stores JWT and calls protected endpoints
3. API Gateway authorizer validates JWT + groups
4. Lambda enforces RBAC and logs audit entries
5. Data is stored in Postgres with soft delete

## Data protection
- Never return private fields on public endpoints
- Use explicit DTO mapping and whitelist fields
- Optional: create DB views for public datasets
- Use jittered public coordinates for privacy

## Caching strategy
- CloudFront caches public map responses (short TTL)
- API Gateway cache optional for public routes
- Use `etag` or `last_modified` for point updates

## Key security controls
- WAF rules: rate limit, SQLi/XSS, bot control
- Throttling: usage plan on API Gateway
- CSP and security headers on CloudFront
- IAM least privilege for Lambda, RDS, SSM
- JWT validation on all private routes

## Headers (CloudFront)
- Content-Security-Policy
- Strict-Transport-Security
- X-Content-Type-Options
- X-Frame-Options
- Referrer-Policy

## Cost controls
- Require `bbox` for public map requests
- Limit response size and pagination
- Cache public map data aggressively
- Use concurrency limits for Lambdas
