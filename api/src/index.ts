import { Hono, type Context } from "hono";
import { neon } from "@neondatabase/serverless";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

type Env = {
  DATABASE_URL: string;
  GOOGLE_MAPS_API_KEY?: string;
  GOOGLE_GEOCODING_API_KEY?: string;
  AUTH_JWT_SECRET?: string;
  PUBLIC_BASE_URL?: string;
  R2_BUCKET?: R2Bucket;
  COMPLAINTS_SECRET?: string;
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

type ReportFilters = {
  city?: string;
  state?: string;
  region?: string;
  from?: string;
  to?: string;
};

type UserClaims = {
  sub: string;
  role: "admin" | "employee" | "user";
  email: string;
  exp: number;
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

async function logAudit(
  sql: ReturnType<typeof neon>,
  actorUserId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
) {
  try {
    await sql(
      `
      INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [actorUserId, action, entityType, entityId, metadata ?? null]
    );
  } catch (error) {
    console.warn("audit_log_failed", error);
  }
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

function base64UrlEncode(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(input: string) {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function signJwt(payload: Omit<UserClaims, "exp">, secret: string) {
  const header = { alg: "HS256", typ: "JWT" };
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7;
  const fullPayload: UserClaims = { ...payload, exp };
  const data = `${base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(header)).buffer
  )}.${base64UrlEncode(
    new TextEncoder().encode(JSON.stringify(fullPayload)).buffer
  )}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );
  return `${data}.${base64UrlEncode(signature)}`;
}

async function verifyJwt(token: string, secret: string): Promise<UserClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [headerB64, payloadB64, signatureB64] = parts;
  const data = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlDecode(signatureB64),
    new TextEncoder().encode(data)
  );
  if (!valid) return null;
  const payload = JSON.parse(
    new TextDecoder().decode(base64UrlDecode(payloadB64))
  ) as UserClaims;
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload;
}

async function hashPassword(password: string, salt?: string) {
  const saltBytes = salt
    ? Uint8Array.from(atob(salt), (c) => c.charCodeAt(0))
    : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: saltBytes,
      iterations: 100000,
      hash: "SHA-256",
    },
    key,
    256
  );
  return {
    hash: btoa(String.fromCharCode(...new Uint8Array(derivedBits))),
    salt: btoa(String.fromCharCode(...saltBytes)),
  };
}

async function requireAuth(c: Context, env: Env) {
  const header = c.req.header("Authorization");
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  const token = header.slice(7);
  if (!env.AUTH_JWT_SECRET) {
    throw new Error("AUTH_JWT_SECRET is required.");
  }
  return verifyJwt(token, env.AUTH_JWT_SECRET);
}

function requireStaff(claims: UserClaims | null) {
  if (!claims) return false;
  return claims.role === "admin" || claims.role === "employee";
}

