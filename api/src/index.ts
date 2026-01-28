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
  families_count?: number | null;
  organization_type?: string | null;
  leader_name?: string | null;
  leader_contact?: string | null;
  activities?: string | null;
  meeting_frequency?: string | null;
  city?: string | null;
  state?: string | null;
};

type ThemeColors = {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  text: string;
  text_muted: string;
  heading: string;
  border: string;
  header_start?: string;
  header_end?: string;
  button_primary_bg?: string;
  button_primary_text?: string;
  button_secondary_bg?: string;
  button_secondary_text?: string;
};

type ThemeImageStyles = {
  overlay?: string;
  overlay_opacity?: number;
  saturation?: number;
  contrast?: number;
  brightness?: number;
  radius?: number;
  shadow?: string;
};

type ThemeTypography = {
  body?: string;
  heading?: string;
  button?: string;
};

type UserClaims = {
  sub: string;
  role: "admin" | "manager" | "registrar" | "teacher";
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
  c.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
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

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) {
    return null;
  }
  return {
    mime: match[1],
    base64: match[2],
  };
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
  return (
    claims.role === "admin" ||
    claims.role === "manager" ||
    claims.role === "registrar" ||
    claims.role === "teacher"
  );
}

function requireSupervisor(claims: UserClaims | null) {
  if (!claims) return false;
  return (
    claims.role === "admin" ||
    claims.role === "manager" ||
    claims.role === "teacher"
  );
}

function isAdmin(claims: UserClaims | null) {
  return claims?.role === "admin";
}

function isManagerOrTeacher(claims: UserClaims | null) {
  return claims?.role === "manager" || claims?.role === "teacher";
}

function normalizeRole(role: string | null | undefined): UserClaims["role"] {
  const normalized = role?.toLowerCase().trim();
  if (!normalized) return "registrar";

  if (normalized === "admin" || normalized === "administrador") {
    return "admin";
  }
  if (normalized === "manager" || normalized === "gerente") {
    return "manager";
  }
  if (normalized === "teacher" || normalized === "professor") {
    return "teacher";
  }
  if (normalized === "registrar" || normalized === "cadastrante") {
    return "registrar";
  }

  // Backward compatibility for old roles
  if (normalized === "employee" || normalized === "user") {
    return "registrar";
  }

  return "registrar";
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

const THEME_COLOR_KEYS = [
  "primary",
  "secondary",
  "accent",
  "background",
  "text",
  "text_muted",
  "heading",
  "border",
  "button_primary_bg",
  "button_primary_text",
  "button_secondary_bg",
  "button_secondary_text",
] as const;

const DEFAULT_THEME_IMAGE_STYLES: Required<ThemeImageStyles> = {
  overlay: "#000000",
  overlay_opacity: 0,
  saturation: 1,
  contrast: 1,
  brightness: 1,
  radius: 24,
  shadow: "0 18px 40px rgba(43,26,18,0.14)",
};

const DEFAULT_THEME_TYPOGRAPHY: Required<ThemeTypography> = {
  body: "\"Source Sans 3\", \"Segoe UI\", sans-serif",
  heading: "\"Newsreader\", serif",
  button: "\"Source Sans 3\", \"Segoe UI\", sans-serif",
};

function parseJsonField<T>(value: unknown): T | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }
  return value as T;
}

async function hasThemeTypographyColumn(sql: ReturnType<typeof neon>) {
  try {
    const rows = await sql(
      `
      SELECT 1
      FROM information_schema.columns
      WHERE table_name = 'theme_palettes'
        AND column_name = 'typography'
      LIMIT 1
      `
    );
    return rows.length > 0;
  } catch {
    return false;
  }
}

function normalizeThemeColors(payload: Record<string, unknown> | null): ThemeColors | null {
  if (!payload) return null;
  const colors: Record<string, string> = {};
  for (const key of THEME_COLOR_KEYS) {
    const value = payload[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      return null;
    }
    colors[key] = value.trim();
  }
  const headerStart =
    typeof payload.header_start === "string" && payload.header_start.trim()
      ? payload.header_start.trim()
      : colors.primary;
  const headerEnd =
    typeof payload.header_end === "string" && payload.header_end.trim()
      ? payload.header_end.trim()
      : colors.primary;
  return {
    primary: colors.primary,
    secondary: colors.secondary,
    accent: colors.accent,
    background: colors.background,
    text: colors.text,
    text_muted: colors.text_muted,
    heading: colors.heading,
    border: colors.border,
    header_start: headerStart,
    header_end: headerEnd,
    button_primary_bg: colors.button_primary_bg,
    button_primary_text: colors.button_primary_text,
    button_secondary_bg: colors.button_secondary_bg,
    button_secondary_text: colors.button_secondary_text,
  };
}

function normalizeThemeImageStyles(
  payload: Record<string, unknown> | null
): Required<ThemeImageStyles> {
  if (!payload) return { ...DEFAULT_THEME_IMAGE_STYLES };
  const clamp = (value: number, min: number, max: number) =>
    Math.min(max, Math.max(min, value));
  const overlay =
    typeof payload.overlay === "string" && payload.overlay.trim()
      ? payload.overlay.trim()
      : DEFAULT_THEME_IMAGE_STYLES.overlay;
  const overlayOpacityRaw =
    typeof payload.overlay_opacity === "number"
      ? payload.overlay_opacity
      : Number(payload.overlay_opacity);
  const overlay_opacity = Number.isFinite(overlayOpacityRaw)
    ? clamp(overlayOpacityRaw, 0, 1)
    : DEFAULT_THEME_IMAGE_STYLES.overlay_opacity;
  const saturationRaw =
    typeof payload.saturation === "number"
      ? payload.saturation
      : Number(payload.saturation);
  const contrastRaw =
    typeof payload.contrast === "number"
      ? payload.contrast
      : Number(payload.contrast);
  const brightnessRaw =
    typeof payload.brightness === "number"
      ? payload.brightness
      : Number(payload.brightness);
  const radiusRaw =
    typeof payload.radius === "number"
      ? payload.radius
      : Number(payload.radius);
  const saturation = Number.isFinite(saturationRaw)
    ? clamp(saturationRaw, 0.2, 3)
    : DEFAULT_THEME_IMAGE_STYLES.saturation;
  const contrast = Number.isFinite(contrastRaw)
    ? clamp(contrastRaw, 0.2, 3)
    : DEFAULT_THEME_IMAGE_STYLES.contrast;
  const brightness = Number.isFinite(brightnessRaw)
    ? clamp(brightnessRaw, 0.2, 3)
    : DEFAULT_THEME_IMAGE_STYLES.brightness;
  const radius = Number.isFinite(radiusRaw)
    ? clamp(radiusRaw, 0, 64)
    : DEFAULT_THEME_IMAGE_STYLES.radius;
  const shadow =
    typeof payload.shadow === "string" && payload.shadow.trim()
      ? payload.shadow.trim()
      : DEFAULT_THEME_IMAGE_STYLES.shadow;
  return {
    overlay,
    overlay_opacity,
    saturation,
    contrast,
    brightness,
    radius,
    shadow,
  };
}

function normalizeThemeTypography(
  payload: Record<string, unknown> | null
): Required<ThemeTypography> {
  if (!payload) return { ...DEFAULT_THEME_TYPOGRAPHY };
  const body =
    typeof payload.body === "string" && payload.body.trim()
      ? payload.body.trim()
      : DEFAULT_THEME_TYPOGRAPHY.body;
  const heading =
    typeof payload.heading === "string" && payload.heading.trim()
      ? payload.heading.trim()
      : DEFAULT_THEME_TYPOGRAPHY.heading;
  const button =
    typeof payload.button === "string" && payload.button.trim()
      ? payload.button.trim()
      : DEFAULT_THEME_TYPOGRAPHY.button;
  return { body, heading, button };
}

function generateAccessCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

function generateLinkCode() {
  return `V${generateAccessCode()}`;
}

const RESIDENT_PROFILE_FIELDS = [
  "health_score",
  "health_has_clinic",
  "health_has_emergency",
  "health_has_community_agent",
  "health_unit_distance_km",
  "health_travel_time",
  "health_has_regular_service",
  "health_has_ambulance",
  "health_difficulties",
  "health_notes",
  "education_score",
  "education_level",
  "education_has_school",
  "education_has_transport",
  "education_material_support",
  "education_has_internet",
  "education_notes",
  "income_score",
  "income_monthly",
  "income_source",
  "income_contributors",
  "income_occupation_type",
  "income_has_social_program",
  "income_social_program",
  "assets_has_car",
  "assets_has_fridge",
  "assets_has_furniture",
  "assets_has_land",
  "housing_score",
  "housing_rooms",
  "housing_area_m2",
  "housing_land_m2",
  "housing_type",
  "housing_material",
  "housing_has_bathroom",
  "housing_has_water_treated",
  "housing_condition",
  "housing_risks",
  "security_score",
  "security_has_police_station",
  "security_has_patrol",
  "security_has_guard",
  "security_occurrences",
  "security_notes",
  "race_identity",
  "territory_narrative",
  "territory_memories",
  "territory_conflicts",
  "territory_culture",
  "energy_access",
  "water_supply",
  "water_treatment",
  "sewage_type",
  "garbage_collection",
  "internet_access",
  "transport_access",
  "participation_types",
  "participation_events",
  "participation_engagement",
  "demand_priorities",
  "photo_types",
  "vulnerability_level",
  "technical_issues",
  "referrals",
  "agencies_contacted",
  "consent_accepted",
] as const;

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
        SELECT rpa.point_id, COUNT(*) AS residents
        FROM resident_point_assignments rpa
        JOIN residents r ON r.id = rpa.resident_id
        WHERE rpa.active = true
          AND r.approval_status = 'approved'
        GROUP BY rpa.point_id
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
        AND mp.approval_status = 'approved'
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
        role?: "registrar" | "manager";
        link_code?: string;
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
  const requestedRole = body.role ?? "registrar";
  if (requestedRole !== "registrar" && requestedRole !== "manager") {
    return jsonError(c, 400, "role must be registrar or manager");
  }
  let linkCodeId: string | null = null;
  let linkCodeCreator: string | null = null;
  if (typeof body.link_code === "string" && body.link_code.trim()) {
    const linkCodeValue = body.link_code.trim().toUpperCase();
    const linkCodeRows = await sql(
      `
      SELECT lc.id, lc.created_by, lc.status, lc.used_at, u.role AS creator_role
      FROM user_link_codes lc
      JOIN app_users u ON u.id = lc.created_by
      WHERE lc.code = $1
      `,
      [linkCodeValue]
    );
    if (linkCodeRows.length === 0) {
      return jsonError(c, 404, "Codigo de vinculacao invalido", "NOT_FOUND");
    }
    const linkCode = linkCodeRows[0] as {
      id: string;
      created_by: string;
      status: "active" | "used" | "revoked";
      used_at?: string | null;
      creator_role: UserClaims["role"];
    };
    if (linkCode.status !== "active" || linkCode.used_at) {
      return jsonError(c, 409, "Codigo de vinculacao ja utilizado", "CONFLICT");
    }
    if (
      linkCode.creator_role !== "manager" &&
      linkCode.creator_role !== "teacher" &&
      linkCode.creator_role !== "admin"
    ) {
      return jsonError(c, 403, "Codigo de vinculacao invalido", "FORBIDDEN");
    }
    linkCodeId = linkCode.id;
    linkCodeCreator = linkCode.created_by;
  }
  const userId = crypto.randomUUID();
  const password = await hashPassword(body.password);
  await sql(
    `
    INSERT INTO app_users (
      id, cognito_sub, email, role, status,
      full_name, phone, organization, city, state, territory, access_reason,
      password_hash, password_salt, link_code_id
    )
    VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    `,
    [
      userId,
      userId,
      body.email.toLowerCase(),
      requestedRole,
      body.full_name,
      body.phone,
      body.organization,
      body.city,
      body.state,
      body.territory,
      body.access_reason,
      password.hash,
      password.salt,
      linkCodeId,
    ]
  );
  if (linkCodeId) {
    await sql(
      `
      UPDATE user_link_codes
      SET status = 'used', used_at = now(), used_by = $2
      WHERE id = $1
      `,
      [linkCodeId, userId]
    );
  }
  await logAudit(sql, userId, "register", "app_users", userId, {
    status: "pending",
    role: requestedRole,
    link_code_id: linkCodeId,
  });
  return c.json({
    status: "pending",
    message: linkCodeCreator
      ? "Cadastro recebido. Aguarde aprovacao do responsavel pelo codigo."
      : "Cadastro recebido. Aguarde aprovacao do gestor.",
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
    role: string;
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
  const normalizedRole = normalizeRole(user.role);
  if (normalizedRole !== user.role) {
    await sql("UPDATE app_users SET role = $2 WHERE id = $1", [
      user.id,
      normalizedRole,
    ]);
  }
  await logAudit(sql, user.id, "login", "app_users", user.id);
  const token = await signJwt(
    { sub: user.id, email: user.email, role: normalizedRole },
    c.env.AUTH_JWT_SECRET
  );
  return c.json({
    token,
    user: { id: user.id, email: user.email, role: normalizedRole },
  });
});

