import { Hono, type Context } from "hono";
import { neon } from "@neondatabase/serverless";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Env = {
  DATABASE_URL: string;
  GOOGLE_MAPS_API_KEY?: string;
  GOOGLE_GEOCODING_API_KEY?: string;
};

type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type ReportInclude = {
  indicators?: boolean;
  points?: boolean;
  narratives?: boolean;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin") ?? "*";
  c.header("Access-Control-Allow-Origin", origin === "null" ? "*" : origin);
  c.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Actor-User-Id"
  );
  c.header("Access-Control-Allow-Methods", "GET,POST,PUT,OPTIONS");
  c.header("Access-Control-Max-Age", "86400");
  if (c.req.method === "OPTIONS") {
    return c.body(null, 204);
  }
  await next();
});

function getSql(env: Env) {
  if (!env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }
  return neon(env.DATABASE_URL);
}

function jsonError(
  c: Context,
  status: number,
  message: string,
  code = "VALIDATION_ERROR"
) {
  return c.json(
    {
      error: {
        code,
        message,
      },
    },
    status
  );
}

function toNumber(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseBounds(bbox: string | null): Bounds | null {
  if (!bbox) return null;
  const parts = bbox.split(",").map((part) => Number(part));
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    return null;
  }
  const [west, south, east, north] = parts;
  return { north, south, east, west };
}