function getPublicBaseUrl(c: Context, env: Env) {
  if (env.PUBLIC_BASE_URL) {
    return env.PUBLIC_BASE_URL.replace(/\/+$/g, "");
  }
  const host = c.req.header("Host");
  const forwardedProto = c.req.header("X-Forwarded-Proto");
  if (host && forwardedProto) {
    return `${forwardedProto}://${host}`;
  }
  if (host && (host.includes("localhost") || host.includes("127.0.0.1"))) {
    return `http://${host}`;
  }
  return host ? `https://${host}` : "";
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

function extractLatLng(source: string) {
  const matches = source.match(
    /(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i
  );
  if (!matches) return null;
  const lat = Number(matches[1]);
  const lng = Number(matches[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function getClientIp(c: Context) {
  const direct = c.req.header("CF-Connecting-IP");
  if (direct) return direct;
  const forwarded = c.req.header("X-Forwarded-For");
  if (forwarded) return forwarded.split(",")[0].trim();
  return null;
}

function hasComplaintSecret(c: Context, env: Env) {
  if (!env.COMPLAINTS_SECRET) {
    return false;
  }
  const headerSecret = c.req.header("X-Complaints-Secret");
  const querySecret = c.req.query("secret");
  return headerSecret === env.COMPLAINTS_SECRET || querySecret === env.COMPLAINTS_SECRET;
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

function buildPublicCacheFilters(
  bounds?: Bounds | null,
  filters?: ReportFilters | null
) {
  const clauses: string[] = ["snapshot_date = CURRENT_DATE"];
  const params: (string | number)[] = [];
  let index = 0;
  if (bounds) {
    params.push(bounds.west, bounds.south, bounds.east, bounds.north);
    clauses.push(
      `ST_Intersects(geog::geometry, ST_MakeEnvelope($1, $2, $3, $4, 4326))`
    );
    index = 4;
  }
  if (filters?.city) {
    index += 1;
    clauses.push(`city ILIKE $${index}`);
    params.push(`%${filters.city}%`);
  }
  if (filters?.state) {
    index += 1;
    clauses.push(`state ILIKE $${index}`);
    params.push(`%${filters.state}%`);
  }
  if (filters?.region) {
    index += 1;
    clauses.push(`region ILIKE $${index}`);
    params.push(`%${filters.region}%`);
  }
  if (filters?.from) {
    index += 1;
    clauses.push(`updated_at >= $${index}`);
    params.push(filters.from);
  }
  if (filters?.to) {
    index += 1;
    clauses.push(`updated_at <= $${index}`);
    params.push(filters.to);
  }
  return { where: clauses.join(" AND "), params };
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

app.post("/auth/register", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | {
        email?: string;
        password?: string;
        full_name?: string;
        phone?: string;
        organization?: string;
        city?: string;
        state?: string;
        territory?: string;
        access_reason?: string;
      }
    | null;
  if (!body?.email || !body.password || !body.full_name || !body.phone) {
    return jsonError(c, 400, "email, password, full_name and phone are required");
  }
  if (!body.organization || !body.city || !body.state || !body.territory) {
    return jsonError(
      c,
      400,
      "organization, city, state and territory are required"
    );
  }
  if (!body.access_reason) {
    return jsonError(c, 400, "access_reason is required");
  }
  if (!c.env.AUTH_JWT_SECRET) {
    return jsonError(c, 500, "AUTH_JWT_SECRET is not configured", "CONFIG");
  }
  const existing = await sql("SELECT id FROM app_users WHERE email = $1", [
    body.email.toLowerCase(),
  ]);
  if (existing.length > 0) {
    return jsonError(c, 409, "Email already registered", "CONFLICT");
  }
  const userId = crypto.randomUUID();
  const password = await hashPassword(body.password);
  await sql(
    `
    INSERT INTO app_users (
      id, cognito_sub, email, role, status,
      full_name, phone, organization, city, state, territory, access_reason,
      password_hash, password_salt
    )
    VALUES ($1, $2, $3, 'user', 'pending', $4, $5, $6, $7, $8, $9, $10, $11, $12)
    `,
    [
      userId,
      userId,
      body.email.toLowerCase(),
      body.full_name,
      body.phone,
      body.organization,
      body.city,
      body.state,
      body.territory,
      body.access_reason,
      password.hash,
      password.salt,
    ]
  );
  await logAudit(sql, userId, "register", "app_users", userId, {
    status: "pending",
  });
  return c.json({
    status: "pending",
    message: "Cadastro recebido. Aguarde aprovacao do administrador.",
  });
});

app.post("/auth/login", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | { email?: string; password?: string }
    | null;
  if (!body?.email || !body.password) {
    return jsonError(c, 400, "email and password are required");
  }
  if (!c.env.AUTH_JWT_SECRET) {
    return jsonError(c, 500, "AUTH_JWT_SECRET is not configured", "CONFIG");
  }
  const rows = await sql(
    "SELECT id, email, role, status, password_hash, password_salt FROM app_users WHERE email = $1",
    [body.email.toLowerCase()]
  );
  if (rows.length === 0) {
    return jsonError(c, 401, "Invalid credentials", "UNAUTHORIZED");
  }
  const user = rows[0] as {
    id: string;
    email: string;
    role: UserClaims["role"];
    status: "active" | "pending" | "disabled";
    password_hash: string;
    password_salt: string;
  };
  if (user.status === "pending") {
    return jsonError(c, 403, "Usuario pendente de aprovacao", "FORBIDDEN");
  }
  if (user.status === "disabled") {
    return jsonError(c, 403, "Usuario desativado", "FORBIDDEN");
  }
  const password = await hashPassword(body.password, user.password_salt);
  if (password.hash !== user.password_hash) {
    return jsonError(c, 401, "Invalid credentials", "UNAUTHORIZED");
  }
  await sql("UPDATE app_users SET last_login_at = now() WHERE id = $1", [
    user.id,
  ]);
  await logAudit(sql, user.id, "login", "app_users", user.id);
  const token = await signJwt(
    { sub: user.id, email: user.email, role: user.role },
    c.env.AUTH_JWT_SECRET
  );
  return c.json({ token, user: { id: user.id, email: user.email, role: user.role } });
});

app.get("/auth/me", async (c) => {
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  return c.json({ user: { id: claims.sub, email: claims.email, role: claims.role } });
});

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
  const city = c.req.query("city");
  const state = c.req.query("state");
  const region = c.req.query("region");

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
  if (city) {
    index += 1;
    filters.push(`city ILIKE $${index}`);
    params.push(`%${city}%`);
  }
  if (state) {
    index += 1;
    filters.push(`state ILIKE $${index}`);
    params.push(`%${state}%`);
  }
  if (region) {
    index += 1;
    filters.push(`region ILIKE $${index}`);
    params.push(`%${region}%`);
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
           city,
           state,
           residents,
           photo_attachment_id
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

  const baseUrl = getPublicBaseUrl(c, c.env);
  const mapped = items.map((item) => ({
    ...item,
    photo_url: item.photo_attachment_id
      ? `${baseUrl}/attachments/${item.photo_attachment_id}`
      : null,
  }));

  return c.json({
    items: mapped,
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
           city,
           state,
           updated_at,
           photo_attachment_id
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
  const baseUrl = getPublicBaseUrl(c, c.env);
  const row = rows[0] as Record<string, unknown>;
  return c.json({
    ...row,
    photo_url: row.photo_attachment_id
      ? `${baseUrl}/attachments/${row.photo_attachment_id}`
      : null,
  });
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
    | { bounds?: Bounds; include?: ReportInclude; filters?: ReportFilters }
    | null;
  const hasFilters =
    Boolean(body?.bounds) ||
    Boolean(body?.filters?.city) ||
    Boolean(body?.filters?.state) ||
    Boolean(body?.filters?.region) ||
    Boolean(body?.filters?.from) ||
    Boolean(body?.filters?.to);
  if (!hasFilters) {
    return jsonError(c, 400, "bounds or filters are required");
  }
  const { where, params } = buildPublicCacheFilters(
    body?.bounds ?? null,
    body?.filters ?? null
  );
  const summaryRows = await sql(
    `
    SELECT COUNT(*)::int AS points,
           COALESCE(SUM(residents), 0)::int AS residents,
           MAX(updated_at) AS last_updated
    FROM public_map_cache
    WHERE ${where}
    `,
    params
  );
  const statusRows = await sql(
    `
    SELECT status, COUNT(*)::int AS count
    FROM public_map_cache
    WHERE ${where}
    GROUP BY status
    `,
    params
  );
  const precisionRows = await sql(
    `
    SELECT precision, COUNT(*)::int AS count
    FROM public_map_cache
    WHERE ${where}
    GROUP BY precision
    `,
    params
  );
  const cityRows = await sql(
    `
    SELECT city, COUNT(*)::int AS count
    FROM public_map_cache
    WHERE ${where}
      AND city IS NOT NULL
    GROUP BY city
    ORDER BY count DESC
    LIMIT 20
    `,
    params
  );
  const stateRows = await sql(
    `
    SELECT state, COUNT(*)::int AS count
    FROM public_map_cache
    WHERE ${where}
      AND state IS NOT NULL
    GROUP BY state
    ORDER BY count DESC
    `,
    params
  );
  return c.json({
    report_id: `rep_${crypto.randomUUID()}`,
    summary: summaryRows[0] ?? null,
    breakdown: {
      status: statusRows,
      precision: precisionRows,
      by_city: cityRows,
      by_state: stateRows,
    },
  });
});

app.post("/reports/export", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | {
        bounds?: Bounds;
        format?: "PDF" | "CSV" | "JSON";
        include?: ReportInclude;
        filters?: ReportFilters;
      }
    | null;
  const hasFilters =
    Boolean(body?.bounds) ||
    Boolean(body?.filters?.city) ||
    Boolean(body?.filters?.state) ||
    Boolean(body?.filters?.region) ||
    Boolean(body?.filters?.from) ||
    Boolean(body?.filters?.to);
  if (!hasFilters || !body?.format) {
    return jsonError(c, 400, "bounds or filters and format are required");
  }
  const { where, params } = buildPublicCacheFilters(
    body?.bounds ?? null,
    body?.filters ?? null
  );
  const rows = await sql(
    `
    SELECT point_id as id,
           public_lat,
           public_lng,
           status,
           precision,
           region,
           city,
           state,
           residents,
           public_note,
           updated_at
    FROM public_map_cache
    WHERE ${where}
    ORDER BY updated_at DESC
    `,
    params
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
      "city",
      "state",
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

app.get("/reports/user-summary", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const requestedUser =
    claims.role === "admin" ? c.req.query("user_id") : null;
  const userId = requestedUser ?? claims.sub;
  const summaryRows = await sql(
    `
    SELECT COUNT(*)::int AS total_residents
    FROM residents
    WHERE created_by = $1 AND deleted_at IS NULL
    `,
    [userId]
  );
  const averages = await sql(
    `
    SELECT
      AVG(rp.health_score)::numeric(10,2) AS health_score,
      AVG(rp.education_score)::numeric(10,2) AS education_score,
      AVG(rp.income_score)::numeric(10,2) AS income_score,
      AVG(rp.income_monthly)::numeric(12,2) AS income_monthly,
      AVG(rp.housing_score)::numeric(10,2) AS housing_score,
      AVG(rp.security_score)::numeric(10,2) AS security_score
    FROM resident_profiles rp
    JOIN residents r ON r.id = rp.resident_id
    WHERE r.created_by = $1 AND r.deleted_at IS NULL
    `,
    [userId]
  );
  const monthly = await sql(
    `
    SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
           COUNT(*)::int AS total
    FROM residents
    WHERE created_by = $1 AND deleted_at IS NULL
    GROUP BY 1
    ORDER BY 1 DESC
    LIMIT 12
    `,
    [userId]
  );
  const residents = await sql(
    `
    SELECT id, full_name, city, state, status, created_at
    FROM residents
    WHERE created_by = $1 AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 500
    `,
    [userId]
  );
  const activeUsers =
    claims.role === "admin"
      ? await sql(
          "SELECT COUNT(*)::int AS total FROM app_users WHERE status = 'active'"
        )
      : [{ total: null }];
  return c.json({
    summary: summaryRows[0] ?? null,
    averages: averages[0] ?? null,
    monthly,
    residents,
    active_users: activeUsers[0]?.total ?? null,
  });
});

app.get("/admin/users", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const status = c.req.query("status");
  const role = c.req.query("role");
  const search = c.req.query("q");
  const filters: string[] = ["1=1"];
  const params: (string | number)[] = [];
  if (status) {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }
  if (role) {
    params.push(role);
    filters.push(`role = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    filters.push(`LOWER(email) LIKE $${params.length}`);
  }
  const rows = await sql(
    `
    SELECT id, email, role, status, full_name, phone, organization, city, state, territory,
           access_reason, created_at, last_login_at
    FROM app_users
    WHERE ${filters.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 500
    `,
    params
  );
  return c.json({ items: rows });
});

app.post("/admin/users", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const body = (await c.req.json().catch(() => null)) as
    | {
        email?: string;
        password?: string;
        role?: "admin" | "employee" | "user";
        status?: "active" | "pending" | "disabled";
        full_name?: string;
        phone?: string;
        organization?: string;
        city?: string;
        state?: string;
        territory?: string;
        access_reason?: string;
      }
    | null;
  if (!body?.email || !body.password || !body.full_name) {
    return jsonError(c, 400, "email, password and full_name are required");
  }
  const existing = await sql("SELECT id FROM app_users WHERE email = $1", [
    body.email.toLowerCase(),
  ]);
  if (existing.length > 0) {
    return jsonError(c, 409, "Email already registered", "CONFLICT");
  }
  const password = await hashPassword(body.password);
  const userId = crypto.randomUUID();
  const rows = await sql(
    `
    INSERT INTO app_users (
      id, cognito_sub, email, role, status, full_name, phone, organization,
      city, state, territory, access_reason, password_hash, password_salt
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    RETURNING id, email, role, status
    `,
    [
      userId,
      userId,
      body.email.toLowerCase(),
      body.role ?? "employee",
      body.status ?? "active",
      body.full_name,
      body.phone ?? null,
      body.organization ?? null,
      body.city ?? null,
      body.state ?? null,
      body.territory ?? null,
      body.access_reason ?? null,
      password.hash,
      password.salt,
    ]
  );
  await logAudit(sql, claims.sub, "admin_user_create", "app_users", userId, {
    email: body.email.toLowerCase(),
  });
  return c.json({ user: rows[0] });
});

app.put("/admin/users/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown>;
  const allowed = [
    "role",
    "status",
    "full_name",
    "phone",
    "organization",
    "city",
    "state",
    "territory",
    "access_reason",
  ];
  const updates = Object.entries(body ?? {}).filter(([key]) =>
    allowed.includes(key)
  );
  if (updates.length === 0) {
    return jsonError(c, 400, "No valid fields to update");
  }
  const sets = updates.map(([key], index) => `${key} = $${index + 2}`);
  const values = updates.map(([, value]) => value ?? null);
  const id = c.req.param("id");
  await sql(
    `
    UPDATE app_users
    SET ${sets.join(", ")}, updated_at = now()
    WHERE id = $1
    `,
    [id, ...values]
  );
  await logAudit(sql, claims.sub, "admin_user_update", "app_users", id, {
    fields: updates.map(([key]) => key),
  });
  return c.json({ ok: true });
});

app.get("/admin/productivity", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const periodRaw = c.req.query("period") ?? "month";
  const period =
    periodRaw === "day" || periodRaw === "week" || periodRaw === "month"
      ? periodRaw
      : "month";
  const from = c.req.query("from");
  const to = c.req.query("to");
  const city = c.req.query("city");
  const state = c.req.query("state");
  const userId = c.req.query("user_id");

  const residentFilters: string[] = ["r.deleted_at IS NULL"];
  const residentParams: (string | number)[] = [];
  if (from) {
    residentParams.push(from);
    residentFilters.push(`r.created_at >= $${residentParams.length}`);
  }
  if (to) {
    residentParams.push(to);
    residentFilters.push(`r.created_at <= $${residentParams.length}`);
  }
  if (city) {
    residentParams.push(`%${city}%`);
    residentFilters.push(`r.city ILIKE $${residentParams.length}`);
  }
  if (state) {
    residentParams.push(`%${state}%`);
    residentFilters.push(`r.state ILIKE $${residentParams.length}`);
  }
  if (userId) {
    residentParams.push(userId);
    residentFilters.push(`r.created_by = $${residentParams.length}`);
  }

  const pointFilters: string[] = ["p.deleted_at IS NULL"];
  const pointParams: (string | number)[] = [];
  if (from) {
    pointParams.push(from);
    pointFilters.push(`p.created_at >= $${pointParams.length}`);
  }
  if (to) {
    pointParams.push(to);
    pointFilters.push(`p.created_at <= $${pointParams.length}`);
  }
  if (city) {
    pointParams.push(`%${city}%`);
    pointFilters.push(`p.city ILIKE $${pointParams.length}`);
  }
  if (state) {
    pointParams.push(`%${state}%`);
    pointFilters.push(`p.state ILIKE $${pointParams.length}`);
  }
  if (userId) {
    pointParams.push(userId);
    pointFilters.push(`p.created_by = $${pointParams.length}`);
  }

  const residentRows = await sql(
    `
    SELECT r.created_by AS user_id,
           COUNT(*)::int AS residents,
           ROUND(AVG(rp.health_score)::numeric, 2) AS health_avg,
           ROUND(AVG(rp.education_score)::numeric, 2) AS education_avg,
           ROUND(AVG(rp.income_score)::numeric, 2) AS income_avg,
           ROUND(AVG(rp.housing_score)::numeric, 2) AS housing_avg,
           ROUND(AVG(rp.security_score)::numeric, 2) AS security_avg
    FROM residents r
    LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
    WHERE ${residentFilters.join(" AND ")}
    GROUP BY r.created_by
    `,
    residentParams
  );

  const pointRows = await sql(
    `
    SELECT p.created_by AS user_id,
           COUNT(*)::int AS points
    FROM map_points p
    WHERE ${pointFilters.join(" AND ")}
    GROUP BY p.created_by
    `,
    pointParams
  );

  const residentTotals = await sql(
    `
    SELECT COUNT(*)::int AS total
    FROM residents r
    WHERE ${residentFilters.join(" AND ")}
    `,
    residentParams
  );
  const pointTotals = await sql(
    `
    SELECT COUNT(*)::int AS total
    FROM map_points p
    WHERE ${pointFilters.join(" AND ")}
    `,
    pointParams
  );

  const residentSeries = await sql(
    `
    SELECT date_trunc('${period}', r.created_at) AS bucket,
           COUNT(*)::int AS total
    FROM residents r
    WHERE ${residentFilters.join(" AND ")}
    GROUP BY bucket
    ORDER BY bucket
    `,
    residentParams
  );
  const pointSeries = await sql(
    `
    SELECT date_trunc('${period}', p.created_at) AS bucket,
           COUNT(*)::int AS total
    FROM map_points p
    WHERE ${pointFilters.join(" AND ")}
    GROUP BY bucket
    ORDER BY bucket
    `,
    pointParams
  );

  const userIds = Array.from(
    new Set([
      ...residentRows.map((row) => row.user_id as string),
      ...pointRows.map((row) => row.user_id as string),
    ])
  );

  const users =
    userIds.length > 0
      ? await sql(
          `
          SELECT id, full_name, email
          FROM app_users
          WHERE id = ANY($1)
          `,
          [userIds]
        )
      : [];

  const usersById = new Map(
    users.map((user) => [
      user.id as string,
      { full_name: user.full_name as string | null, email: user.email as string },
    ])
  );

  const residentsByUser = new Map(
    residentRows.map((row) => [row.user_id as string, row])
  );
  const pointsByUser = new Map(
    pointRows.map((row) => [row.user_id as string, row])
  );

  const byUser = userIds.map((id) => {
    const resident = residentsByUser.get(id);
    const points = pointsByUser.get(id);
    const user = usersById.get(id);
    return {
      user_id: id,
      full_name: user?.full_name ?? null,
      email: user?.email ?? null,
      residents: resident?.residents ?? 0,
      points: points?.points ?? 0,
      health_avg: resident?.health_avg ?? null,
      education_avg: resident?.education_avg ?? null,
      income_avg: resident?.income_avg ?? null,
      housing_avg: resident?.housing_avg ?? null,
      security_avg: resident?.security_avg ?? null,
    };
  });

  return c.json({
    summary: {
      total_residents: residentTotals[0]?.total ?? 0,
      total_points: pointTotals[0]?.total ?? 0,
      period,
    },
    by_user: byUser.sort((a, b) => b.points - a.points),
    series: {
      residents: residentSeries,
      points: pointSeries,
    },
  });
});

app.post("/residents", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireStaff(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const id = c.req.param("id");
  if (claims.role !== "admin") {
    const owner = await sql(
      "SELECT id FROM map_points WHERE id = $1 AND created_by = $2",
      [id, claims.sub]
    );
    if (owner.length === 0) {
      return jsonError(c, 403, "Forbidden", "FORBIDDEN");
    }
  }
  const body = (await c.req.json().catch(() => null)) as
    | {
        full_name?: string;
        doc_id?: string;
        phone?: string;
        email?: string;
        address?: string;
        city?: string;
        state?: string;
        status?: "active" | "inactive";
        notes?: string;
      }
    | null;
  if (!body?.full_name || !body.status) {
    return jsonError(c, 400, "full_name and status are required");
  }
  const actorId = claims.sub;
  const rows = await sql(
    `
    INSERT INTO residents (
      full_name, doc_id, phone, email, address, city, state, notes, status, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING id
    `,
    [
      body.full_name,
      body.doc_id ?? null,
      body.phone ?? null,
      body.email ?? null,
      body.address ?? null,
      body.city ?? null,
      body.state ?? null,
      body.notes ?? null,
      body.status,
      actorId,
    ]
  );
  await logAudit(sql, actorId, "resident_create", "residents", rows[0].id);
  return c.json({ id: rows[0].id });
});

app.put("/residents/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireStaff(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const id = c.req.param("id");
  if (claims.role !== "admin") {
    const owner = await sql(
      "SELECT id FROM residents WHERE id = $1 AND created_by = $2",
      [id, claims.sub]
    );
    if (owner.length === 0) {
      return jsonError(c, 403, "Forbidden", "FORBIDDEN");
    }
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown>;
  const allowed = [
    "full_name",
    "doc_id",
    "phone",
    "email",
    "address",
    "city",
    "state",
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
  await sql(
    `
    UPDATE residents
    SET ${sets.join(", ")}, updated_at = now()
    WHERE id = $1
    `,
    [id, ...values]
  );
  await logAudit(sql, claims.sub, "resident_update", "residents", id, {
    fields: updates.map(([key]) => key),
  });
  return c.json({ ok: true });
});

app.get("/residents", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireStaff(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const createdBy =
    c.req.query("created_by") === "me" ? claims.sub : c.req.query("created_by");
  const params: (string | number)[] = [];
  const filters: string[] = ["deleted_at IS NULL"];
  if (createdBy) {
    params.push(createdBy);
    filters.push(`created_by = $${params.length}`);
  } else if (claims.role !== "admin") {
    params.push(claims.sub);
    filters.push(`created_by = $${params.length}`);
  }
  const rows = await sql(
    `
    SELECT id, full_name, city, state, status, created_at
    FROM residents
    WHERE ${filters.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 500
    `,
    params
  );
  return c.json({ items: rows });
});

app.post("/residents/:id/profile", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireStaff(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const residentId = c.req.param("id");
  if (claims.role !== "admin") {
    const owner = await sql(
      "SELECT id FROM residents WHERE id = $1 AND created_by = $2",
      [residentId, claims.sub]
    );
    if (owner.length === 0) {
      return jsonError(c, 403, "Forbidden", "FORBIDDEN");
    }
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown>;
  if (!body) {
    return jsonError(c, 400, "Profile data is required");
  }
  const fields = [
    "health_score",
    "health_has_clinic",
    "health_has_emergency",
    "health_has_community_agent",
    "health_notes",
    "education_score",
    "education_level",
    "education_has_school",
    "education_has_transport",
    "education_material_support",
    "education_notes",
    "income_score",
    "income_monthly",
    "income_source",
    "assets_has_car",
    "assets_has_fridge",
    "assets_has_furniture",
    "assets_has_land",
    "housing_score",
    "housing_rooms",
    "housing_area_m2",
    "housing_land_m2",
    "housing_type",
    "security_score",
    "security_has_police_station",
    "security_has_patrol",
    "security_notes",
    "race_identity",
    "territory_narrative",
    "territory_memories",
    "territory_conflicts",
    "territory_culture",
  ];
  const values = fields.map((field) => body[field] ?? null);
  const placeholders = values.map((_, idx) => `$${idx + 2}`);
  const updates = fields
    .map((field, idx) => `${field} = EXCLUDED.${field}`)
    .join(", ");
  await sql(
    `
    INSERT INTO resident_profiles (resident_id, ${fields.join(", ")})
    VALUES ($1, ${placeholders.join(", ")})
    ON CONFLICT (resident_id) DO UPDATE SET
      ${updates},
      updated_at = now()
    `,
    [residentId, ...values]
  );
  await logAudit(sql, claims.sub, "resident_profile_update", "residents", residentId);
  return c.json({ ok: true });
});

app.post("/points", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireStaff(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const body = (await c.req.json().catch(() => null)) as
    | {
        lat?: number;
        lng?: number;
        accuracy_m?: number | null;
        status?: "active" | "inactive";
        precision?: "approx" | "exact";
        category?: string;
        public_note?: string;
        city?: string;
        state?: string;
        location_text?: string;
      }
    | null;
  if (!body?.status || !body.precision) {
    return jsonError(c, 400, "status and precision are required");
  }
  let lat = body.lat;
  let lng = body.lng;
  if ((lat === undefined || lng === undefined) && body.location_text) {
    const parsed = extractLatLng(body.location_text);
    if (!parsed) {
      return jsonError(c, 400, "location_text must include valid lat,lng");
    }
    lat = parsed.lat;
    lng = parsed.lng;
  }
  if (lat === undefined || lng === undefined) {
    return jsonError(c, 400, "lat and lng are required");
  }
  const actorId = claims.sub;
  const publicCoords =
    body.precision === "approx"
      ? jitterPoint(lat, lng, body.accuracy_m ?? 0)
      : { lat, lng };
  const rows = await sql(
    `
    INSERT INTO map_points (
      lat, lng, public_lat, public_lng, accuracy_m, precision, status, category, public_note,
      city, state, source_location, geog, created_by
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
      ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
      $13
    )
    RETURNING id, public_lat, public_lng, precision
    `,
    [
      lat,
      lng,
      publicCoords.lat,
      publicCoords.lng,
      body.accuracy_m ?? null,
      body.precision,
      body.status,
      body.category ?? null,
      body.public_note ?? null,
      body.city ?? null,
      body.state ?? null,
      body.location_text ?? null,
      actorId,
    ]
  );
  await logAudit(sql, actorId, "point_create", "map_points", rows[0].id, {
    precision: body.precision,
    status: body.status,
  });
  return c.json(rows[0]);
});

app.put("/points/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireStaff(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const id = c.req.param("id");
  if (claims.role !== "admin") {
    const owner = await sql(
      "SELECT id FROM map_points WHERE id = $1 AND created_by = $2",
      [id, claims.sub]
    );
    if (owner.length === 0) {
      return jsonError(c, 403, "Forbidden", "FORBIDDEN");
    }
  }
  const body = (await c.req.json().catch(() => null)) as
    | {
        lat?: number;
        lng?: number;
        accuracy_m?: number | null;
        status?: "active" | "inactive";
        precision?: "approx" | "exact";
        category?: string;
        public_note?: string;
        city?: string;
        state?: string;
        source_location?: string;
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
  if (body.city !== undefined) fields.push(["city", body.city]);
  if (body.state !== undefined) fields.push(["state", body.state]);
  if (body.source_location !== undefined)
    fields.push(["source_location", body.source_location]);
  if (fields.length === 0) {
    return jsonError(c, 400, "No valid fields to update");
  }
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
  await logAudit(sql, claims.sub, "point_update", "map_points", id, {
    fields: fields.map(([key]) => key),
  });
  return c.json({ ok: true });
});

app.post("/attachments", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireStaff(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  if (!c.env.R2_BUCKET) {
    return jsonError(c, 500, "R2_BUCKET is not configured", "CONFIG");
  }
  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) {
    return jsonError(c, 400, "file is required");
  }
  const pointId = typeof body.point_id === "string" ? body.point_id : null;
  const residentId =
    typeof body.resident_id === "string" ? body.resident_id : null;
  const visibility =
    typeof body.visibility === "string" ? body.visibility : "public";
  if (claims.role !== "admin") {
    if (pointId) {
      const owner = await sql(
        "SELECT id FROM map_points WHERE id = $1 AND created_by = $2",
        [pointId, claims.sub]
      );
      if (owner.length === 0) {
        return jsonError(c, 403, "Forbidden", "FORBIDDEN");
      }
    }
    if (residentId) {
      const owner = await sql(
        "SELECT id FROM residents WHERE id = $1 AND created_by = $2",
        [residentId, claims.sub]
      );
      if (owner.length === 0) {
        return jsonError(c, 403, "Forbidden", "FORBIDDEN");
      }
    }
  }
  const key = `${crypto.randomUUID()}-${file.name}`;
  await c.env.R2_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  const rows = await sql(
    `
    INSERT INTO attachments (resident_id, point_id, s3_key, mime_type, size, visibility)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
    `,
    [residentId, pointId, key, file.type || "application/octet-stream", file.size, visibility]
  );
  await logAudit(sql, claims.sub, "attachment_create", "attachments", rows[0].id, {
    point_id: pointId,
    resident_id: residentId,
  });
  return c.json({ id: rows[0].id });
});

app.get("/attachments/:id", async (c) => {
  if (!c.env.R2_BUCKET) {
    return jsonError(c, 500, "R2_BUCKET is not configured", "CONFIG");
  }
  const sql = getSql(c.env);
  const id = c.req.param("id");
  const rows = await sql(
    "SELECT s3_key, mime_type FROM attachments WHERE id = $1",
    [id]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Attachment not found", "NOT_FOUND");
  }
  const key = rows[0].s3_key as string;
  const mime = rows[0].mime_type as string;
  const object = await c.env.R2_BUCKET.get(key);
  if (!object) {
    return jsonError(c, 404, "Attachment not found", "NOT_FOUND");
  }
  c.header("Content-Type", mime);
  c.header("Cache-Control", "public, max-age=86400");
  return c.body(object.body);
});

app.post("/public/complaints", async (c) => {
  const sql = getSql(c.env);
  const contentType = c.req.header("Content-Type") ?? "";
  let body: Record<string, unknown> = {};
  let file: File | null = null;
  if (contentType.includes("multipart/form-data")) {
    const parsed = await c.req.parseBody();
    body = parsed as Record<string, unknown>;
    file = parsed.file instanceof File ? parsed.file : null;
  } else {
    body = ((await c.req.json().catch(() => null)) ??
      {}) as Record<string, unknown>;
  }

  const type =
    typeof body.type === "string" ? body.type.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const locationText =
    typeof body.location_text === "string" ? body.location_text.trim() : null;
  const city = typeof body.city === "string" ? body.city.trim() : null;
  const state = typeof body.state === "string" ? body.state.trim() : null;
  const lat =
    typeof body.lat === "number"
      ? body.lat
      : typeof body.lat === "string"
        ? Number(body.lat)
        : null;
  const lng =
    typeof body.lng === "number"
      ? body.lng
      : typeof body.lng === "string"
        ? Number(body.lng)
        : null;

  if (!type || !description) {
    return jsonError(c, 400, "type and description are required");
  }

  let resolvedLat = Number.isFinite(lat ?? NaN) ? lat : null;
  let resolvedLng = Number.isFinite(lng ?? NaN) ? lng : null;
  if ((resolvedLat === null || resolvedLng === null) && locationText) {
    const parsed = extractLatLng(locationText);
    if (parsed) {
      resolvedLat = parsed.lat;
      resolvedLng = parsed.lng;
    }
  }

  const complaintRows = await sql(
    `
    INSERT INTO complaints (type, description, location_text, lat, lng, city, state)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
    `,
    [
      type,
      description,
      locationText,
      resolvedLat ?? null,
      resolvedLng ?? null,
      city,
      state,
    ]
  );
  const complaintId = complaintRows[0].id as string;

  let attachmentId: string | null = null;
  if (file) {
    if (!c.env.R2_BUCKET) {
      return jsonError(c, 500, "R2_BUCKET is not configured", "CONFIG");
    }
    const key = `${crypto.randomUUID()}-${file.name}`;
    await c.env.R2_BUCKET.put(key, await file.arrayBuffer(), {
      httpMetadata: { contentType: file.type || "application/octet-stream" },
    });
    const attachmentRows = await sql(
      `
      INSERT INTO attachments (complaint_id, s3_key, mime_type, size, visibility)
      VALUES ($1, $2, $3, $4, 'public')
      RETURNING id
      `,
      [complaintId, key, file.type || "application/octet-stream", file.size]
    );
    attachmentId = attachmentRows[0].id as string;
    await sql(
      "UPDATE complaints SET photo_attachment_id = $1 WHERE id = $2",
      [attachmentId, complaintId]
    );
  }

  await sql(
    `
    INSERT INTO complaint_sensitive (complaint_id, ip_address, user_agent)
    VALUES ($1, $2, $3)
    `,
    [
      complaintId,
      getClientIp(c),
      c.req.header("User-Agent") ?? null,
    ]
  );

  return c.json({
    ok: true,
    id: complaintId,
    photo_attachment_id: attachmentId,
  });
});

app.get("/admin/complaints", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const status = c.req.query("status");
  const city = c.req.query("city");
  const state = c.req.query("state");
  const type = c.req.query("type");
  const limitRaw = toNumber(c.req.query("limit")) ?? 200;
  const limit = Math.min(Math.max(1, Math.floor(limitRaw)), 500);

  const filters: string[] = ["1=1"];
  const params: (string | number)[] = [];
  if (status) {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }
  if (city) {
    params.push(`%${city}%`);
    filters.push(`city ILIKE $${params.length}`);
  }
  if (state) {
    params.push(`%${state}%`);
    filters.push(`state ILIKE $${params.length}`);
  }
  if (type) {
    params.push(`%${type}%`);
    filters.push(`type ILIKE $${params.length}`);
  }
  params.push(limit);
  const rows = await sql(
    `
    SELECT id, type, description, location_text, lat, lng, city, state, status,
           photo_attachment_id, created_at
    FROM complaints
    WHERE ${filters.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT $${params.length}
    `,
    params
  );
  const baseUrl = getPublicBaseUrl(c, c.env);
  const items = rows.map((row) => ({
    ...row,
    photo_url: row.photo_attachment_id
      ? `${baseUrl}/attachments/${row.photo_attachment_id}`
      : null,
  }));
  return c.json({ items });
});

app.put("/admin/complaints/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const body = (await c.req.json().catch(() => null)) as
    | { status?: "new" | "reviewing" | "closed" }
    | null;
  if (!body?.status) {
    return jsonError(c, 400, "status is required");
  }
  const id = c.req.param("id");
  await sql("UPDATE complaints SET status = $2 WHERE id = $1", [
    id,
    body.status,
  ]);
  await logAudit(sql, claims.sub, "complaint_update", "complaints", id, {
    status: body.status,
  });
  return c.json({ ok: true });
});

app.get("/secure/complaints", async (c) => {
  const sql = getSql(c.env);
  if (!hasComplaintSecret(c, c.env)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const limitRaw = toNumber(c.req.query("limit")) ?? 200;
  const limit = Math.min(Math.max(1, Math.floor(limitRaw)), 500);
  const rows = await sql(
    `
    SELECT c.*,
           s.ip_address,
           s.user_agent
    FROM complaints c
    LEFT JOIN complaint_sensitive s ON s.complaint_id = c.id
    ORDER BY c.created_at DESC
    LIMIT $1
    `,
    [limit]
  );
  const baseUrl = getPublicBaseUrl(c, c.env);
  const items = rows.map((row) => ({
    ...row,
    photo_url: row.photo_attachment_id
      ? `${baseUrl}/attachments/${row.photo_attachment_id}`
      : null,
  }));
  return c.json({ items });
});

app.post("/assignments", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireStaff(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
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
  await logAudit(sql, claims.sub, "assignment_create", "resident_point_assignments", body.resident_id, {
    point_id: body.point_id,
  });
  return c.json({ ok: true });
});

app.get("/audit", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const isAdmin = claims.role === "admin";
  const actor = c.req.query("actor_user_id");
  if (!isAdmin && actor && actor !== claims.sub) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const entity = c.req.query("entity_type");
  const from = c.req.query("from");
  const to = c.req.query("to");
  const limitRaw = toNumber(c.req.query("limit")) ?? 100;
  const limit = Math.min(Math.max(1, Math.floor(limitRaw)), 500);

  const filters: string[] = ["1=1"];
  const params: (string | number)[] = [];
  let index = 0;
  if (actor || !isAdmin) {
    index += 1;
    filters.push(`actor_user_id = $${index}`);
    params.push(actor ?? claims.sub);
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
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  await refreshPublicCache(c.env);
  await logAudit(sql, claims.sub, "public_cache_refresh", "public_map_cache", "daily");
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