app.get("/auth/me", async (c) => {
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  return c.json({ user: { id: claims.sub, email: claims.email, role: claims.role } });
});

app.post("/access-codes", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  let created: { id: string; code: string; created_at: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateAccessCode();
    try {
      const rows = await sql(
        `
        INSERT INTO access_codes (code, created_by)
        VALUES ($1, $2)
        RETURNING id, code, created_at
        `,
        [code, claims.sub]
      );
      created = rows[0] as { id: string; code: string; created_at: string };
      break;
    } catch (error) {
      const message = String(error).toLowerCase();
      if (message.includes("duplicate") || message.includes("unique")) {
        continue;
      }
      throw error;
    }
  }
  if (!created) {
    return jsonError(c, 500, "Falha ao gerar codigo", "INTERNAL");
  }
  await logAudit(sql, claims.sub, "access_code_create", "access_codes", created.id);
  return c.json({ item: created });
});

app.get("/access-codes", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const status = c.req.query("status");
  const params: (string | number)[] = [claims.sub];
  const filters = ["created_by = $1"];
  if (status) {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }
  const rows = await sql(
    `
    SELECT id, code, status, created_at, used_at
    FROM access_codes
    WHERE ${filters.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 50
    `,
    params
  );
  return c.json({ items: rows });
});

app.get("/public/access-code/validate", async (c) => {
  const sql = getSql(c.env);
  const code = c.req.query("code");
  if (!code) {
    return jsonError(c, 400, "code is required");
  }
  const codeValue = code.trim().toUpperCase();
  const rows = await sql(
    `
    SELECT id, code, created_by, status, used_at
    FROM access_codes
    WHERE code = $1
    `,
    [codeValue]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Codigo invalido", "NOT_FOUND");
  }
  const accessCode = rows[0] as {
    id: string;
    code: string;
    created_by: string;
    status: "active" | "used" | "revoked";
    used_at?: string | null;
  };
  if (accessCode.status !== "active" || accessCode.used_at) {
    return jsonError(c, 409, "Codigo ja utilizado", "CONFLICT");
  }
  return c.json({
    ok: true,
    code: accessCode.code,
    created_by: accessCode.created_by,
  });
});

app.post("/link-codes", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireSupervisor(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  let created: { id: string; code: string; created_at: string } | null = null;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateLinkCode();
    try {
      const rows = await sql(
        `
        INSERT INTO user_link_codes (code, created_by)
        VALUES ($1, $2)
        RETURNING id, code, created_at
        `,
        [code, claims.sub]
      );
      created = rows[0] as { id: string; code: string; created_at: string };
      break;
    } catch (error) {
      const message = String(error).toLowerCase();
      if (message.includes("duplicate") || message.includes("unique")) {
        continue;
      }
      throw error;
    }
  }
  if (!created) {
    return jsonError(c, 500, "Falha ao gerar codigo", "INTERNAL");
  }
  await logAudit(sql, claims.sub, "link_code_create", "user_link_codes", created.id);
  return c.json({ item: created });
});

app.get("/link-codes", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireSupervisor(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const status = c.req.query("status");
  const params: (string | number)[] = [claims.sub];
  const filters = ["created_by = $1"];
  if (status) {
    params.push(status);
    filters.push(`status = $${params.length}`);
  }
  const rows = await sql(
    `
    SELECT id, code, status, created_at, used_at, used_by
    FROM user_link_codes
    WHERE ${filters.join(" AND ")}
    ORDER BY created_at DESC
    LIMIT 50
    `,
    params
  );
  return c.json({ items: rows });
});

app.put("/link-codes/:id/revoke", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!requireSupervisor(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const id = c.req.param("id");
  const rows = await sql(
    "SELECT id, created_by, status FROM user_link_codes WHERE id = $1",
    [id]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Codigo nao encontrado", "NOT_FOUND");
  }
  const code = rows[0] as {
    id: string;
    created_by: string;
    status: "active" | "used" | "revoked";
  };
  if (!isAdmin(claims) && code.created_by !== claims.sub) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  if (code.status !== "active") {
    return c.json({ ok: true });
  }
  await sql(
    "UPDATE user_link_codes SET status = 'revoked' WHERE id = $1",
    [id]
  );
  await logAudit(sql, claims.sub, "link_code_revoke", "user_link_codes", id);
  return c.json({ ok: true });
});

app.post("/public/access-code/submit", async (c) => {
  const sql = getSql(c.env);
  const body = (await c.req.json().catch(() => null)) as
    | {
        code?: string;
        resident?: Record<string, unknown>;
        profile?: Record<string, unknown>;
        point?: Record<string, unknown>;
      }
    | null;
  if (!body?.code) {
    return jsonError(c, 400, "code is required");
  }
  const codeValue = body.code.trim().toUpperCase();
  const codeRows = await sql(
    `
    SELECT id, created_by, status, used_at
    FROM access_codes
    WHERE code = $1
    `,
    [codeValue]
  );
  if (codeRows.length === 0) {
    return jsonError(c, 404, "Codigo invalido", "NOT_FOUND");
  }
  const accessCode = codeRows[0] as {
    id: string;
    created_by: string;
    status: "active" | "used" | "revoked";
    used_at?: string | null;
  };
  if (accessCode.status !== "active" || accessCode.used_at) {
    return jsonError(c, 409, "Codigo ja utilizado", "CONFLICT");
  }

  const resident = body.resident ?? {};
  const profile = body.profile ?? {};
  const point = body.point ?? {};
  const fullName =
    typeof resident.full_name === "string" ? resident.full_name.trim() : "";
  if (!fullName) {
    return jsonError(c, 400, "full_name is required");
  }
  const status =
    typeof point.status === "string" ? point.status : "active";
  const precision =
    typeof point.precision === "string" ? point.precision : null;
  if (!precision) {
    return jsonError(c, 400, "precision is required");
  }
  let lat =
    typeof point.lat === "number"
      ? point.lat
      : typeof point.lat === "string"
        ? Number(point.lat)
        : undefined;
  let lng =
    typeof point.lng === "number"
      ? point.lng
      : typeof point.lng === "string"
        ? Number(point.lng)
        : undefined;
  const locationText =
    typeof point.location_text === "string" ? point.location_text : null;
  if ((lat === undefined || lng === undefined) && locationText) {
    const parsed = extractLatLng(locationText);
    if (parsed) {
      lat = parsed.lat;
      lng = parsed.lng;
    }
  }
  if (lat === undefined || lng === undefined) {
    return jsonError(c, 400, "lat and lng are required");
  }

  const scores = {
    health_score: Number(profile.health_score),
    education_score: Number(profile.education_score),
    income_score: Number(profile.income_score),
    housing_score: Number(profile.housing_score),
    security_score: Number(profile.security_score),
  };
  const scoreValues = Object.values(scores);
  if (scoreValues.some((value) => !Number.isFinite(value))) {
    return jsonError(c, 400, "scores 1-10 are required");
  }
  const scoreOverrides = {
    health_score: scores.health_score,
    education_score: scores.education_score,
    income_score: scores.income_score,
    housing_score: scores.housing_score,
    security_score: scores.security_score,
  };
  const profileFields = [
    "health_score",
    "health_has_clinic",
    "health_has_emergency",
    "health_has_community_agent",
    "health_unit_distance_km",
    "health_travel_time",
    "health_has_regular_service",
    "health_has_ambulance",
    "health_difficulties",
    "health_notes",
    "education_score",
    "education_level",
    "education_has_school",
    "education_has_transport",
    "education_material_support",
    "education_has_internet",
    "education_notes",
    "income_score",
    "income_monthly",
    "income_source",
    "income_contributors",
    "income_occupation_type",
    "income_has_social_program",
    "income_social_program",
    "assets_has_car",
    "assets_has_fridge",
    "assets_has_furniture",
    "assets_has_land",
    "housing_score",
    "housing_rooms",
    "housing_area_m2",
    "housing_land_m2",
    "housing_type",
    "housing_material",
    "housing_has_bathroom",
    "housing_has_water_treated",
    "housing_condition",
    "housing_risks",
    "security_score",
    "security_has_police_station",
    "security_has_patrol",
    "security_has_guard",
    "security_occurrences",
    "security_notes",
    "race_identity",
    "territory_narrative",
    "territory_memories",
    "territory_conflicts",
    "territory_culture",
    "energy_access",
    "water_supply",
    "water_treatment",
    "sewage_type",
    "garbage_collection",
    "internet_access",
    "transport_access",
    "participation_types",
    "participation_events",
    "participation_engagement",
    "demand_priorities",
    "photo_types",
    "vulnerability_level",
    "technical_issues",
    "referrals",
    "agencies_contacted",
    "consent_accepted",
  ];
  const profileValues = profileFields.map((field) => {
    if (field in scoreOverrides) {
      return scoreOverrides[field as keyof typeof scoreOverrides];
    }
    return (profile as Record<string, unknown>)[field] ?? null;
  });
  const profilePlaceholders = profileFields.map((_, idx) => `$${idx + 2}`);

  const actorId = accessCode.created_by;
  const publicCoords =
    precision === "approx"
      ? jitterPoint(lat, lng, Number(point.accuracy_m) || 0)
      : { lat, lng };

  await sql("BEGIN");
  try {
    const pointRows = await sql(
      `
      INSERT INTO map_points (
        lat, lng, public_lat, public_lng, accuracy_m, precision, status, category, public_note,
        area_type, reference_point, city, state, community_name, source_location, geog, created_by,
        approval_status, access_code_id, submitted_via_code
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
        $16, 'pending', $17, true
      )
      RETURNING id
      `,
      [
        lat,
        lng,
        publicCoords.lat,
        publicCoords.lng,
        typeof point.accuracy_m === "number" ? point.accuracy_m : null,
        precision,
        status,
        typeof point.category === "string" ? point.category : null,
        typeof point.public_note === "string" ? point.public_note : null,
        typeof point.area_type === "string" ? point.area_type : null,
        typeof point.reference_point === "string" ? point.reference_point : null,
        typeof point.city === "string" ? point.city : null,
        typeof point.state === "string" ? point.state : null,
        typeof point.community_name === "string" ? point.community_name : null,
        locationText,
        actorId,
        accessCode.id,
      ]
    );

    const residentRows = await sql(
      `
      INSERT INTO residents (
        full_name,
        doc_id,
        birth_date,
        sex,
        phone,
        email,
        address,
        city,
        state,
        neighborhood,
        community_name,
        household_size,
        children_count,
        elderly_count,
        pcd_count,
        notes,
        status,
        created_by,
        approval_status,
        access_code_id,
        submitted_via_code
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
        $16, $17, $18, 'pending', $19, true
      )
      RETURNING id
      `,
      [
        fullName,
        typeof resident.doc_id === "string" ? resident.doc_id : null,
        typeof resident.birth_date === "string" ? resident.birth_date : null,
        typeof resident.sex === "string" ? resident.sex : null,
        typeof resident.phone === "string" ? resident.phone : null,
        typeof resident.email === "string" ? resident.email : null,
        typeof resident.address === "string" ? resident.address : null,
        typeof resident.city === "string" ? resident.city : null,
        typeof resident.state === "string" ? resident.state : null,
        typeof resident.neighborhood === "string" ? resident.neighborhood : null,
        typeof resident.community_name === "string" ? resident.community_name : null,
        typeof resident.household_size === "number"
          ? resident.household_size
          : null,
        typeof resident.children_count === "number"
          ? resident.children_count
          : null,
        typeof resident.elderly_count === "number"
          ? resident.elderly_count
          : null,
        typeof resident.pcd_count === "number" ? resident.pcd_count : null,
        typeof resident.notes === "string" ? resident.notes : null,
        typeof resident.status === "string" ? resident.status : "active",
        actorId,
        accessCode.id,
      ]
    );

    const residentId = residentRows[0].id as string;
    const pointId = pointRows[0].id as string;

    await sql(
      `
      INSERT INTO resident_profiles (resident_id, ${profileFields.join(", ")})
      VALUES ($1, ${profilePlaceholders.join(", ")})
      `,
      [residentId, ...profileValues]
    );

    await sql(
      `
      INSERT INTO resident_point_assignments (resident_id, point_id, active)
      VALUES ($1, $2, true)
      `,
      [residentId, pointId]
    );

    await sql(
      `
      UPDATE access_codes
      SET status = 'used', used_at = now()
      WHERE id = $1
      `,
      [accessCode.id]
    );

    await sql("COMMIT");
    await logAudit(sql, actorId, "access_code_submission", "residents", residentId, {
      point_id: pointId,
    });
    return c.json({
      ok: true,
      resident_id: residentId,
      point_id: pointId,
      status: "pending",
    });
  } catch (error) {
    await sql("ROLLBACK");
    throw error;
  }
});