function normalizeQuery(query: string) {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function encodeCursor(offset: number) {
  return btoa(String(offset));
}

function decodeCursor(cursor?: string | null) {
  if (!cursor) return 0;
  try {
    const decoded = atob(cursor);
    const parsed = Number(decoded);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  } catch {
    return 0;
  }
}

async function getSystemUserId(sql: ReturnType<typeof neon>) {
  const existing = await sql(
    "SELECT id FROM app_users WHERE cognito_sub = $1 LIMIT 1",
    ["system"]
  );
  if (existing.length > 0) {
    return existing[0].id as string;
  }
  const inserted = await sql(
    "INSERT INTO app_users (cognito_sub, email, role, status) VALUES ($1, $2, $3, $4) RETURNING id",
    ["system", "system@local", "admin", "active"]
  );
  return inserted[0].id as string;
}

function jitterPoint(lat: number, lng: number, accuracy?: number | null) {
  if (!accuracy || accuracy <= 0) {
    return { lat, lng };
  }
  const radius = accuracy / 111320;
  const u = Math.random();
  const v = Math.random();
  const w = radius * Math.sqrt(u);
  const t = 2 * Math.PI * v;
  const deltaLat = w * Math.cos(t);
  const deltaLng = (w * Math.sin(t)) / Math.cos((lat * Math.PI) / 180);
  return { lat: lat + deltaLat, lng: lng + deltaLng };
}

async function refreshPublicCache(env: Env) {
  const sql = getSql(env);
  await sql("BEGIN");
  try {
    await sql("DELETE FROM public_map_cache WHERE snapshot_date = CURRENT_DATE");
    await sql(
      `
      WITH active_assignments AS (
        SELECT point_id, COUNT(*) AS residents
        FROM resident_point_assignments
        WHERE active = true
        GROUP BY point_id
      )
      INSERT INTO public_map_cache (
        point_id,
        public_lat,
        public_lng,
        status,
        precision,
        region,
        residents,
        public_note,
        snapshot_date,
        geog,
        updated_at
      )
      SELECT
        mp.id,
        mp.public_lat,
        mp.public_lng,
        mp.status,
        mp.precision,
        NULL,
        COALESCE(a.residents, 0),
        mp.public_note,
        CURRENT_DATE,
        ST_SetSRID(ST_MakePoint(mp.public_lng, mp.public_lat), 4326)::geography,
        now()
      FROM map_points mp
      LEFT JOIN active_assignments a ON a.point_id = mp.id
      WHERE mp.deleted_at IS NULL
      `
    );
    await sql("COMMIT");
  } catch (error) {
    await sql("ROLLBACK");
    throw error;
  }
}

app.get("/map/points", async (c) => {
  const sql = getSql(c.env);
  const bounds = parseBounds(c.req.query("bbox"));
  if (!bounds) {
    return jsonError(c, 400, "bbox is required");
  }
  const limitRaw = toNumber(c.req.query("limit")) ?? 200;
  const limit = Math.min(Math.max(1, Math.floor(limitRaw)), 500);
  const offset = decodeCursor(c.req.query("cursor"));
  const status = c.req.query("status");
  const precision = c.req.query("precision");
  const updatedSince = c.req.query("updated_since");

  const filters: string[] = [
    "snapshot_date = CURRENT_DATE",
    "ST_Intersects(geog::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))",
  ];
  const params: (string | number)[] = [
    bounds.west,
    bounds.south,
    bounds.east,
    bounds.north,
  ];
  let index = params.length;
  if (status) {
    index += 1;
    filters.push(`status = $${index}`);
    params.push(status);
  }
  if (precision) {
    index += 1;
    filters.push(`precision = $${index}`);
    params.push(precision);
  }
  if (updatedSince) {
    index += 1;
    filters.push(`updated_at >= $${index}`);
    params.push(updatedSince);
  }
  index += 1;
  const offsetParam = index;
  params.push(offset);
  index += 1;
  const limitParam = index;
  params.push(limit + 1);

  const query = `
    SELECT point_id as id,
           public_lat,
           public_lng,
           precision,
           status,
           updated_at,
           public_note,
           region,
           residents
    FROM public_map_cache
    WHERE ${filters.join(" AND ")}
    ORDER BY updated_at DESC, id
    OFFSET $${offsetParam}
    LIMIT $${limitParam}
  `;
  const rows = await sql(query, params);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const lastSync = await sql(
    "SELECT MAX(updated_at) AS last_sync_at FROM public_map_cache WHERE snapshot_date = CURRENT_DATE"
  );

  return c.json({
    items,
    next_cursor: hasMore ? encodeCursor(offset + limit) : null,
    last_sync_at: lastSync[0]?.last_sync_at ?? null,
  });
});

app.get("/map/points/:id", async (c) => {
  const sql = getSql(c.env);
  const id = c.req.param("id");
  const rows = await sql(
    `
    SELECT point_id as id,
           public_lat,
           public_lng,
           precision,
           status,
           public_note,
           region,
           updated_at
    FROM public_map_cache
    WHERE point_id = $1
    ORDER BY snapshot_date DESC
    LIMIT 1
    `,
    [id]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Point not found", "NOT_FOUND");
  }
  return c.json(rows[0]);
});

app.get("/geocode", async (c) => {
  const sql = getSql(c.env);
  const address = c.req.query("address");
  if (!address) {
    return jsonError(c, 400, "address is required");
  }
  const normalized = normalizeQuery(address);
  const cached = await sql(
    `
    SELECT lat, lng, formatted_address
    FROM geocode_cache
    WHERE normalized_query = $1
    `,
    [normalized]
  );
  if (cached.length > 0) {
    return c.json(cached[0]);
  }

  const apiKey = c.env.GOOGLE_GEOCODING_API_KEY ?? c.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) {
    return jsonError(c, 500, "GOOGLE_MAPS_API_KEY is not configured", "CONFIG");
  }
  const endpoint = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  endpoint.searchParams.set("address", address);
  endpoint.searchParams.set("key", apiKey);
  const response = await fetch(endpoint.toString());
  if (!response.ok) {
    return jsonError(c, 502, "Geocoding provider failed", "UPSTREAM");
  }
  const data = (await response.json()) as {
    status: string;
    results: Array<{
      formatted_address: string;
      geometry: { location: { lat: number; lng: number } };
    }>;
    error_message?: string;
  };
  if (data.status !== "OK" || data.results.length === 0) {
    return jsonError(
      c,
      404,
      data.error_message ?? "Address not found",
      "NOT_FOUND"
    );
  }
  const result = data.results[0];
  const payload = {
    lat: result.geometry.location.lat,
    lng: result.geometry.location.lng,
    formatted_address: result.formatted_address,
  };
  await sql(
    `
    INSERT INTO geocode_cache (address_query, normalized_query, lat, lng, formatted_address)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (normalized_query) DO UPDATE SET
      lat = EXCLUDED.lat,
      lng = EXCLUDED.lng,
      formatted_address = EXCLUDED.formatted_address,
      updated_at = now()
    `,
    [address, normalized, payload.lat, payload.lng, payload.formatted_address]
  );
  return c.json(payload);
});

app.post("/reports/preview", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | { bounds?: Bounds; include?: ReportInclude }
    | null;
  if (!body?.bounds) {
    return jsonError(c, 400, "bounds is required");
  }
  const { west, south, east, north } = body.bounds;
  const rows = await sql(
    `
    SELECT COUNT(*)::int AS points,
           COALESCE(SUM(residents), 0)::int AS residents,
           MAX(updated_at) AS last_updated
    FROM public_map_cache
    WHERE snapshot_date = CURRENT_DATE
      AND ST_Intersects(geog::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))
    `,
    [west, south, east, north]
  );
  return c.json({
    report_id: `rep_${crypto.randomUUID()}`,
    summary: rows[0] ?? null,
  });
});

