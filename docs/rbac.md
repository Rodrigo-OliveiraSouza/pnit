# RBAC and Data Visibility

## Roles
- Visitor: no login, public map only
- User: authenticated but no staff permissions
- Employee: staff role for CRUD of residents and points
- Admin: all employee actions plus staff management and audit

## Capabilities
- Visitor
  - View public map points
  - Filter and search
- User
  - Same as visitor
- Employee
  - Create/update residents
  - Create/update points
  - Assign residents to points
  - View private fields for assigned residents
- Admin
  - All employee actions
  - Manage employees and roles
  - View audit log and system metrics

## Public fields (map)
- point_id
- public_lat / public_lng (approx)
- status
- precision
- updated_at
- region

## Private fields (resident + point)
- full_name, doc_id, phone, email
- full address and exact lat/lng
- notes, attachments, audit metadata

## Data leakage prevention
- Use dedicated DTOs per endpoint
- Never `SELECT *` on public routes
- Validate role/group in Lambda before reading private data
- Optionally create SQL views that only expose public fields
- Enforce row access in code or Postgres RLS if needed
