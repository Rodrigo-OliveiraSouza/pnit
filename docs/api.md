# API

Base URL: /api

## Public endpoints

### GET /map/points
Query:
- bbox=minLng,minLat,maxLng,maxLat (required)
- limit (default 200, max 500)
- cursor (optional)
- status, precision, updated_since (optional)

Response:
```json
{
  "items": [
    {
      "id": "pt_123",
      "public_lat": -23.5501,
      "public_lng": -46.6331,
      "precision": "approx",
      "status": "active",
      "updated_at": "2026-01-19T12:00:00Z",
      "public_note": "Descricao publica do ponto"
    }
  ],
  "next_cursor": "abc",
  "last_sync_at": "2026-01-19T01:00:00Z"
}
```
Note: data is served from the daily public cache table.

### GET /geocode
Uses cached geocoding data from the database to reduce external API usage.

Query:
- address (required)

Response:
```json
{
  "lat": -23.5505,
  "lng": -46.6337,
  "formatted_address": "Sao Paulo, SP, Brasil"
}
```

### GET /map/points/{id}
Response:
```json
{
  "id": "pt_123",
  "public_lat": -23.5501,
  "public_lng": -46.6331,
  "precision": "approx",
  "status": "active",
  "public_note": "Descricao publica do ponto",
  "region": "SP-01",
  "updated_at": "2026-01-19T12:00:00Z"
}
```

### POST /reports/preview
Generates aggregated preview data for a selected area.

Request:
```json
{
  "bounds": { "north": 0, "south": 0, "east": 0, "west": 0 },
  "include": { "indicators": true, "points": true, "narratives": false }
}
```

Response:
```json
{
  "report_id": "rep_123",
  "summary": { "points": 120, "residents": 85, "last_updated": "2026-01-19T01:00:00Z" }
}
```

### POST /reports/export
Exports a report file from the public cache.

Request:
```json
{
  "bounds": { "north": 0, "south": 0, "east": 0, "west": 0 },
  "format": "CSV",
  "include": { "indicators": true, "points": true, "narratives": false }
}
```

Response (option A):
```json
{ "download_url": "https://example.com/report.csv" }
```

Response (option B):
```json
{
  "content_base64": "ZXhhbXBsZQ==",
  "content_type": "text/csv",
  "filename": "relatorio.csv"
}
```

## Private endpoints (employee/admin)

### POST /residents
```json
{
  "full_name": "Maria Silva",
  "doc_id": "12345678900",
  "phone": "+5511999990000",
  "email": "maria@example.com",
  "address": "Rua X, 100, Sao Paulo",
  "status": "active",
  "notes": "Observacoes do agente"
}
```

### PUT /residents/{id}
Partial update; validate allowed fields only.

### POST /points
```json
{
  "lat": -23.5505,
  "lng": -46.6337,
  "accuracy_m": 15,
  "status": "active",
  "precision": "approx",
  "category": "Residencia",
  "public_note": "Descricao publica do ponto"
}
```

### PUT /points/{id}
Allow moving point with audit logging.

### POST /assignments
```json
{
  "resident_id": "res_456",
  "point_id": "pt_123"
}
```

### GET /audit (admin)
Query:
- actor_user_id, entity_type, from, to, limit

### POST /admin/sync/public-map (admin)
Triggers a manual refresh of the public cache outside the daily schedule.

## Errors
Standard error format:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "lat must be between -90 and 90",
    "details": [{ "field": "lat", "issue": "out_of_range" }]
  }
}
```

## Validation highlights
- bbox is required on public map list
- lat/lng range validation
- status and precision enums
- max page size and cursor validation