app.post("/reports/export", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | { bounds?: Bounds; format?: "PDF" | "CSV" | "JSON"; include?: ReportInclude }
    | null;
  if (!body?.bounds || !body.format) {
    return jsonError(c, 400, "bounds and format are required");
  }
  const { west, south, east, north } = body.bounds;
  const rows = await sql(
    `
    SELECT point_id as id,
           public_lat,
           public_lng,
           status,
           precision,
           region,
           residents,
           public_note,
           updated_at
    FROM public_map_cache
    WHERE snapshot_date = CURRENT_DATE
      AND ST_Intersects(geog::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))
    ORDER BY updated_at DESC
    `,
    [west, south, east, north]
  );

  if (body.format === "JSON") {
    const content = JSON.stringify({ items: rows }, null, 2);
    return c.json({
      content,
      content_type: "application/json",
      filename: `relatorio-${Date.now()}.json`,
    });
  }

  if (body.format === "CSV") {
    const header = [
      "id",
      "public_lat",
      "public_lng",
      "status",
      "precision",
      "region",
      "residents",
      "public_note",
      "updated_at",
    ];
    const lines = [
      header.join(","),
      ...rows.map((row) =>
        header
          .map((key) => {
            const value = row[key];
            if (value === null || value === undefined) return "";
            const text = String(value).replace(/"/g, '""');
            return `"${text}"`;
          })
          .join(",")
      ),
    ];
    return c.json({
      content: lines.join("\n"),
      content_type: "text/csv",
      filename: `relatorio-${Date.now()}.csv`,
    });
  }

  const pdf = await PDFDocument.create();
  const page = pdf.addPage();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const { width, height } = page.getSize();
  const title = "Relatorio publico";
  page.drawText(title, {
    x: 50,
    y: height - 70,
    size: 18,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(`Total de pontos: ${rows.length}`, {
    x: 50,
    y: height - 100,
    size: 12,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  const bytes = await pdf.save();
  const base64 = btoa(String.fromCharCode(...bytes));
  return c.json({
    content_base64: base64,
    content_type: "application/pdf",
    filename: `relatorio-${Date.now()}.pdf`,
  });
});

app.post("/residents", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | {
        full_name?: string;
        doc_id?: string;
        phone?: string;
        email?: string;
        address?: string;
        status?: "active" | "inactive";
        notes?: string;
      }
    | null;
  if (!body?.full_name || !body.status) {
    return jsonError(c, 400, "full_name and status are required");
  }
  const actorId =
    c.req.header("X-Actor-User-Id") ?? (await getSystemUserId(sql));
  const rows = await sql(
    `
    INSERT INTO residents (
      full_name, doc_id, phone, email, address, notes, status, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING id
    `,
    [
      body.full_name,
      body.doc_id ?? null,
      body.phone ?? null,
      body.email ?? null,
      body.address ?? null,
      body.notes ?? null,
      body.status,
      actorId,
    ]
  );
  return c.json({ id: rows[0].id });
});

app.put("/residents/:id", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown>;
  const allowed = [
    "full_name",
    "doc_id",
    "phone",
    "email",
    "address",
    "notes",
    "status",
  ];
  const updates = Object.entries(body ?? {}).filter(([key]) =>
    allowed.includes(key)
  );
  if (updates.length === 0) {
    return jsonError(c, 400, "No valid fields to update");
  }
  const sets = updates.map(
    ([key], index) => `${key} = $${index + 2}`
  );
  const values = updates.map(([, value]) => value ?? null);
  const id = c.req.param("id");
  await sql(
    `
    UPDATE residents
    SET ${sets.join(", ")}, updated_at = now()
    WHERE id = $1
    `,
    [id, ...values]
  );
  return c.json({ ok: true });
});

app.post("/points", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | {
        lat?: number;
        lng?: number;
        accuracy_m?: number | null;
        status?: "active" | "inactive";
        precision?: "approx" | "exact";
        category?: string;
        public_note?: string;
      }
    | null;
  if (
    body?.lat === undefined ||
    body?.lng === undefined ||
    !body.status ||
    !body.precision
  ) {
    return jsonError(c, 400, "lat, lng, status and precision are required");
  }
  const actorId =
    c.req.header("X-Actor-User-Id") ?? (await getSystemUserId(sql));
  const publicCoords =
    body.precision === "approx"
      ? jitterPoint(body.lat, body.lng, body.accuracy_m ?? 0)
      : { lat: body.lat, lng: body.lng };
  const rows = await sql(
    `
    INSERT INTO map_points (
      lat, lng, public_lat, public_lng, accuracy_m, precision, status, category, public_note,
      geog, created_by
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9,
      ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
      $10
    )
    RETURNING id, public_lat, public_lng, precision
    `,
    [
      body.lat,
      body.lng,
      publicCoords.lat,
      publicCoords.lng,
      body.accuracy_m ?? null,
      body.precision,
      body.status,
      body.category ?? null,
      body.public_note ?? null,
      actorId,
    ]
  );
  return c.json(rows[0]);
});

app.put("/points/:id", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | {
        lat?: number;
        lng?: number;
        accuracy_m?: number | null;
        status?: "active" | "inactive";
        precision?: "approx" | "exact";
        category?: string;
        public_note?: string;
      }
    | null;
  if (!body) {
    return jsonError(c, 400, "No valid fields to update");
  }
  const fields: Array<[string, unknown]> = [];
  if (body.lat !== undefined) fields.push(["lat", body.lat]);
  if (body.lng !== undefined) fields.push(["lng", body.lng]);
  if (body.accuracy_m !== undefined)
    fields.push(["accuracy_m", body.accuracy_m]);
  if (body.status !== undefined) fields.push(["status", body.status]);
  if (body.precision !== undefined) fields.push(["precision", body.precision]);
  if (body.category !== undefined) fields.push(["category", body.category]);
  if (body.public_note !== undefined)
    fields.push(["public_note", body.public_note]);
  if (fields.length === 0) {
    return jsonError(c, 400, "No valid fields to update");
  }
  const id = c.req.param("id");
  const sets = fields.map(([key], index) => `${key} = $${index + 2}`);
  const values = fields.map(([, value]) => value ?? null);
  let updateQuery = `
    UPDATE map_points
    SET ${sets.join(", ")}, updated_at = now()
  `;
  if (body.lat !== undefined && body.lng !== undefined) {
    const latIndex =
      fields.findIndex(([key]) => key === "lat") + 2;
    const lngIndex =
      fields.findIndex(([key]) => key === "lng") + 2;
    updateQuery += `, geog = ST_SetSRID(ST_MakePoint($${lngIndex}, $${latIndex}), 4326)::geography`;
  }
  updateQuery += " WHERE id = $1";
  await sql(updateQuery, [id, ...values]);
  return c.json({ ok: true });
});