app.get("/user/pending-submissions", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const rows = await sql(
    `
    SELECT
      r.id,
      r.full_name,
      r.doc_id,
      r.birth_date,
      r.sex,
      r.phone,
      r.email,
      r.address,
      r.city,
      r.state,
      r.neighborhood,
      r.community_name,
      r.household_size,
      r.children_count,
      r.elderly_count,
      r.pcd_count,
      r.notes,
      r.status,
      r.created_at,
      mp.id AS point_id,
      mp.public_lat,
      mp.public_lng,
      mp.precision,
      mp.category,
      mp.public_note,
      mp.area_type,
      mp.reference_point,
      mp.location_text,
      rp.health_score,
      rp.health_has_clinic,
      rp.health_has_emergency,
      rp.health_has_community_agent,
      rp.health_unit_distance_km,
      rp.health_travel_time,
      rp.health_has_regular_service,
      rp.health_has_ambulance,
      rp.health_difficulties,
      rp.health_notes,
      rp.education_score,
      rp.education_level,
      rp.education_has_school,
      rp.education_has_transport,
      rp.education_material_support,
      rp.education_has_internet,
      rp.education_notes,
      rp.income_score,
      rp.income_monthly,
      rp.income_source,
      rp.income_contributors,
      rp.income_occupation_type,
      rp.income_has_social_program,
      rp.income_social_program,
      rp.assets_has_car,
      rp.assets_has_fridge,
      rp.assets_has_furniture,
      rp.assets_has_land,
      rp.housing_score,
      rp.housing_rooms,
      rp.housing_area_m2,
      rp.housing_land_m2,
      rp.housing_type,
      rp.housing_material,
      rp.housing_has_bathroom,
      rp.housing_has_water_treated,
      rp.housing_condition,
      rp.housing_risks,
      rp.security_score,
      rp.security_has_police_station,
      rp.security_has_patrol,
      rp.security_has_guard,
      rp.security_occurrences,
      rp.security_notes,
      rp.race_identity,
      rp.territory_narrative,
      rp.territory_memories,
      rp.territory_conflicts,
      rp.territory_culture,
      rp.energy_access,
      rp.water_supply,
      rp.water_treatment,
      rp.sewage_type,
      rp.garbage_collection,
      rp.internet_access,
      rp.transport_access,
      rp.participation_types,
      rp.participation_events,
      rp.participation_engagement,
      rp.demand_priorities,
      rp.photo_types,
      rp.vulnerability_level,
      rp.technical_issues,
      rp.referrals,
      rp.agencies_contacted,
      rp.consent_accepted
    FROM residents r
    LEFT JOIN resident_point_assignments rpa
      ON rpa.resident_id = r.id AND rpa.active = true
    LEFT JOIN map_points mp ON mp.id = rpa.point_id
    LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
    WHERE r.created_by = $1
      AND r.approval_status = 'pending'
      AND r.deleted_at IS NULL
    ORDER BY r.created_at DESC
    LIMIT 200
    `,
    [claims.sub]
  );
  return c.json({ items: rows });
});

app.post("/user/pending-submissions/:id/approve", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const residentId = c.req.param("id");
  const rows = await sql(
    `
    SELECT id
    FROM residents
    WHERE id = $1 AND created_by = $2 AND approval_status = 'pending'
    `,
    [residentId, claims.sub]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Cadastro pendente nao encontrado", "NOT_FOUND");
  }
  await sql(
    `
    UPDATE residents
    SET approval_status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
    WHERE id = $1
    `,
    [residentId, claims.sub]
  );
  await sql(
    `
    UPDATE map_points
    SET approval_status = 'approved', approved_by = $2, approved_at = now(), updated_at = now()
    WHERE id IN (
      SELECT point_id
      FROM resident_point_assignments
      WHERE resident_id = $1 AND active = true
    )
    `,
    [residentId, claims.sub]
  );
  await logAudit(sql, claims.sub, "access_code_approve", "residents", residentId);
  return c.json({ ok: true });
});

