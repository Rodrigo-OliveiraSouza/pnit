# Implementation Plan

## Phase 0 - Foundation
- IaC baseline (networking, S3, CloudFront, Route 53, ACM)
- Cognito User Pool, groups, and app client
- API Gateway + Lambda scaffolding
- RDS PostgreSQL + PostGIS (optional)
- Observability baseline (CloudWatch, X-Ray)

## Phase 1 - MVP
- Public map API (bbox query, pagination)
- Employee auth and CRUD for residents and points
- Assignment workflow and audit log
- Basic admin view (audit list)
- Daily public cache refresh job (EventBridge + Lambda)
- Report preview and export endpoints (CSV/JSON/PDF)
- Geocode cache endpoint to reduce external API usage

## Phase 2 - V1
- Staff management and role tooling
- Attachments flow (S3 presigned uploads)
- Advanced filters and performance tuning
- Caching strategy improvements

## Estimates (person-days)
- Infra/IaC: 6-8
- Auth/RBAC: 3-4
- Public map API: 4-6
- CRUD + dashboard: 8-12
- Admin + audit: 4-6

## Risks and mitigations
- Privacy leakage: enforce DTOs and public coords jitter
- Maps cost: cache and limit bbox frequency
- RDS micro capacity: use RDS Proxy and optimize queries
- Abuse risk: WAF + throttling + request limits