app.post("/assignments", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | { resident_id?: string; point_id?: string }
    | null;
  if (!body?.resident_id || !body.point_id) {
    return jsonError(c, 400, "resident_id and point_id are required");
  }
  await sql("BEGIN");
  try {
    await sql(
      `
      UPDATE resident_point_assignments
      SET active = false, unassigned_at = now()
      WHERE resident_id = $1 AND active = true
      `,
      [body.resident_id]
    );
    await sql(
      `
      UPDATE resident_point_assignments
      SET active = false, unassigned_at = now()
      WHERE point_id = $1 AND active = true
      `,
      [body.point_id]
    );
    await sql(
      `
      INSERT INTO resident_point_assignments (resident_id, point_id, active)
      VALUES ($1, $2, true)
      `,
      [body.resident_id, body.point_id]
    );
    await sql("COMMIT");
  } catch (error) {
    await sql("ROLLBACK");
    throw error;
  }
  return c.json({ ok: true });
});

app.get("/audit", async (c) => {
  const sql = getSql(c.env);
  const actor = c.req.query("actor_user_id");
  const entity = c.req.query("entity_type");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limitRaw = toNumber(c.req.query("limit")) ?? 100;
  const limit = Math.min(Math.max(1, Math.floor(limitRaw)), 500);

  const filters: string[] = ["1=1"];
  const params: (string | number)[] = [];
  let index = 0;
  if (actor) {
    index += 1;
    filters.push(`actor_user_id = $${index}`);
    params.push(actor);
  }
  if (entity) {
    index += 1;
    filters.push(`entity_type = $${index}`);
    params.push(entity);
  }
  if (from) {
    index += 1;
    filters.push(`created_at >= $${index}`);
    params.push(from);
  }
  if (to) {
    index += 1;
    filters.push(`created_at <= $${index}`);
    params.push(to);
  }
  index += 1;
  params.push(limit);
  const rows = await sql(
    `
    SELECT *
    FROM audit_log
    WHERE ${filters.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT $${index}
    `,
    params
  );
  return c.json({ items: rows });
});

app.post("/admin/sync/public-map", async (c) => {
  await refreshPublicCache(c.env);
  return c.json({ ok: true });
});

app.get("/", (c) => c.json({ ok: true, name: "pnit-api" }));

app.onError((error, c) => {
  console.error("api error", error);
  return jsonError(c, 500, "Internal server error", "INTERNAL");
});

app.notFound((c) => jsonError(c, 404, "Not found", "NOT_FOUND"));

export default {
  fetch: app.fetch,
  scheduled: async (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) => {
    ctx.waitUntil(refreshPublicCache(env));
  },
};