app.post("/user/pending-submissions/:id/reject", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const residentId = c.req.param("id");
  const rows = await sql(
    `
    SELECT id
    FROM residents
    WHERE id = $1 AND created_by = $2 AND approval_status = 'pending'
    `,
    [residentId, claims.sub]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Cadastro pendente nao encontrado", "NOT_FOUND");
  }
  await sql(
    `
    UPDATE residents
    SET approval_status = 'rejected', approved_by = $2, approved_at = now(), updated_at = now()
    WHERE id = $1
    `,
    [residentId, claims.sub]
  );
  await sql(
    `
    UPDATE map_points
    SET approval_status = 'rejected', approved_by = $2, approved_at = now(), updated_at = now()
    WHERE id IN (
      SELECT point_id
      FROM resident_point_assignments
      WHERE resident_id = $1 AND active = true
    )
    `,
    [residentId, claims.sub]
  );
  await logAudit(sql, claims.sub, "access_code_reject", "residents", residentId);
  return c.json({ ok: true });
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
      SELECT name,
             activity,
             focus_social,
             notes,
             families_count,
             organization_type,
             leader_name,
             leader_contact,
             activities,
             meeting_frequency,
             city,
             state
      FROM communities
    ),
    inferred AS (
      SELECT DISTINCT
        community_name as name,
        NULL::text as activity,
        NULL::text as focus_social,
        NULL::text as notes,
        NULL::int as families_count,
        NULL::text as organization_type,
        NULL::text as leader_name,
        NULL::text as leader_contact,
        NULL::text as activities,
        NULL::text as meeting_frequency,
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
    SELECT name,
           activity,
           focus_social,
           notes,
           families_count,
           organization_type,
           leader_name,
           leader_contact,
           activities,
           meeting_frequency,
           city,
           state
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
  const familiesCount =
    typeof body.families_count === "number" ? body.families_count : null;
  const organizationType =
    typeof body.organization_type === "string"
      ? body.organization_type.trim()
      : null;
  const leaderName =
    typeof body.leader_name === "string" ? body.leader_name.trim() : null;
  const leaderContact =
    typeof body.leader_contact === "string"
      ? body.leader_contact.trim()
      : null;
  const activities =
    typeof body.activities === "string" ? body.activities.trim() : null;
  const meetingFrequency =
    typeof body.meeting_frequency === "string"
      ? body.meeting_frequency.trim()
      : null;
  const city = typeof body.city === "string" ? body.city.trim() : null;
  const state = typeof body.state === "string" ? body.state.trim() : null;

  const rows = await sql(
    `
    INSERT INTO communities (
      name,
      activity,
      focus_social,
      notes,
      families_count,
      organization_type,
      leader_name,
      leader_contact,
      activities,
      meeting_frequency,
      city,
      state,
      created_by
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT (name) DO UPDATE SET
      activity = COALESCE(EXCLUDED.activity, communities.activity),
      focus_social = COALESCE(EXCLUDED.focus_social, communities.focus_social),
      notes = COALESCE(EXCLUDED.notes, communities.notes),
      families_count = COALESCE(EXCLUDED.families_count, communities.families_count),
      organization_type = COALESCE(EXCLUDED.organization_type, communities.organization_type),
      leader_name = COALESCE(EXCLUDED.leader_name, communities.leader_name),
      leader_contact = COALESCE(EXCLUDED.leader_contact, communities.leader_contact),
      activities = COALESCE(EXCLUDED.activities, communities.activities),
      meeting_frequency = COALESCE(EXCLUDED.meeting_frequency, communities.meeting_frequency),
      city = COALESCE(EXCLUDED.city, communities.city),
      state = COALESCE(EXCLUDED.state, communities.state),
      updated_at = now()
    RETURNING id, name, activity, focus_social, notes, families_count,
              organization_type, leader_name, leader_contact, activities,
              meeting_frequency, city, state
    `,
    [
      name,
      activity,
      focusSocial,
      notes,
      familiesCount,
      organizationType,
      leaderName,
      leaderContact,
      activities,
      meetingFrequency,
      city,
      state,
      claims.sub,
    ]
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
  const includeIndicators = Boolean(body?.include?.indicators);
  let indicatorSummary: {
    total_residents: number;
    health_avg: number | null;
    education_avg: number | null;
    income_avg: number | null;
    housing_avg: number | null;
    security_avg: number | null;
  } | null = null;
  let scoreBuckets: Record<string, number[]> | null = null;

  if (includeIndicators) {
    const summaryRows = await sql(
      `
      WITH filtered_points AS (
        SELECT point_id
        FROM public_map_cache
        WHERE ${where}
      ),
      area_residents AS (
        SELECT rp.health_score, rp.education_score, rp.income_score, rp.housing_score, rp.security_score
        FROM resident_point_assignments rpa
        JOIN filtered_points fp ON fp.point_id = rpa.point_id
        JOIN residents r ON r.id = rpa.resident_id AND r.deleted_at IS NULL
        LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
        WHERE rpa.active = true
      )
      SELECT
        COUNT(*)::int AS total_residents,
        AVG(health_score)::numeric(10,2) AS health_avg,
        AVG(education_score)::numeric(10,2) AS education_avg,
        AVG(income_score)::numeric(10,2) AS income_avg,
        AVG(housing_score)::numeric(10,2) AS housing_avg,
        AVG(security_score)::numeric(10,2) AS security_avg
      FROM area_residents
      `,
      params
    );
    indicatorSummary = summaryRows[0] ?? null;

    const scoreRows = await sql(
      `
      WITH filtered_points AS (
        SELECT point_id
        FROM public_map_cache
        WHERE ${where}
      ),
      area_residents AS (
        SELECT rp.health_score, rp.education_score, rp.income_score, rp.housing_score, rp.security_score
        FROM resident_point_assignments rpa
        JOIN filtered_points fp ON fp.point_id = rpa.point_id
        JOIN residents r ON r.id = rpa.resident_id AND r.deleted_at IS NULL
        LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
        WHERE rpa.active = true
      )
      SELECT 'health' AS metric, health_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE health_score IS NOT NULL
      GROUP BY health_score
      UNION ALL
      SELECT 'education' AS metric, education_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE education_score IS NOT NULL
      GROUP BY education_score
      UNION ALL
      SELECT 'income' AS metric, income_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE income_score IS NOT NULL
      GROUP BY income_score
      UNION ALL
      SELECT 'housing' AS metric, housing_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE housing_score IS NOT NULL
      GROUP BY housing_score
      UNION ALL
      SELECT 'security' AS metric, security_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE security_score IS NOT NULL
      GROUP BY security_score
      ORDER BY metric, score
      `,
      params
    );

    scoreBuckets = {
      health: Array.from({ length: 10 }, () => 0),
      education: Array.from({ length: 10 }, () => 0),
      income: Array.from({ length: 10 }, () => 0),
      housing: Array.from({ length: 10 }, () => 0),
      security: Array.from({ length: 10 }, () => 0),
    };
    for (const row of scoreRows as Array<{ metric: string; score: number; count: number }>) {
      const score = Number(row.score);
      if (!Number.isFinite(score) || score < 1 || score > 10) continue;
      if (!scoreBuckets[row.metric]) continue;
      scoreBuckets[row.metric][score - 1] = Number(row.count ?? 0);
    }
  }
  return c.json({
    report_id: `rep_${crypto.randomUUID()}`,
    summary: summaryRows[0] ?? null,
    breakdown: {
      status: statusRows,
      precision: precisionRows,
      by_city: cityRows,
      by_state: stateRows,
    },
    indicators: indicatorSummary,
    indicator_scores: scoreBuckets,
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
  const includeIndicators = Boolean(body?.include?.indicators);
  const includePoints = Boolean(body?.include?.points);
  let indicatorSummary: {
    total_residents: number;
    health_avg: number | null;
    education_avg: number | null;
    income_avg: number | null;
    housing_avg: number | null;
    security_avg: number | null;
  } | null = null;
  let scoreBuckets: Record<string, number[]> | null = null;

  if (includeIndicators) {
    const summaryRows = await sql(
      `
      WITH filtered_points AS (
        SELECT point_id
        FROM public_map_cache
        WHERE ${where}
      ),
      area_residents AS (
        SELECT rp.health_score, rp.education_score, rp.income_score, rp.housing_score, rp.security_score
        FROM resident_point_assignments rpa
        JOIN filtered_points fp ON fp.point_id = rpa.point_id
        JOIN residents r ON r.id = rpa.resident_id AND r.deleted_at IS NULL
        LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
        WHERE rpa.active = true
      )
      SELECT
        COUNT(*)::int AS total_residents,
        AVG(health_score)::numeric(10,2) AS health_avg,
        AVG(education_score)::numeric(10,2) AS education_avg,
        AVG(income_score)::numeric(10,2) AS income_avg,
        AVG(housing_score)::numeric(10,2) AS housing_avg,
        AVG(security_score)::numeric(10,2) AS security_avg
      FROM area_residents
      `,
      params
    );
    indicatorSummary = summaryRows[0] ?? null;

    const scoreRows = await sql(
      `
      WITH filtered_points AS (
        SELECT point_id
        FROM public_map_cache
        WHERE ${where}
      ),
      area_residents AS (
        SELECT rp.health_score, rp.education_score, rp.income_score, rp.housing_score, rp.security_score
        FROM resident_point_assignments rpa
        JOIN filtered_points fp ON fp.point_id = rpa.point_id
        JOIN residents r ON r.id = rpa.resident_id AND r.deleted_at IS NULL
        LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
        WHERE rpa.active = true
      )
      SELECT 'health' AS metric, health_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE health_score IS NOT NULL
      GROUP BY health_score
      UNION ALL
      SELECT 'education' AS metric, education_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE education_score IS NOT NULL
      GROUP BY education_score
      UNION ALL
      SELECT 'income' AS metric, income_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE income_score IS NOT NULL
      GROUP BY income_score
      UNION ALL
      SELECT 'housing' AS metric, housing_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE housing_score IS NOT NULL
      GROUP BY housing_score
      UNION ALL
      SELECT 'security' AS metric, security_score AS score, COUNT(*)::int AS count
      FROM area_residents
      WHERE security_score IS NOT NULL
      GROUP BY security_score
      ORDER BY metric, score
      `,
      params
    );

    scoreBuckets = {
      health: Array.from({ length: 10 }, () => 0),
      education: Array.from({ length: 10 }, () => 0),
      income: Array.from({ length: 10 }, () => 0),
      housing: Array.from({ length: 10 }, () => 0),
      security: Array.from({ length: 10 }, () => 0),
    };
    for (const row of scoreRows as Array<{ metric: string; score: number; count: number }>) {
      const score = Number(row.score);
      if (!Number.isFinite(score) || score < 1 || score > 10) continue;
      if (!scoreBuckets[row.metric]) continue;
      scoreBuckets[row.metric][score - 1] = Number(row.count ?? 0);
    }
  }

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

  try {
    const pdf = await PDFDocument.create();
    let page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let { width, height } = page.getSize();
    const title = "Relatorio publico";
    const cityCounts = rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.city ?? "Sem cidade");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const stateCounts = rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.state ?? "Sem estado");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const statusCounts = rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.status ?? "Sem status");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const precisionCounts = rows.reduce<Record<string, number>>((acc, row) => {
      const key = String(row.precision ?? "Sem precisao");
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
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
  page.drawText(
    `Cidades: ${Object.keys(cityCounts).length} | Estados: ${Object.keys(stateCounts).length}`,
    {
      x: 50,
      y: height - 120,
      size: 11,
      font,
      color: rgb(0.1, 0.1, 0.1),
    }
  );
  const boundaryText = boundaryGeojson
    ? `Malha (GeoJSON): ${boundaryGeojson.slice(0, 160)}${
        boundaryGeojson.length > 160 ? "..." : ""
      }`
    : "Malha (GeoJSON): nao disponivel";
  page.drawText(boundaryText, {
    x: 50,
    y: height - 140,
    size: 9,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });

    const drawBarBlock = (
      targetPage: typeof page,
      titleText: string,
      entries: Array<{ label: string; value: number }>,
      originY: number
    ) => {
      if (!entries.length) {
        targetPage.drawText(`${titleText}: sem dados`, {
          x: 50,
          y: originY + 6,
          size: 9,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
        return;
      }
      const chartWidth = width - 100;
      const chartHeight = 60;
      const maxValue = Math.max(...entries.map((entry) => entry.value), 1);
      targetPage.drawText(titleText, {
        x: 50,
        y: originY + chartHeight + 10,
        size: 11,
        font,
        color: rgb(0.12, 0.12, 0.12),
      });
      entries.forEach((entry, index) => {
        const barWidth = (chartWidth / entries.length) * 0.7;
        const barGap = (chartWidth / entries.length) * 0.3;
        const barHeight = (entry.value / maxValue) * chartHeight;
        const barX = 50 + index * (barWidth + barGap);
        targetPage.drawRectangle({
          x: barX,
          y: originY,
          width: barWidth,
          height: barHeight,
          color: rgb(0.2, 0.36, 0.72),
          opacity: 0.85,
        });
        targetPage.drawText(entry.label, {
          x: barX,
          y: originY - 12,
          size: 8,
          font,
          color: rgb(0.25, 0.25, 0.25),
        });
        targetPage.drawText(String(entry.value), {
          x: barX,
          y: originY + barHeight + 2,
          size: 8,
          font,
          color: rgb(0.25, 0.25, 0.25),
        });
      });
    };

    const breakdownPage = pdf.addPage();
    ({ width, height } = breakdownPage.getSize());
    breakdownPage.drawText("Resumo por cidade e estado", {
      x: 50,
      y: height - 60,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });

    const cityRowsSorted = Object.entries(cityCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);
    const stateRowsSorted = Object.entries(stateCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12);

    let cursorY = height - 90;
    breakdownPage.drawText("Top cidades", {
      x: 50,
      y: cursorY,
      size: 11,
      font,
      color: rgb(0.12, 0.12, 0.12),
    });
    cursorY -= 14;
    cityRowsSorted.forEach(([city, count]) => {
      breakdownPage.drawText(`${city} - ${count}`, {
        x: 50,
        y: cursorY,
        size: 9,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      cursorY -= 12;
    });

    cursorY -= 10;
    breakdownPage.drawText("Top estados", {
      x: 50,
      y: cursorY,
      size: 11,
      font,
      color: rgb(0.12, 0.12, 0.12),
    });
    cursorY -= 14;
    stateRowsSorted.forEach(([state, count]) => {
      breakdownPage.drawText(`${state} - ${count}`, {
        x: 50,
        y: cursorY,
        size: 9,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
      cursorY -= 12;
    });

    const statusEntries = Object.entries(statusCounts).map(
      ([label, value]) => ({
        label,
        value,
      })
    );
    const precisionEntries = Object.entries(precisionCounts).map(
      ([label, value]) => ({ label, value })
    );
    drawBarBlock(breakdownPage, "Status dos pontos", statusEntries, 140);
    drawBarBlock(
      breakdownPage,
      "Precisao dos pontos",
      precisionEntries,
      40
    );

  if (includePoints) {
    const pointsTitleY = height - 150;
    page.drawText("Pontos (amostra)", {
      x: 50,
      y: pointsTitleY,
      size: 12,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    let lineY = pointsTitleY - 16;
    const maxLines = 10;
    rows.slice(0, maxLines).forEach((row, index) => {
      if (lineY < 80) return;
      const label = `${index + 1}. ${row.community_name ?? "-"} | ${row.city ?? "-"} / ${
        row.state ?? "-"
      } | residentes: ${row.residents ?? 0}`;
      page.drawText(label, {
        x: 50,
        y: lineY,
        size: 9,
        font,
        color: rgb(0.15, 0.15, 0.15),
      });
      lineY -= 12;
    });
  }

  if (includeIndicators && indicatorSummary && scoreBuckets) {
    const indicatorPage = pdf.addPage();
    const { width: chartWidth, height: chartHeight } = indicatorPage.getSize();
    indicatorPage.drawText("Indicadores sociais (pontuacao 1-10)", {
      x: 50,
      y: chartHeight - 60,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    indicatorPage.drawText(
      `Total de pessoas avaliadas: ${indicatorSummary.total_residents ?? 0}`,
      {
        x: 50,
        y: chartHeight - 82,
        size: 10,
        font,
        color: rgb(0.1, 0.1, 0.1),
      }
    );

    const metrics = [
      { key: "health", label: "Saude", color: rgb(0.18, 0.55, 0.35), avg: indicatorSummary.health_avg },
      { key: "education", label: "Educacao", color: rgb(0.2, 0.36, 0.72), avg: indicatorSummary.education_avg },
      { key: "income", label: "Renda", color: rgb(0.85, 0.5, 0.18), avg: indicatorSummary.income_avg },
      { key: "housing", label: "Moradia", color: rgb(0.6, 0.4, 0.2), avg: indicatorSummary.housing_avg },
      { key: "security", label: "Seguranca", color: rgb(0.75, 0.2, 0.2), avg: indicatorSummary.security_avg },
    ];

    const chartAreaWidth = chartWidth - 100;
    const chartAreaHeight = 70;
    let chartY = chartHeight - 140;
    const gap = 16;

    const drawBarChart = (
      label: string,
      counts: number[],
      color: ReturnType<typeof rgb>,
      avg: number | null
    ) => {
      const maxCount = Math.max(...counts, 1);
      const barGap = 4;
      const barWidth = (chartAreaWidth - barGap * 9) / 10;
      indicatorPage.drawText(
        `${label} (media: ${avg ?? "-"} )`,
        {
          x: 50,
          y: chartY + chartAreaHeight + 8,
          size: 10,
          font,
          color: rgb(0.1, 0.1, 0.1),
        }
      );
      counts.forEach((count, index) => {
        const barHeight = (count / maxCount) * (chartAreaHeight - 12);
        const barX = 50 + index * (barWidth + barGap);
        indicatorPage.drawRectangle({
          x: barX,
          y: chartY,
          width: barWidth,
          height: barHeight,
          color,
          opacity: 0.85,
        });
        indicatorPage.drawText(String(index + 1), {
          x: barX + 2,
          y: chartY - 10,
          size: 7,
          font,
          color: rgb(0.3, 0.3, 0.3),
        });
      });
      chartY -= chartAreaHeight + gap;
    };

    metrics.forEach((metric) => {
      const counts = scoreBuckets[metric.key] ?? Array.from({ length: 10 }, () => 0);
      if (chartY < 140) return;
      drawBarChart(metric.label, counts, metric.color, metric.avg);
    });

    const pieData = metrics
      .map((metric) => ({
        label: metric.label,
        value: Number(metric.avg ?? 0),
        color: metric.color,
      }))
      .filter((item) => item.value > 0);
    const pieTotal = pieData.reduce((sum, item) => sum + item.value, 0);
    if (pieTotal > 0) {
      const centerX = chartWidth / 2;
      const centerY = 90;
      const radius = 60;
      let startAngle = 0;
      const polar = (angle: number) => ({
        x: centerX + radius * Math.cos(angle),
        y: centerY + radius * Math.sin(angle),
      });
      pieData.forEach((item) => {
        const sliceAngle = (item.value / pieTotal) * Math.PI * 2;
        const endAngle = startAngle + sliceAngle;
        const start = polar(startAngle);
        const end = polar(endAngle);
        const largeArc = sliceAngle > Math.PI ? 1 : 0;
        const path = `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
        indicatorPage.drawSvgPath(path, {
          color: item.color,
          opacity: 0.85,
        });
        startAngle = endAngle;
      });
      let legendX = 50;
      let legendY = 30;
      pieData.forEach((item) => {
        indicatorPage.drawRectangle({
          x: legendX,
          y: legendY,
          width: 10,
          height: 10,
          color: item.color,
        });
        indicatorPage.drawText(item.label, {
          x: legendX + 14,
          y: legendY + 2,
          size: 8,
          font,
          color: rgb(0.2, 0.2, 0.2),
        });
        legendX += 90;
      });
      indicatorPage.drawText("Distribuicao media por indicador", {
        x: 50,
        y: 120,
        size: 9,
        font,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  }

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
  const base64 = base64Encode(bytes);
  return c.json({
    content_base64: base64,
    content_type: "application/pdf",
    filename: `relatorio-${Date.now()}.pdf`,
  });
} catch (error) {
  console.error("reports_export_pdf_failed", error);
  const fallback = await PDFDocument.create();
  const page = fallback.addPage();
  const font = await fallback.embedFont(StandardFonts.Helvetica);
  const { height } = page.getSize();
  page.drawText("Relatorio publico (fallback)", {
    x: 50,
    y: height - 70,
    size: 16,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(`Total de pontos: ${rows.length}`, {
    x: 50,
    y: height - 95,
    size: 11,
    font,
    color: rgb(0.1, 0.1, 0.1),
  });
  const bytes = await fallback.save();
  const base64 = base64Encode(bytes);
  return c.json({
    content_base64: base64,
    content_type: "application/pdf",
    filename: `relatorio-${Date.now()}.pdf`,
  });
}
});

app.get("/reports/user-summary", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const requestedUser =
    requireSupervisor(claims)
      ? c.req.query("user_id")
      : null;
  const formatRaw = c.req.query("format") ?? "";
  const format = formatRaw.toUpperCase();
  if (!isAdmin(claims) && requestedUser) {
    const allowed = await sql(
      "SELECT 1 FROM app_users WHERE id = $1 AND approved_by = $2",
      [requestedUser, claims.sub]
    );
    if (allowed.length === 0) {
      return jsonError(c, 403, "Forbidden", "FORBIDDEN");
    }
  }
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
    SELECT
      r.id,
      r.full_name,
      r.doc_id,
      r.birth_date,
      r.sex,
      r.phone,
      r.email,
      r.address,
      r.city,
      r.state,
      r.neighborhood,
      r.community_name,
      r.household_size,
      r.children_count,
      r.elderly_count,
      r.pcd_count,
      r.status,
      r.created_at,
      rp.health_score,
      rp.education_score,
      rp.income_score,
      rp.housing_score,
      rp.security_score,
      rp.energy_access,
      rp.water_supply,
      rp.water_treatment,
      rp.sewage_type,
      rp.garbage_collection,
      rp.internet_access,
      rp.transport_access,
      rp.health_unit_distance_km,
      rp.health_travel_time,
      rp.health_has_regular_service,
      rp.health_has_clinic,
      rp.health_has_emergency,
      rp.health_has_community_agent,
      rp.health_has_ambulance,
      rp.health_difficulties,
      rp.education_level,
      rp.education_has_school,
      rp.education_has_transport,
      rp.education_material_support,
      rp.education_has_internet,
      rp.income_monthly,
      rp.income_contributors,
      rp.income_occupation_type,
      rp.income_has_social_program,
      rp.income_social_program,
      rp.housing_rooms,
      rp.housing_area_m2,
      rp.housing_land_m2,
      rp.housing_type,
      rp.housing_material,
      rp.housing_has_bathroom,
      rp.housing_has_water_treated,
      rp.housing_condition,
      rp.housing_risks,
      rp.security_has_police_station,
      rp.security_has_patrol,
      rp.security_has_guard,
      rp.security_occurrences,
      rp.participation_types,
      rp.participation_events,
      rp.participation_engagement,
      rp.demand_priorities,
      rp.photo_types,
      rp.vulnerability_level,
      rp.technical_issues,
      rp.referrals,
      rp.agencies_contacted,
      rp.consent_accepted,
      mp.area_type AS point_area_type,
      mp.reference_point AS point_reference_point,
      mp.precision AS point_precision
    FROM residents r
    LEFT JOIN resident_profiles rp ON rp.resident_id = r.id
    LEFT JOIN resident_point_assignments rpa
      ON rpa.resident_id = r.id AND rpa.active = true
    LEFT JOIN map_points mp ON mp.id = rpa.point_id
    WHERE r.created_by = $1 AND r.deleted_at IS NULL
    ORDER BY r.created_at DESC
    LIMIT 500
    `,
    [userId]
  );
  if (format === "PDF") {
    const summary = summaryRows[0] as { total_residents?: number };
    const averagesRow = averages[0] as Record<string, number | null>;
    const pdf = await PDFDocument.create();
    let page = pdf.addPage();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    let { width, height } = page.getSize();
    let cursorY = height - 60;
    const lineHeight = 16;

    const drawLine = (label: string, value: string) => {
      if (cursorY < 60) {
        page = pdf.addPage();
        ({ width, height } = page.getSize());
        cursorY = height - 60;
      }
      page.drawText(`${label}: ${value}`, {
        x: 50,
        y: cursorY,
        size: 11,
        font,
        color: rgb(0.12, 0.12, 0.12),
      });
      cursorY -= lineHeight;
    };

    page.drawText("Relatório do usuário", {
      x: 50,
      y: cursorY + 24,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });

    drawLine("Total de residentes", String(summary?.total_residents ?? 0));
    drawLine("Média saúde", String(averagesRow?.health_score ?? "-"));
    drawLine("Média educação", String(averagesRow?.education_score ?? "-"));
    drawLine("Média renda", String(averagesRow?.income_score ?? "-"));
    drawLine("Renda mensal média (R$)", String(averagesRow?.income_monthly ?? "-"));
    drawLine("Média moradia", String(averagesRow?.housing_score ?? "-"));
    drawLine("Média segurança", String(averagesRow?.security_score ?? "-"));

    cursorY -= 8;
    page.drawText("Últimos meses", {
      x: 50,
      y: cursorY,
      size: 12,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= lineHeight;
    monthly.slice(0, 8).forEach((row: { month: string; total: number }) => {
      drawLine(row.month, String(row.total));
    });

    cursorY -= 8;
    page.drawText("Amostra de residentes", {
      x: 50,
      y: cursorY,
      size: 12,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= lineHeight;
    residents
      .slice(0, 12)
      .forEach((row: { full_name?: string | null; community_name?: string | null }) => {
        drawLine(row.full_name ?? "-", row.community_name ?? "-");
      });

    const bytes = await pdf.save();
    const base64 = base64Encode(bytes);
    return c.json({
      content_base64: base64,
      content_type: "application/pdf",
      filename: `relatorio-usuario-${Date.now()}.pdf`,
    });
  }
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
  if (!requireSupervisor(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const isAdminUser = isAdmin(claims);
  const isManagerTeacher = isManagerOrTeacher(claims);
  const status = c.req.query("status");
  const role = c.req.query("role");
  const search = c.req.query("q");
  const filters: string[] = ["1=1"];
  const params: (string | number)[] = [];
  if (status) {
    params.push(status);
    filters.push(`u.status = $${params.length}`);
  }
  if (role) {
    params.push(role);
    filters.push(`u.role = $${params.length}`);
  }
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    filters.push(`LOWER(u.email) LIKE $${params.length}`);
  }
  if (!isAdminUser && isManagerTeacher) {
    params.push(claims.sub);
    const approverIndex = params.length;
    if (status === "pending") {
      filters.push(
        `(u.status = 'pending' AND (u.link_code_id IS NULL OR lc.created_by = $${approverIndex}))`
      );
    } else if (status && status !== "pending") {
      filters.push(`u.approved_by = $${approverIndex}`);
    } else {
      filters.push(
        `((u.status = 'pending' AND (u.link_code_id IS NULL OR lc.created_by = $${approverIndex})) OR (u.status <> 'pending' AND u.approved_by = $${approverIndex}))`
      );
    }
  }
  const rows = await sql(
    `
    SELECT
      u.id,
      u.email,
      u.role,
      u.status,
      u.full_name,
      u.phone,
      u.organization,
      u.city,
      u.state,
      u.territory,
      u.access_reason,
      u.created_at,
      u.last_login_at,
      u.link_code_id,
      lc.code AS link_code,
      lc.created_by AS link_code_created_by
    FROM app_users u
    LEFT JOIN user_link_codes lc ON lc.id = u.link_code_id
    WHERE ${filters.join(" AND ")}
    ORDER BY u.created_at DESC
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
  if (!requireSupervisor(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const isAdminUser = isAdmin(claims);
  const isManagerTeacher = isManagerOrTeacher(claims);
  const userId = c.req.param("id");
  const users = await sql(
    `
    SELECT
      u.id,
      u.email,
      u.role,
      u.status,
      u.full_name,
      u.phone,
      u.organization,
      u.city,
      u.state,
      u.territory,
      u.access_reason,
      u.created_at,
      u.last_login_at,
      u.approved_by,
      u.link_code_id,
      lc.code AS link_code,
      lc.created_by AS link_code_created_by
    FROM app_users u
    LEFT JOIN user_link_codes lc ON lc.id = u.link_code_id
    WHERE u.id = $1
    `,
    [userId]
  );
  if (users.length === 0) {
    return jsonError(c, 404, "User not found", "NOT_FOUND");
  }
  const userRecord = users[0] as {
    id: string;
    status: "active" | "pending" | "disabled";
    approved_by?: string | null;
    link_code_id?: string | null;
    link_code_created_by?: string | null;
  };
  if (!isAdminUser && isManagerTeacher) {
    if (userRecord.status === "pending") {
      if (
        userRecord.link_code_id &&
        userRecord.link_code_created_by !== claims.sub
      ) {
        return jsonError(c, 403, "Forbidden", "FORBIDDEN");
      }
    } else if (userRecord.approved_by !== claims.sub) {
      return jsonError(c, 403, "Forbidden", "FORBIDDEN");
    }
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
  const isAdminUser = isAdmin(claims);
  const isManagerTeacher = isManagerOrTeacher(claims);
  if (!isAdminUser && !isManagerTeacher) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const body = (await c.req.json().catch(() => null)) as
    | {
        email?: string;
        password?: string;
        role?: "admin" | "manager" | "registrar" | "teacher";
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
  const requestedRole = body.role ?? "registrar";
  if (
    requestedRole !== "admin" &&
    requestedRole !== "manager" &&
    requestedRole !== "registrar" &&
    requestedRole !== "teacher"
  ) {
    return jsonError(c, 400, "role is invalid");
  }
  const requestedStatus = isAdminUser
    ? body.status ?? "active"
    : "pending";
  if (!isAdminUser && requestedRole !== "registrar") {
    return jsonError(c, 403, "Apenas o ADM pode criar esse perfil", "FORBIDDEN");
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
      requestedRole,
      requestedStatus,
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
  if (requestedStatus === "active") {
    await sql(
      "UPDATE app_users SET approved_by = $2, approved_at = now() WHERE id = $1",
      [userId, claims.sub]
    );
  }
  await logAudit(sql, claims.sub, "admin_user_create", "app_users", userId, {
    email: body.email.toLowerCase(),
    role: requestedRole,
    status: requestedStatus,
  });
  return c.json({ user: rows[0] });
});

app.put("/admin/users/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  const isAdminUser = isAdmin(claims);
  const isManagerTeacher = isManagerOrTeacher(claims);
  if (!isAdminUser && !isManagerTeacher) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const body = (await c.req.json().catch(() => null)) as Record<string, unknown>;
  const allowed = isManagerTeacher && !isAdminUser
    ? ["status"]
    : [
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
  let updates = Object.entries(body ?? {}).filter(([key]) =>
    allowed.includes(key)
  );
  if (updates.length === 0) {
    return jsonError(c, 400, "No valid fields to update");
  }
  const id = c.req.param("id");
  if (isManagerTeacher && !isAdminUser) {
    const rows = await sql(
      `
      SELECT u.status, u.approved_by, u.link_code_id, lc.created_by AS link_code_created_by
      FROM app_users u
      LEFT JOIN user_link_codes lc ON lc.id = u.link_code_id
      WHERE u.id = $1
      `,
      [id]
    );
    if (rows.length === 0) {
      return jsonError(c, 404, "User not found", "NOT_FOUND");
    }
    const target = rows[0] as {
      status: string;
      approved_by?: string | null;
      link_code_id?: string | null;
      link_code_created_by?: string | null;
    };
    if (target.status === "pending") {
      if (target.link_code_id && target.link_code_created_by !== claims.sub) {
        return jsonError(c, 403, "Forbidden", "FORBIDDEN");
      }
    } else if (target.approved_by !== claims.sub) {
      return jsonError(c, 403, "Forbidden", "FORBIDDEN");
    }
  }
  const statusUpdate = updates.find(([key]) => key === "status");
  const extraSets: string[] = [];
  const extraValues: (string | number)[] = [];
  if (statusUpdate && String(statusUpdate[1]) === "active") {
    extraValues.push(claims.sub);
    extraSets.push(`approved_by = $${updates.length + extraValues.length + 1}`);
    extraSets.push("approved_at = now()");
  }
  const sets = updates
    .map(([key], index) => `${key} = $${index + 2}`)
    .concat(extraSets);
  const values = updates.map(([, value]) => value ?? null).concat(extraValues);
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
  const isAdminUser = isAdmin(claims);
  const isManagerTeacher = isManagerOrTeacher(claims);
  if (!isAdminUser && !isManagerTeacher) {
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
  if (isManagerTeacher && userId && userId !== claims.sub) {
    const allowed = await sql(
      "SELECT 1 FROM app_users WHERE id = $1 AND approved_by = $2",
      [userId, claims.sub]
    );
    if (allowed.length === 0) {
      return jsonError(c, 403, "Forbidden", "FORBIDDEN");
    }
  }

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
  if (isManagerTeacher && !userId) {
    residentParams.push(claims.sub);
    residentFilters.push(
      `r.created_by IN (
        SELECT id
        FROM app_users
        WHERE approved_by = $${residentParams.length} OR id = $${residentParams.length}
      )`
    );
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
  if (isManagerTeacher && !userId) {
    pointParams.push(claims.sub);
    pointFilters.push(
      `p.created_by IN (
        SELECT id
        FROM app_users
        WHERE approved_by = $${pointParams.length} OR id = $${pointParams.length}
      )`
    );
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
        birth_date?: string;
        sex?: string;
        phone?: string;
        email?: string;
        address?: string;
        city?: string;
        state?: string;
        neighborhood?: string;
        community_name?: string;
        household_size?: number;
        children_count?: number;
        elderly_count?: number;
        pcd_count?: number;
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
      full_name,
      doc_id,
      birth_date,
      sex,
      phone,
      email,
      address,
      city,
      state,
      neighborhood,
      community_name,
      household_size,
      children_count,
      elderly_count,
      pcd_count,
      notes,
      status,
      created_by
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      $16, $17, $18
    )
    RETURNING id
    `,
    [
      body.full_name,
      body.doc_id ?? null,
      body.birth_date ?? null,
      body.sex ?? null,
      body.phone ?? null,
      body.email ?? null,
      body.address ?? null,
      body.city ?? null,
      body.state ?? null,
      body.neighborhood ?? null,
      body.community_name ?? null,
      body.household_size ?? null,
      body.children_count ?? null,
      body.elderly_count ?? null,
      body.pcd_count ?? null,
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
      r.birth_date,
      r.sex,
      r.phone,
      r.email,
      r.address,
      r.city,
      r.state,
      r.neighborhood,
      r.community_name,
      r.household_size,
      r.children_count,
      r.elderly_count,
      r.pcd_count,
      r.status,
      r.notes,
      r.created_at,
      r.updated_at,
      rp.health_score,
      rp.health_has_clinic,
      rp.health_has_emergency,
      rp.health_has_community_agent,
      rp.health_unit_distance_km,
      rp.health_travel_time,
      rp.health_has_regular_service,
      rp.health_has_ambulance,
      rp.health_difficulties,
      rp.health_notes,
      rp.education_score,
      rp.education_level,
      rp.education_has_school,
      rp.education_has_transport,
      rp.education_material_support,
      rp.education_has_internet,
      rp.education_notes,
      rp.income_score,
      rp.income_monthly,
      rp.income_source,
      rp.income_contributors,
      rp.income_occupation_type,
      rp.income_has_social_program,
      rp.income_social_program,
      rp.assets_has_car,
      rp.assets_has_fridge,
      rp.assets_has_furniture,
      rp.assets_has_land,
      rp.housing_score,
      rp.housing_rooms,
      rp.housing_area_m2,
      rp.housing_land_m2,
      rp.housing_type,
      rp.housing_material,
      rp.housing_has_bathroom,
      rp.housing_has_water_treated,
      rp.housing_condition,
      rp.housing_risks,
      rp.security_score,
      rp.security_has_police_station,
      rp.security_has_patrol,
      rp.security_has_guard,
      rp.security_occurrences,
      rp.security_notes,
      rp.race_identity,
      rp.territory_narrative,
      rp.territory_memories,
      rp.territory_conflicts,
      rp.territory_culture,
      rp.energy_access,
      rp.water_supply,
      rp.water_treatment,
      rp.sewage_type,
      rp.garbage_collection,
      rp.internet_access,
      rp.transport_access,
      rp.participation_types,
      rp.participation_events,
      rp.participation_engagement,
      rp.demand_priorities,
      rp.photo_types,
      rp.vulnerability_level,
      rp.technical_issues,
      rp.referrals,
      rp.agencies_contacted,
      rp.consent_accepted,
      mp.id AS point_id,
      mp.status AS point_status,
      mp.precision AS point_precision,
      mp.category AS point_category,
      mp.public_note AS point_public_note,
      mp.area_type AS point_area_type,
      mp.reference_point AS point_reference_point,
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
      birth_date: row.birth_date,
      sex: row.sex,
      phone: row.phone,
      email: row.email,
      address: row.address,
      city: row.city,
      state: row.state,
      neighborhood: row.neighborhood,
      community_name: row.community_name,
      household_size: row.household_size,
      children_count: row.children_count,
      elderly_count: row.elderly_count,
      pcd_count: row.pcd_count,
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
      health_unit_distance_km: row.health_unit_distance_km,
      health_travel_time: row.health_travel_time,
      health_has_regular_service: row.health_has_regular_service,
      health_has_ambulance: row.health_has_ambulance,
      health_difficulties: row.health_difficulties,
      health_notes: row.health_notes,
      education_score: row.education_score,
      education_level: row.education_level,
      education_has_school: row.education_has_school,
      education_has_transport: row.education_has_transport,
      education_material_support: row.education_material_support,
      education_has_internet: row.education_has_internet,
      education_notes: row.education_notes,
      income_score: row.income_score,
      income_monthly: row.income_monthly,
      income_source: row.income_source,
      income_contributors: row.income_contributors,
      income_occupation_type: row.income_occupation_type,
      income_has_social_program: row.income_has_social_program,
      income_social_program: row.income_social_program,
      assets_has_car: row.assets_has_car,
      assets_has_fridge: row.assets_has_fridge,
      assets_has_furniture: row.assets_has_furniture,
      assets_has_land: row.assets_has_land,
      housing_score: row.housing_score,
      housing_rooms: row.housing_rooms,
      housing_area_m2: row.housing_area_m2,
      housing_land_m2: row.housing_land_m2,
      housing_type: row.housing_type,
      housing_material: row.housing_material,
      housing_has_bathroom: row.housing_has_bathroom,
      housing_has_water_treated: row.housing_has_water_treated,
      housing_condition: row.housing_condition,
      housing_risks: row.housing_risks,
      security_score: row.security_score,
      security_has_police_station: row.security_has_police_station,
      security_has_patrol: row.security_has_patrol,
      security_has_guard: row.security_has_guard,
      security_occurrences: row.security_occurrences,
      security_notes: row.security_notes,
      race_identity: row.race_identity,
      territory_narrative: row.territory_narrative,
      territory_memories: row.territory_memories,
      territory_conflicts: row.territory_conflicts,
      territory_culture: row.territory_culture,
      energy_access: row.energy_access,
      water_supply: row.water_supply,
      water_treatment: row.water_treatment,
      sewage_type: row.sewage_type,
      garbage_collection: row.garbage_collection,
      internet_access: row.internet_access,
      transport_access: row.transport_access,
      participation_types: row.participation_types,
      participation_events: row.participation_events,
      participation_engagement: row.participation_engagement,
      demand_priorities: row.demand_priorities,
      photo_types: row.photo_types,
      vulnerability_level: row.vulnerability_level,
      technical_issues: row.technical_issues,
      referrals: row.referrals,
      agencies_contacted: row.agencies_contacted,
      consent_accepted: row.consent_accepted,
    } : null,
    point: pointId
      ? {
          id: pointId,
          status: row.point_status,
          precision: row.point_precision,
          category: row.point_category,
          public_note: row.point_public_note,
          area_type: row.point_area_type,
          reference_point: row.point_reference_point,
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
    "birth_date",
    "sex",
    "phone",
    "email",
    "address",
    "city",
    "state",
    "neighborhood",
    "community_name",
    "household_size",
    "children_count",
    "elderly_count",
    "pcd_count",
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
    "health_unit_distance_km",
    "health_travel_time",
    "health_has_regular_service",
    "health_has_ambulance",
    "health_difficulties",
    "health_notes",
    "education_score",
    "education_level",
    "education_has_school",
    "education_has_transport",
    "education_material_support",
    "education_has_internet",
    "education_notes",
    "income_score",
    "income_monthly",
    "income_source",
    "income_contributors",
    "income_occupation_type",
    "income_has_social_program",
    "income_social_program",
    "assets_has_car",
    "assets_has_fridge",
    "assets_has_furniture",
    "assets_has_land",
    "housing_score",
    "housing_rooms",
    "housing_area_m2",
    "housing_land_m2",
    "housing_type",
    "housing_material",
    "housing_has_bathroom",
    "housing_has_water_treated",
    "housing_condition",
    "housing_risks",
    "security_score",
    "security_has_police_station",
    "security_has_patrol",
    "security_has_guard",
    "security_occurrences",
    "security_notes",
    "race_identity",
    "territory_narrative",
    "territory_memories",
    "territory_conflicts",
    "territory_culture",
    "energy_access",
    "water_supply",
    "water_treatment",
    "sewage_type",
    "garbage_collection",
    "internet_access",
    "transport_access",
    "participation_types",
    "participation_events",
    "participation_engagement",
    "demand_priorities",
    "photo_types",
    "vulnerability_level",
    "technical_issues",
    "referrals",
    "agencies_contacted",
    "consent_accepted",
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
        area_type?: string;
        reference_point?: string;
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
      area_type, reference_point, city, state, community_name, source_location, geog, created_by
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
      ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
      $16
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
      body.area_type ?? null,
      body.reference_point ?? null,
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
        area_type?: string;
        reference_point?: string;
        city?: string;
        state?: string;
        community_name?: string;
        location_text?: string;
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
  if (body.area_type !== undefined) fields.push(["area_type", body.area_type]);
  if (body.reference_point !== undefined)
    fields.push(["reference_point", body.reference_point]);
  if (body.city !== undefined) fields.push(["city", body.city]);
  if (body.state !== undefined) fields.push(["state", body.state]);
  if (body.community_name !== undefined)
    fields.push(["community_name", body.community_name]);
  if (body.location_text !== undefined)
    fields.push(["source_location", body.location_text]);
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
    INSERT INTO attachments (resident_id, point_id, s3_key, original_name, mime_type, size, visibility)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING id
    `,
    [
      residentId,
      pointId,
      key,
      file.name,
      file.type || "application/octet-stream",
      file.size,
      visibility,
    ]
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

app.get("/media/news", async (c) => {
  const sql = getSql(c.env);
  const rows = await sql(
    `
    SELECT id, original_name, created_at
    FROM attachments
    WHERE collection = 'news'
    ORDER BY created_at DESC
    `
  );
  const baseUrl = getPublicBaseUrl(c, c.env);
  const items = rows.map((row) => ({
    id: row.id as string,
    name: (row.original_name as string | null) ?? null,
    url: `${baseUrl}/attachments/${row.id}`,
    created_at: row.created_at,
  }));
  return c.json({ items });
});

app.post("/media/news", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
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
  const key = `news/${crypto.randomUUID()}-${file.name}`;
  await c.env.R2_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  const rows = await sql(
    `
    INSERT INTO attachments (s3_key, original_name, mime_type, size, visibility, collection)
    VALUES ($1, $2, $3, $4, 'public', 'news')
    RETURNING id, created_at
    `,
    [key, file.name, file.type || "application/octet-stream", file.size]
  );
  const item = rows[0];
  await logAudit(sql, claims.sub, "news_image_create", "attachments", item.id, {
    collection: "news",
    key,
  });
  const baseUrl = getPublicBaseUrl(c, c.env);
  return c.json({
    item: {
      id: item.id as string,
      name: file.name,
      url: `${baseUrl}/attachments/${item.id}`,
      created_at: item.created_at,
    },
  });
});

app.delete("/media/news/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  if (!c.env.R2_BUCKET) {
    return jsonError(c, 500, "R2_BUCKET is not configured", "CONFIG");
  }
  const id = c.req.param("id");
  const rows = await sql(
    "SELECT s3_key FROM attachments WHERE id = $1 AND collection = 'news'",
    [id]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Media not found", "NOT_FOUND");
  }
  const key = rows[0].s3_key as string;
  await c.env.R2_BUCKET.delete(key);
  await sql("DELETE FROM attachments WHERE id = $1", [id]);
  await logAudit(sql, claims.sub, "news_image_delete", "attachments", id, {
    collection: "news",
  });
  return c.json({ ok: true });
});

app.get("/media/reports", async (c) => {
  const sql = getSql(c.env);
  const rows = await sql(
    `
    SELECT id, original_name, created_at
    FROM attachments
    WHERE collection = 'reports'
    ORDER BY created_at DESC
    `
  );
  const baseUrl = getPublicBaseUrl(c, c.env);
  const items = rows.map((row) => ({
    id: row.id as string,
    name: (row.original_name as string | null) ?? null,
    url: `${baseUrl}/attachments/${row.id}`,
    created_at: row.created_at,
  }));
  return c.json({ items });
});

app.post("/media/reports", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
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
  const key = `reports/${crypto.randomUUID()}-${file.name}`;
  await c.env.R2_BUCKET.put(key, await file.arrayBuffer(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  const rows = await sql(
    `
    INSERT INTO attachments (s3_key, original_name, mime_type, size, visibility, collection)
    VALUES ($1, $2, $3, $4, 'public', 'reports')
    RETURNING id, created_at
    `,
    [key, file.name, file.type || "application/octet-stream", file.size]
  );
  const item = rows[0];
  await logAudit(
    sql,
    claims.sub,
    "reports_image_create",
    "attachments",
    item.id,
    {
      collection: "reports",
      key,
    }
  );
  const baseUrl = getPublicBaseUrl(c, c.env);
  return c.json({
    item: {
      id: item.id as string,
      name: file.name,
      url: `${baseUrl}/attachments/${item.id}`,
      created_at: item.created_at,
    },
  });
});

app.delete("/media/reports/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (claims.role !== "admin") {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  if (!c.env.R2_BUCKET) {
    return jsonError(c, 500, "R2_BUCKET is not configured", "CONFIG");
  }
  const id = c.req.param("id");
  const rows = await sql(
    "SELECT s3_key FROM attachments WHERE id = $1 AND collection = 'reports'",
    [id]
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Media not found", "NOT_FOUND");
  }
  const key = rows[0].s3_key as string;
  await c.env.R2_BUCKET.delete(key);
  await sql("DELETE FROM attachments WHERE id = $1", [id]);
  await logAudit(sql, claims.sub, "reports_image_delete", "attachments", id, {
    collection: "reports",
  });
  return c.json({ ok: true });
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
    let attachmentRows: { id: string }[] | null = null;
    try {
      attachmentRows = (await sql(
        `
        INSERT INTO attachments (complaint_id, s3_key, original_name, mime_type, size, visibility)
        VALUES ($1, $2, $3, $4, $5, 'public')
        RETURNING id
        `,
        [
          complaintId,
          key,
          file.name,
          file.type || "application/octet-stream",
          file.size,
        ]
      )) as { id: string }[];
    } catch (error) {
      console.error("attachments insert with original_name failed, retrying", error);
      try {
        attachmentRows = (await sql(
          `
          INSERT INTO attachments (complaint_id, s3_key, mime_type, size, visibility)
          VALUES ($1, $2, $3, $4, 'public')
          RETURNING id
          `,
          [
            complaintId,
            key,
            file.type || "application/octet-stream",
            file.size,
          ]
        )) as { id: string }[];
      } catch (retryError) {
        console.error("attachments insert with visibility failed, retrying minimal", retryError);
        try {
          attachmentRows = (await sql(
            `
            INSERT INTO attachments (complaint_id, s3_key, mime_type, size)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            `,
            [
              complaintId,
              key,
              file.type || "application/octet-stream",
              file.size,
            ]
          )) as { id: string }[];
        } catch (finalError) {
          console.error("attachments insert minimal failed, cleaning up R2 object", finalError);
          await c.env.R2_BUCKET.delete(key);
          throw finalError;
        }
      }
    }
    attachmentId = attachmentRows[0].id as string;
    await sql(
      "UPDATE complaints SET photo_attachment_id = $1 WHERE id = $2",
      [attachmentId, complaintId]
    );
  }

  const complaintsSecret = c.env.COMPLAINTS_SECRET ?? c.env.AUTH_JWT_SECRET ?? null;
  if (complaintsSecret) {
    try {
      const sensitivePayload = await encryptSensitivePayload(complaintsSecret, {
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
    } catch (error) {
      console.error("Failed to store complaint sensitive payload", error);
    }
  } else {
    console.warn("COMPLAINTS_SECRET is not configured; sensitive payload skipped");
  }

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

app.get("/theme/active", async (c) => {
  const sql = getSql(c.env);
  const hasTypography = await hasThemeTypographyColumn(sql);
  const rows = await sql(
    `
    SELECT t.id, t.name, t.colors, t.image_styles${
      hasTypography ? ", t.typography" : ""
    }, t.created_at, t.updated_at
    FROM theme_active a
    JOIN theme_palettes t ON t.id = a.theme_id
    LIMIT 1
    `
  );
  if (rows.length === 0) {
    return c.json({ theme: null });
  }
  const row = rows[0] as Record<string, unknown>;
  const colors = parseJsonField<ThemeColors>(row.colors);
  const imageStyles = parseJsonField<ThemeImageStyles>(row.image_styles);
  const typography = hasTypography
    ? parseJsonField<ThemeTypography>(row.typography)
    : null;
  return c.json({
    theme: {
      id: row.id as string,
      name: row.name as string,
      colors: colors ?? null,
      image_styles: imageStyles ?? null,
      typography: typography ?? null,
      created_at: row.created_at ?? null,
      updated_at: row.updated_at ?? null,
    },
  });
});

app.get("/admin/themes", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!isAdmin(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const hasTypography = await hasThemeTypographyColumn(sql);
  const themes = await sql(
    `
    SELECT id, name, colors, image_styles${
      hasTypography ? ", typography" : ""
    }, created_at, updated_at
    FROM theme_palettes
    ORDER BY created_at DESC
    `
  );
  const activeRows = await sql(
    "SELECT theme_id FROM theme_active LIMIT 1"
  );
  const activeThemeId = (activeRows[0]?.theme_id as string | undefined) ?? null;
  const items = themes.map((row: Record<string, unknown>) => ({
    id: row.id as string,
    name: row.name as string,
    colors: parseJsonField<ThemeColors>(row.colors),
    image_styles: parseJsonField<ThemeImageStyles>(row.image_styles),
    typography: hasTypography
      ? parseJsonField<ThemeTypography>(row.typography)
      : null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
  }));
  return c.json({ items, active_theme_id: activeThemeId });
});

app.post("/admin/themes", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!isAdmin(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const body = (await c.req.json().catch(() => null)) as
    | {
        name?: string;
        colors?: Record<string, unknown>;
        image_styles?: Record<string, unknown>;
        typography?: Record<string, unknown>;
      }
    | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return jsonError(c, 400, "name is required");
  }
  const colors = normalizeThemeColors(body?.colors ?? null);
  if (!colors) {
    return jsonError(c, 400, "colors are required");
  }
  const imageStyles = normalizeThemeImageStyles(body?.image_styles ?? null);
  const typography = normalizeThemeTypography(body?.typography ?? null);
  const hasTypography = await hasThemeTypographyColumn(sql);
  const rows = await sql(
    hasTypography
      ? `
        INSERT INTO theme_palettes (name, colors, image_styles, typography, created_by)
        VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, $5)
        RETURNING id, name, colors, image_styles, typography, created_at, updated_at
        `
      : `
        INSERT INTO theme_palettes (name, colors, image_styles, created_by)
        VALUES ($1, $2::jsonb, $3::jsonb, $4)
        RETURNING id, name, colors, image_styles, created_at, updated_at
        `,
    hasTypography
      ? [
          name,
          JSON.stringify(colors),
          JSON.stringify(imageStyles),
          JSON.stringify(typography),
          claims.sub,
        ]
      : [name, JSON.stringify(colors), JSON.stringify(imageStyles), claims.sub]
  );
  const item = rows[0] as Record<string, unknown>;
  await logAudit(sql, claims.sub, "theme_create", "theme_palettes", item.id as string, {
    name,
  });
  return c.json({
    item: {
      id: item.id as string,
      name: item.name as string,
      colors: parseJsonField<ThemeColors>(item.colors),
      image_styles: parseJsonField<ThemeImageStyles>(item.image_styles),
      typography: hasTypography
        ? parseJsonField<ThemeTypography>(item.typography)
        : null,
      created_at: item.created_at ?? null,
      updated_at: item.updated_at ?? null,
    },
  });
});

app.put("/admin/themes/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!isAdmin(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const id = c.req.param("id");
  const body = (await c.req.json().catch(() => null)) as
    | {
        name?: string;
        colors?: Record<string, unknown>;
        image_styles?: Record<string, unknown>;
        typography?: Record<string, unknown>;
      }
    | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return jsonError(c, 400, "name is required");
  }
  const colors = normalizeThemeColors(body?.colors ?? null);
  if (!colors) {
    return jsonError(c, 400, "colors are required");
  }
  const imageStyles = normalizeThemeImageStyles(body?.image_styles ?? null);
  const typography = normalizeThemeTypography(body?.typography ?? null);
  const hasTypography = await hasThemeTypographyColumn(sql);
  await sql(
    hasTypography
      ? `
        UPDATE theme_palettes
        SET name = $2,
            colors = $3::jsonb,
            image_styles = $4::jsonb,
            typography = $5::jsonb,
            updated_at = now()
        WHERE id = $1
        `
      : `
        UPDATE theme_palettes
        SET name = $2,
            colors = $3::jsonb,
            image_styles = $4::jsonb,
            updated_at = now()
        WHERE id = $1
        `,
    hasTypography
      ? [
          id,
          name,
          JSON.stringify(colors),
          JSON.stringify(imageStyles),
          JSON.stringify(typography),
        ]
      : [id, name, JSON.stringify(colors), JSON.stringify(imageStyles)]
  );
  await logAudit(sql, claims.sub, "theme_update", "theme_palettes", id, {
    name,
  });
  return c.json({ ok: true });
});

app.delete("/admin/themes/:id", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!isAdmin(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const id = c.req.param("id");
  const activeRows = await sql("SELECT theme_id FROM theme_active LIMIT 1");
  const activeThemeId = (activeRows[0]?.theme_id as string | undefined) ?? null;
  if (activeThemeId === id) {
    return jsonError(c, 400, "Cannot delete active theme");
  }
  await sql("DELETE FROM theme_palettes WHERE id = $1", [id]);
  await logAudit(sql, claims.sub, "theme_delete", "theme_palettes", id);
  return c.json({ ok: true });
});

app.post("/admin/themes/:id/activate", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!isAdmin(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const id = c.req.param("id");
  const rows = await sql("SELECT id FROM theme_palettes WHERE id = $1", [id]);
  if (rows.length === 0) {
    return jsonError(c, 404, "Theme not found", "NOT_FOUND");
  }
  await sql(
    `
    INSERT INTO theme_active (id, theme_id, updated_at)
    VALUES (true, $1, now())
    ON CONFLICT (id)
    DO UPDATE SET theme_id = EXCLUDED.theme_id, updated_at = now()
    `,
    [id]
  );
  await logAudit(sql, claims.sub, "theme_activate", "theme_palettes", id);
  return c.json({ ok: true, theme_id: id });
});

app.post("/admin/themes/reset", async (c) => {
  const sql = getSql(c.env);
  const claims = await requireAuth(c, c.env);
  if (!claims) {
    return jsonError(c, 401, "Unauthorized", "UNAUTHORIZED");
  }
  if (!isAdmin(claims)) {
    return jsonError(c, 403, "Forbidden", "FORBIDDEN");
  }
  const rows = await sql(
    `
    SELECT id
    FROM theme_palettes
    WHERE name = 'Tema padrao'
    ORDER BY created_at ASC
    LIMIT 1
    `
  );
  if (rows.length === 0) {
    return jsonError(c, 404, "Default theme not found", "NOT_FOUND");
  }
  const themeId = rows[0].id as string;
  await sql(
    `
    INSERT INTO theme_active (id, theme_id, updated_at)
    VALUES (true, $1, now())
    ON CONFLICT (id)
    DO UPDATE SET theme_id = EXCLUDED.theme_id, updated_at = now()
    `,
    [themeId]
  );
  await logAudit(sql, claims.sub, "theme_reset", "theme_palettes", themeId);
  return c.json({ ok: true, theme_id: themeId });
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
