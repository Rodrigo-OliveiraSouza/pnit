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

type CommunityPayload = {
  name: string;
  activity?: string | null;
  focus_social?: string | null;
  notes?: string | null;
  city?: string | null;
  state?: string | null;
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
    "Content-Type, Authorization, X-Actor-User-Id, X-Complaints-Secret"
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

function base64Encode(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64Decode(input: string) {
  const binary = atob(input);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveAesKey(secret: string, salt: Uint8Array) {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptSensitivePayload(secret: string, payload: Record<string, unknown>) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(secret, salt);
  const plaintext = new TextEncoder().encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  return {
    payload_ciphertext: base64Encode(new Uint8Array(ciphertext)),
    payload_iv: base64Encode(iv),
    payload_salt: base64Encode(salt),
  };
}

async function decryptSensitivePayload(
  secret: string,
  record: {
    payload_ciphertext?: string | null;
    payload_iv?: string | null;
    payload_salt?: string | null;
    ip_address?: string | null;
    user_agent?: string | null;
  }
) {
  if (record.payload_ciphertext && record.payload_iv && record.payload_salt) {
    const salt = base64Decode(record.payload_salt);
    const iv = base64Decode(record.payload_iv);
    const key = await deriveAesKey(secret, salt);
    const ciphertext = base64Decode(record.payload_ciphertext);
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      ciphertext
    );
    const decoded = JSON.parse(
      new TextDecoder().decode(new Uint8Array(plaintext))
    ) as { ip_address?: string | null; user_agent?: string | null };
    return {
      ip_address: decoded.ip_address ?? null,
      user_agent: decoded.user_agent ?? null,
    };
  }
  return {
    ip_address: record.ip_address ?? null,
    user_agent: record.user_agent ?? null,
  };
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

type MapCoordinate = { lat: number; lng: number };

function buildStaticMapUrl(apiKey: string, points: MapCoordinate[]) {
  const url = new URL("https://maps.googleapis.com/maps/api/staticmap");
  url.searchParams.set("size", "640x420");
  url.searchParams.set("scale", "2");
  url.searchParams.set("maptype", "roadmap");
  url.searchParams.set("key", apiKey);

  if (points.length > 0) {
    const lats = points.map((p) => p.lat);
    const lngs = points.map((p) => p.lng);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    url.searchParams.append("visible", `${minLat},${minLng}`);
    url.searchParams.append("visible", `${maxLat},${maxLng}`);
  }

  const markerColor = "0xd9482b";
  points.slice(0, 50).forEach((point) => {
    url.searchParams.append(
      "markers",
      `color:${markerColor}|${point.lat},${point.lng}`
    );
  });

  return url.toString();
}

type PublicCacheRefreshResult = {
  skipped: boolean;
  last_refresh?: string;
  refreshed_at?: string;
};

async function refreshPublicCache(
  env: Env,
  options: { force?: boolean } = {}
): Promise<PublicCacheRefreshResult> {
  const sql = getSql(env);
  const lastRefreshRows = await sql(
    "SELECT MAX(updated_at) AS last_refresh FROM public_map_cache"
  );
  const lastRefreshValue = lastRefreshRows[0]?.last_refresh as
    | string
    | Date
    | null
    | undefined;
  if (!options.force && lastRefreshValue) {
    const lastRefreshDate = new Date(lastRefreshValue);
    const elapsedMs = Date.now() - lastRefreshDate.getTime();
    if (elapsedMs < 24 * 60 * 60 * 1000) {
      return { skipped: true, last_refresh: lastRefreshDate.toISOString() };
    }
  }

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
      ),
      latest_photo AS (
        SELECT DISTINCT ON (point_id)
          id,
          point_id
        FROM attachments
        WHERE visibility = 'public' AND point_id IS NOT NULL
        ORDER BY point_id, created_at DESC
      )
      INSERT INTO public_map_cache (
        point_id,
        public_lat,
        public_lng,
        status,
        precision,
        region,
        city,
        state,
        community_name,
        residents,
        public_note,
        photo_attachment_id,
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
        mp.city,
        mp.state,
        mp.community_name,
        COALESCE(a.residents, 0),
        mp.public_note,
        lp.id,
        CURRENT_DATE,
        ST_SetSRID(ST_MakePoint(mp.public_lng, mp.public_lat), 4326)::geography,
        now()
      FROM map_points mp
      LEFT JOIN active_assignments a ON a.point_id = mp.id
      LEFT JOIN latest_photo lp ON lp.point_id = mp.id
      WHERE mp.deleted_at IS NULL
      `
    );
    await sql("COMMIT");
  } catch (error) {
    await sql("ROLLBACK");
    throw error;
  }

  return { skipped: false, refreshed_at: new Date().toISOString() };
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
  const community = c.req.query("community");

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
  if (community) {
    index += 1;
    filters.push(`community_name ILIKE $${index}`);
    params.push(`%${community}%`);
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
           community_name,
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

app.get("/map/communities", async (c) => {
  const sql = getSql(c.env);
  const city = c.req.query("city");
  const state = c.req.query("state");
  const filters = ["snapshot_date = CURRENT_DATE", "community_name IS NOT NULL"];
  const params: string[] = [];
  if (city) {
    params.push(city);
    filters.push(`city = $${params.length}`);
  }
  if (state) {
    params.push(state);
    filters.push(`state = $${params.length}`);
  }
  const rows = await sql(
    `
    SELECT community_name, city, state, COUNT(*)::int AS count
    FROM public_map_cache
    WHERE ${filters.join(" AND ")}
    GROUP BY community_name, city, state
    ORDER BY community_name
    `,
    params
  );
  return c.json({ items: rows });
});

app.get("/communities", async (c) => {
  const sql = getSql(c.env);
  const city = c.req.query("city") ?? null;
  const state = c.req.query("state") ?? null;
  const rows = await sql(
    `
    WITH catalog AS (
      SELECT name, activity, focus_social, notes, city, state
      FROM communities
    ),
    inferred AS (
      SELECT DISTINCT
        community_name as name,
        NULL::text as activity,
        NULL::text as focus_social,
        NULL::text as notes,
        city,
        state
      FROM public_map_cache
      WHERE community_name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1
          FROM communities c
          WHERE lower(c.name) = lower(public_map_cache.community_name)
        )
    )
    SELECT name, activity, focus_social, notes, city, state
    FROM (
      SELECT * FROM catalog
      UNION ALL
      SELECT * FROM inferred
    ) merged
    WHERE ($1::text IS NULL OR city = $1)
      AND ($2::text IS NULL OR state = $2)
    ORDER BY name
    `,
    [city, state]
  );
  return c.json({ items: rows });
});

app.post("/communities", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const body = (await c.req.json().catch(() => null)) as
    | CommunityPayload
    | null;
  if (!body) {
    return jsonError(c, 400, "Invalid payload");
  }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return jsonError(c, 400, "name is required");
  }
  const activity =
    typeof body.activity === "string" ? body.activity.trim() : null;
  const focusSocial =
    typeof body.focus_social === "string" ? body.focus_social.trim() : null;
  const notes =
    typeof body.notes === "string" ? body.notes.trim() : null;
  const city = typeof body.city === "string" ? body.city.trim() : null;
  const state = typeof body.state === "string" ? body.state.trim() : null;

  const rows = await sql(
    `
    INSERT INTO communities (name, activity, focus_social, notes, city, state, created_by)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (name) DO UPDATE SET
      activity = COALESCE(EXCLUDED.activity, communities.activity),
      focus_social = COALESCE(EXCLUDED.focus_social, communities.focus_social),
      notes = COALESCE(EXCLUDED.notes, communities.notes),
      city = COALESCE(EXCLUDED.city, communities.city),
      state = COALESCE(EXCLUDED.state, communities.state),
      updated_at = now()
    RETURNING id, name, activity, focus_social, notes, city, state
    `,
    [name, activity, focusSocial, notes, city, state, claims.sub]
  );

  const item = rows[0] as { id: string; name: string };
  await logAudit(sql, claims.sub, "community_create", "communities", item.id, {
    name,
    city,
    state,
  });

  return c.json({ item: rows[0] });
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
           community_name,
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
           community_name,
           residents,
           public_note,
           updated_at
    FROM public_map_cache
    WHERE ${where}
    ORDER BY updated_at DESC
    `,
    params
  );
  const boundaryRows = await sql(
    `
    SELECT ST_AsGeoJSON(
      ST_ConvexHull(ST_Collect(geog::geometry))
    ) AS boundary_geojson
    FROM public_map_cache
    WHERE ${where}
    `,
    params
  );
  const boundaryGeojson = boundaryRows[0]?.boundary_geojson ?? null;

  if (body.format === "JSON") {
    const content = JSON.stringify(
      { items: rows, boundary: boundaryGeojson },
      null,
      2
    );
    return c.json({
      content,
      content_type: "application/json",
      filename: `relatorio-${Date.now()}.json`,
    });
  }

  const pointsForMap = rows
    .map((row) => ({
      lat: Number(row.public_lat),
      lng: Number(row.public_lng),
    }))
    .filter(
      (point) =>
        Number.isFinite(point.lat) &&
        Number.isFinite(point.lng) &&
        Math.abs(point.lat) <= 90 &&
        Math.abs(point.lng) <= 180
    );

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
      "community_name",
      "residents",
      "public_note",
      "updated_at",
      "boundary_geojson",
    ];
    const lines = [
      header.join(","),
      ...rows.map((row, index) =>
        header
          .map((key) => {
            const value =
              key === "boundary_geojson"
                ? index === 0
                  ? boundaryGeojson
                  : ""
                : row[key];
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
  const boundaryText = boundaryGeojson
    ? `Malha (GeoJSON): ${boundaryGeojson.slice(0, 160)}${
        boundaryGeojson.length > 160 ? "..." : ""
      }`
    : "Malha (GeoJSON): nao disponivel";
  page.drawText(boundaryText, {
    x: 50,
    y: height - 120,
    size: 9,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

  if (pointsForMap.length > 0 && c.env.GOOGLE_MAPS_API_KEY) {
    try {
      const mapUrl = buildStaticMapUrl(
        c.env.GOOGLE_MAPS_API_KEY,
        pointsForMap
      );
      const mapResponse = await fetch(mapUrl);
      if (mapResponse.ok) {
        const mapImage = await mapResponse.arrayBuffer();
        const mapPage = pdf.addPage([842, 595]);
        const mapWidth = mapPage.getWidth();
        const mapHeight = mapPage.getHeight();
        const image = await pdf.embedPng(mapImage);
        const margin = 40;
        mapPage.drawText("Mapa dos pontos selecionados", {
          x: margin,
          y: mapHeight - 40,
          size: 16,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
        const maxWidth = mapWidth - margin * 2;
        const maxHeight = mapHeight - margin * 2 - 20;
        const scale = Math.min(
          maxWidth / image.width,
          maxHeight / image.height
        );
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        mapPage.drawImage(image, {
          x: margin,
          y: margin,
          width: drawWidth,
          height: drawHeight,
        });
      }
    } catch (error) {
      console.warn("static_map_failed", error);
    }
  }
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
    SELECT id, full_name, city, state, community_name, status, created_at
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

app.get("/admin/users/:id/details", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const userId = c.req.param("id");
  const users = await sql(
    `
    SELECT id, email, role, status, full_name, phone, organization, city, state,
           territory, access_reason, created_at, last_login_at
    FROM app_users
    WHERE id = $1
    `,
    [userId]
  );
  if (users.length === 0) {
    return jsonError(c, 404, "User not found", "NOT_FOUND");
  }
  const residents = await sql(
    `
    SELECT
      r.id,
      r.full_name,
      r.doc_id,
      r.phone,
      r.email,
      r.address,
      r.city,
      r.state,
      r.community_name,
      r.status,
      r.notes,
      r.created_at,
      rp.health_score,
      rp.education_score,
      rp.income_score,
      rp.income_monthly,
      rp.housing_score,
      rp.security_score,
      mp.id AS point_id,
      mp.status AS point_status,
      mp.precision AS point_precision,
      mp.category AS point_category,
      mp.public_note AS point_public_note,
      mp.city AS point_city,
      mp.state AS point_state,
      mp.community_name AS point_community_name,
      mp.created_at AS point_created_at
    FROM residents r
    LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
    LEFT JOIN resident_point_assignments rpa
      ON rpa.resident_id = r.id AND rpa.active = true
    LEFT JOIN map_points mp ON mp.id = rpa.point_id
    WHERE r.created_by = $1 AND r.deleted_at IS NULL
    ORDER BY r.created_at DESC
    `,
    [userId]
  );
  return c.json({ user: users[0], residents });
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
        community_name?: string;
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
      full_name, doc_id, phone, email, address, city, state, community_name, notes, status, created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
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
      body.community_name ?? null,
      body.notes ?? null,
      body.status,
      actorId,
    ]
  );
  await logAudit(sql, actorId, "resident_create", "residents", rows[0].id);
  return c.json({ id: rows[0].id });
});

app.get("/residents/:id", async (c) => {
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
  const rows = await sql(
    `
    SELECT
      r.id,
      r.full_name,
      r.doc_id,
      r.phone,
      r.email,
      r.address,
      r.city,
      r.state,
      r.community_name,
      r.status,
      r.notes,
      r.created_at,
      r.updated_at,
      rp.health_score,
      rp.health_has_clinic,
      rp.health_has_emergency,
      rp.health_has_community_agent,
      rp.health_notes,
      rp.education_score,
      rp.education_level,
      rp.education_has_school,
      rp.education_has_transport,
      rp.education_material_support,
      rp.education_notes,
      rp.income_score,
      rp.income_monthly,
      rp.income_source,
      rp.assets_has_car,
      rp.assets_has_fridge,
      rp.assets_has_furniture,
      rp.assets_has_land,
      rp.housing_score,
      rp.housing_rooms,
      rp.housing_area_m2,
      rp.housing_land_m2,
      rp.housing_type,
      rp.security_score,
      rp.security_has_police_station,
      rp.security_has_patrol,
      rp.security_notes,
      rp.race_identity,
      rp.territory_narrative,
      rp.territory_memories,
      rp.territory_conflicts,
      rp.territory_culture,
      mp.id AS point_id,
      mp.status AS point_status,
      mp.precision AS point_precision,
      mp.category AS point_category,
      mp.public_note AS point_public_note,
      mp.city AS point_city,
      mp.state AS point_state,
      mp.community_name AS point_community_name,
      mp.source_location AS point_location_text,
      mp.lat AS point_lat,
      mp.lng AS point_lng
    FROM residents r
    LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
    LEFT JOIN resident_point_assignments rpa
      ON rpa.resident_id = r.id AND rpa.active = true
    LEFT JOIN map_points mp ON mp.id = rpa.point_id
    WHERE r.id = $1 AND r.deleted_at IS NULL
    `,
    [id]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Resident not found", "NOT_FOUND");
  }
  const row = rows[0] as Record<string, unknown>;
  const pointId = row.point_id as string | null;
  return c.json({
    resident: {
      id: row.id,
      full_name: row.full_name,
      doc_id: row.doc_id,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      community_name: row.community_name,
      status: row.status,
      notes: row.notes,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
    profile: row.health_score !== null ? {
      health_score: row.health_score,
      health_has_clinic: row.health_has_clinic,
      health_has_emergency: row.health_has_emergency,
      health_has_community_agent: row.health_has_community_agent,
      health_notes: row.health_notes,
      education_score: row.education_score,
      education_level: row.education_level,
      education_has_school: row.education_has_school,
      education_has_transport: row.education_has_transport,
      education_material_support: row.education_material_support,
      education_notes: row.education_notes,
      income_score: row.income_score,
      income_monthly: row.income_monthly,
      income_source: row.income_source,
      assets_has_car: row.assets_has_car,
      assets_has_fridge: row.assets_has_fridge,
      assets_has_furniture: row.assets_has_furniture,
      assets_has_land: row.assets_has_land,
      housing_score: row.housing_score,
      housing_rooms: row.housing_rooms,
      housing_area_m2: row.housing_area_m2,
      housing_land_m2: row.housing_land_m2,
      housing_type: row.housing_type,
      security_score: row.security_score,
      security_has_police_station: row.security_has_police_station,
      security_has_patrol: row.security_has_patrol,
      security_notes: row.security_notes,
      race_identity: row.race_identity,
      territory_narrative: row.territory_narrative,
      territory_memories: row.territory_memories,
      territory_conflicts: row.territory_conflicts,
      territory_culture: row.territory_culture,
    } : null,
    point: pointId
      ? {
          id: pointId,
          status: row.point_status,
          precision: row.point_precision,
          category: row.point_category,
          public_note: row.point_public_note,
          city: row.point_city,
          state: row.point_state,
          community_name: row.point_community_name,
          location_text: row.point_location_text,
          lat: row.point_lat,
          lng: row.point_lng,
        }
      : null,
  });
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
    "community_name",
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
    SELECT id, full_name, city, state, community_name, status, created_at
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
        community_name?: string;
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
      city, state, community_name, source_location, geog, created_by
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
      ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
      $14
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
      body.community_name ?? null,
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
        community_name?: string;
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
  if (body.community_name !== undefined)
    fields.push(["community_name", body.community_name]);
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

  if (!c.env.COMPLAINTS_SECRET) {
    return jsonError(c, 500, "COMPLAINTS_SECRET is not configured", "CONFIG");
  }
  const sensitivePayload = await encryptSensitivePayload(c.env.COMPLAINTS_SECRET, {
    ip_address: getClientIp(c),
    user_agent: c.req.header("User-Agent") ?? null,
  });
  await sql(
    `
    INSERT INTO complaint_sensitive (
      complaint_id,
      payload_ciphertext,
      payload_iv,
      payload_salt
    )
    VALUES ($1, $2, $3, $4)
    `,
    [
      complaintId,
      sensitivePayload.payload_ciphertext,
      sensitivePayload.payload_iv,
      sensitivePayload.payload_salt,
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
           s.payload_ciphertext,
           s.payload_iv,
           s.payload_salt,
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
  if (!c.env.COMPLAINTS_SECRET) {
    return jsonError(c, 500, "COMPLAINTS_SECRET is not configured", "CONFIG");
  }
  const items = await Promise.all(
    rows.map(async (row) => {
      const record = row as Record<string, unknown>;
      const decrypted = await decryptSensitivePayload(c.env.COMPLAINTS_SECRET!, {
        payload_ciphertext: record.payload_ciphertext as string | null | undefined,
        payload_iv: record.payload_iv as string | null | undefined,
        payload_salt: record.payload_salt as string | null | undefined,
        ip_address: record.ip_address as string | null | undefined,
        user_agent: record.user_agent as string | null | undefined,
      });
      const {
        payload_ciphertext,
        payload_iv,
        payload_salt,
        ...base
      } = record;
      return {
        ...base,
        ...decrypted,
        photo_url: record.photo_attachment_id
          ? `${baseUrl}/attachments/${record.photo_attachment_id}`
          : null,
      };
    })
  );
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
  const forceRaw = (c.req.query("force") ?? "").toLowerCase();
  const force = forceRaw === "1" || forceRaw === "true";
  const refreshResult = await refreshPublicCache(c.env, { force });
  if (!refreshResult.skipped) {
    await logAudit(
      sql,
      claims.sub,
      "public_cache_refresh",
      "public_map_cache",
      "daily"
    );
  }
  return c.json({ ok: true, forced: force, ...refreshResult });
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
