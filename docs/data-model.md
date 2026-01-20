# Data Model

## Logical diagram (text)
app_users (1) ---- (0..1) employees
app_users (1) ---- (0..N) residents (created_by)
app_users (1) ---- (0..N) map_points (created_by)
residents (1) ---- (0..N) resident_point_assignments ---- (1) map_points
app_users (1) ---- (0..N) audit_log
map_points (1) ---- (0..N) public_map_cache (daily snapshot)

## Tables
- app_users: reference to Cognito users and roles
- employees: employee metadata (only for staff)
- residents: resident data (private fields, including notes)
- map_points: geospatial points (exact + public coords)
- map_points includes `category` and `public_note` for map context
- public_map_cache: daily snapshot for public map and reports
- public_map_cache includes `public_note` for map info windows
- geocode_cache stores address searches to reduce external API usage
- resident_point_assignments: history of assignments
- audit_log: write-once audit trail
- attachments: optional S3-backed files

## Indices
- GIST on map_points.geog for bbox queries
- B-tree on status, updated_at, deleted_at
- Unique partial index for active assignment

## Soft delete
- Use deleted_at timestamp on residents and map_points
- Do not delete assignments; set unassigned_at
- Public map ignores deleted items

## Public cache
- public_map_cache holds public-only fields for map display
- refreshed once per day by a scheduled job

## History
- assignment history kept in resident_point_assignments
- audit_log captures CRUD actions and sensitive access
