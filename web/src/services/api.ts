import type {
  ThemeActiveResponse,
  ThemeColors,
  ThemeImageStyles,
  ThemeListResponse,
  ThemePalette,
  ThemeTypography,
} from "../types/theme";

const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const AUTH_TOKEN_KEY = "pnit_auth_token";
const AUTH_ROLE_KEY = "pnit_auth_role";
const AUTH_USER_ID_KEY = "pnit_auth_user_id";

export type UserRole = "admin" | "manager" | "registrar" | "teacher";

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("pnit_auth_change"));
  }
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function setAuthRole(role: UserRole | null) {
  if (role) {
    localStorage.setItem(AUTH_ROLE_KEY, role);
  } else {
    localStorage.removeItem(AUTH_ROLE_KEY);
  }
}

export function getAuthRole(): UserRole | null {
  const rawValue = localStorage.getItem(AUTH_ROLE_KEY);
  const value = rawValue?.toLowerCase().trim();
  if (!value) return null;

  if (value === "employee" || value === "user" || value === "cadastrante") {
    return "registrar";
  }
  if (value === "gerente") {
    return "manager";
  }
  if (value === "professor") {
    return "teacher";
  }
  if (
    value === "admin" ||
    value === "manager" ||
    value === "registrar" ||
    value === "teacher"
  ) {
    return value;
  }
  return null;
}

export function setAuthUserId(userId: string | null) {
  if (userId) {
    localStorage.setItem(AUTH_USER_ID_KEY, userId);
  } else {
    localStorage.removeItem(AUTH_USER_ID_KEY);
  }
}

export function getAuthUserId(): string | null {
  return localStorage.getItem(AUTH_USER_ID_KEY);
}

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
  };
  message?: string;
};

async function apiFetch<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers ?? {});
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    if (contentType.includes("application/json")) {
      try {
        const body = (await response.json()) as ApiErrorBody;
        message = body.error?.message ?? body.message ?? message;
      } catch {
        // Ignore JSON parsing errors.
      }
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }

  return (await response.text()) as unknown as T;
}

export async function fetchActiveTheme(): Promise<ThemeActiveResponse> {
  return apiFetch<ThemeActiveResponse>("/theme/active");
}

export async function listThemes(): Promise<ThemeListResponse> {
  return apiFetch<ThemeListResponse>("/admin/themes");
}

export async function createTheme(payload: {
  name: string;
  colors: ThemeColors;
  image_styles: ThemeImageStyles;
  typography?: ThemeTypography;
}): Promise<{ item: ThemePalette }> {
  return apiFetch<{ item: ThemePalette }>("/admin/themes", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function updateTheme(
  id: string,
  payload: Partial<{
    name: string;
    colors: ThemeColors;
    image_styles: ThemeImageStyles;
    typography: ThemeTypography;
  }>
): Promise<{ item: ThemePalette }> {
  return apiFetch<{ item: ThemePalette }>(`/admin/themes/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function deleteTheme(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/admin/themes/${id}`, { method: "DELETE" });
}

export async function activateTheme(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/admin/themes/${id}/activate`, {
    method: "POST",
  });
}

export async function resetTheme(): Promise<{ ok: boolean; theme_id?: string }> {
  return apiFetch<{ ok: boolean; theme_id?: string }>(
    "/admin/themes/reset",
    { method: "POST" }
  );
}

export type PublicPointDto = {
  id: string;
  public_lat: number;
  public_lng: number;
  status: "active" | "inactive";
  precision: "approx" | "exact";
  updated_at: string;
  region?: string;
  city?: string | null;
  state?: string | null;
  community_name?: string | null;
  residents?: number;
  public_note?: string;
  photo_url?: string | null;
};

export type PublicPointsResponse = {
  items: PublicPointDto[];
  next_cursor?: string;
  last_sync_at?: string;
};

export type CommunityInfo = {
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

export type NewsImage = {
  id: string;
  url: string;
  name?: string | null;
  created_at?: string;
};

export type NewsPost = {
  id: string;
  title: string;
  subtitle?: string | null;
  body: string;
  support_subtitle?: string | null;
  support_text?: string | null;
  support_image_description?: string | null;
  support_image_source?: string | null;
  cover_url: string;
  support_url?: string | null;
  created_at: string;
  updated_at?: string;
};

export type ReportFilters = {
  city?: string;
  state?: string;
  region?: string;
  from?: string;
  to?: string;
};

export type ReportPreviewResponse = {
  report_id?: string;
  summary?: {
    points?: number;
    residents?: number;
    last_updated?: string;
  };
  breakdown?: {
    status?: Array<{ status: string; count: number }>;
    precision?: Array<{ precision: string; count: number }>;
    by_city?: Array<{ city: string; count: number }>;
    by_state?: Array<{ state: string; count: number }>;
  };
  indicators?: {
    total_residents?: number | string | null;
    health_avg?: number | string | null;
    education_avg?: number | string | null;
    income_avg?: number | string | null;
    housing_avg?: number | string | null;
    security_avg?: number | string | null;
  } | null;
  indicator_scores?: {
    health?: number[];
    education?: number[];
    income?: number[];
    housing?: number[];
    security?: number[];
  } | null;
};

export type ReportExportResponse = {
  download_url?: string;
  content_base64?: string;
  content?: string;
  content_type?: string;
  filename?: string;
};

export type Complaint = {
  id: string;
  type: string;
  description: string;
  location_text?: string | null;
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  state?: string | null;
  status: "new" | "reviewing" | "closed";
  photo_attachment_id?: string | null;
  photo_url?: string | null;
  created_at: string;
};

export type ProductivityResponse = {
  summary: {
    total_residents: number;
    total_points: number;
    period: "day" | "week" | "month";
  };
  by_user: Array<{
    user_id: string;
    full_name?: string | null;
    email?: string | null;
    residents: number;
    points: number;
    health_avg?: number | null;
    education_avg?: number | null;
    income_avg?: number | null;
    housing_avg?: number | null;
    security_avg?: number | null;
  }>;
  series: {
    residents: Array<{ bucket: string; total: number }>;
    points: Array<{ bucket: string; total: number }>;
  };
};

export type GeocodeResponse = {
  lat: number;
  lng: number;
  formatted_address?: string;
};

export type CreateResidentPayload = {
  full_name: string;
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
  status: "active" | "inactive";
  notes?: string;
};

export type CreatePointPayload = {
  lat?: number;
  lng?: number;
  accuracy_m?: number | null;
  status: "active" | "inactive";
  precision: "approx" | "exact";
  category?: string;
  public_note?: string;
  area_type?: string;
  reference_point?: string;
  city?: string;
  state?: string;
  community_name?: string;
  location_text?: string;
};

export type CreateResidentResponse = {
  id: string;
};

export type CreatePointResponse = {
  id: string;
  public_lat: number;
  public_lng: number;
  precision: "approx" | "exact";
};

export type RegisterResponse = {
  status: "pending";
  message?: string;
};

export type LoginResponse = {
  token: string;
  user: {
    id: string;
    email: string;
    role: UserRole;
  };
};

export type PublicCacheRefreshResponse = {
  ok: boolean;
  forced?: boolean;
  skipped?: boolean;
  last_refresh?: string;
  refreshed_at?: string;
};

export type AdminUser = {
  id: string;
  email: string;
  role: UserRole;
  status: "active" | "pending" | "disabled";
  link_code_id?: string | null;
  link_code?: string | null;
  link_code_created_by?: string | null;
  full_name?: string | null;
  phone?: string | null;
  organization?: string | null;
  city?: string | null;
  state?: string | null;
  territory?: string | null;
  access_reason?: string | null;
  created_at?: string;
  last_login_at?: string | null;
};

export type UserSummaryResponse = {
  summary?: { total_residents?: number };
    averages?: {
      health_score?: string;
      education_score?: string;
      income_score?: string;
      income_monthly?: string;
      housing_score?: string;
      security_score?: string;
    };
  monthly?: Array<{ month: string; total: number }>;
  residents?: Array<{
    id: string;
    full_name: string;
    doc_id?: string | null;
    birth_date?: string | null;
    sex?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    community_name?: string | null;
    household_size?: number | null;
    children_count?: number | null;
    elderly_count?: number | null;
    pcd_count?: number | null;
    status: string;
    created_at: string;
    health_score?: number | null;
    education_score?: number | null;
    income_score?: number | null;
    income_monthly?: number | null;
    housing_score?: number | null;
    security_score?: number | null;
    energy_access?: string | null;
    water_supply?: string | null;
    water_treatment?: string | null;
    sewage_type?: string | null;
    garbage_collection?: string | null;
    internet_access?: boolean | null;
    transport_access?: boolean | null;
    health_unit_distance_km?: number | null;
    health_travel_time?: string | null;
    health_has_regular_service?: boolean | null;
    health_has_clinic?: boolean | null;
    health_has_emergency?: boolean | null;
    health_has_community_agent?: boolean | null;
    health_has_ambulance?: boolean | null;
    health_difficulties?: string | null;
    education_level?: string | null;
    education_has_school?: boolean | null;
    education_has_transport?: boolean | null;
    education_material_support?: boolean | null;
    education_has_internet?: boolean | null;
    income_contributors?: number | null;
    income_occupation_type?: string | null;
    income_has_social_program?: boolean | null;
    income_social_program?: string | null;
    housing_rooms?: number | null;
    housing_area_m2?: number | null;
    housing_land_m2?: number | null;
    housing_type?: string | null;
    housing_material?: string | null;
    housing_has_bathroom?: boolean | null;
    housing_has_water_treated?: boolean | null;
    housing_condition?: string | null;
    housing_risks?: string | null;
    security_has_police_station?: boolean | null;
    security_has_patrol?: boolean | null;
    security_has_guard?: boolean | null;
    security_occurrences?: string | null;
    participation_types?: string | null;
    participation_events?: string | null;
    participation_engagement?: string | null;
    demand_priorities?: string | null;
    photo_types?: string | null;
    vulnerability_level?: string | null;
    technical_issues?: string | null;
    referrals?: string | null;
    agencies_contacted?: string | null;
    consent_accepted?: boolean | null;
    point_area_type?: string | null;
    point_reference_point?: string | null;
    point_precision?: string | null;
  }>;
  active_users?: number | null;
};

export type ResidentDetailResponse = {
  resident: {
    id: string;
    full_name: string;
    doc_id?: string | null;
    birth_date?: string | null;
    sex?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    neighborhood?: string | null;
    community_name?: string | null;
    household_size?: number | null;
    children_count?: number | null;
    elderly_count?: number | null;
    pcd_count?: number | null;
    status: "active" | "inactive";
    notes?: string | null;
    created_at?: string;
    updated_at?: string;
  };
  profile?: Record<string, unknown> | null;
  point?: {
    id: string;
    status?: "active" | "inactive";
    precision?: "approx" | "exact";
    category?: string | null;
    public_note?: string | null;
    area_type?: string | null;
    reference_point?: string | null;
    city?: string | null;
    state?: string | null;
    community_name?: string | null;
    location_text?: string | null;
    lat?: number | null;
    lng?: number | null;
  } | null;
};

export type AdminUserDetailsResponse = {
  user: AdminUser;
  residents: Array<{
    id: string;
    full_name?: string | null;
    doc_id?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    city?: string | null;
    state?: string | null;
    community_name?: string | null;
    status?: string | null;
    notes?: string | null;
    created_at?: string;
    health_score?: number | null;
    education_score?: number | null;
    income_score?: number | null;
    income_monthly?: number | null;
    housing_score?: number | null;
    security_score?: number | null;
    point_id?: string | null;
    point_status?: string | null;
    point_precision?: string | null;
    point_category?: string | null;
    point_public_note?: string | null;
    point_city?: string | null;
    point_state?: string | null;
    point_community_name?: string | null;
    point_created_at?: string | null;
  }>;
};

export async function fetchPublicPoints(params: {
  bbox: string;
  limit?: number;
  status?: string;
  precision?: string;
  updated_since?: string;
  cursor?: string;
  city?: string;
  state?: string;
  region?: string;
  community?: string;
}): Promise<PublicPointsResponse> {
  const query = new URLSearchParams({
    bbox: params.bbox,
    limit: String(params.limit ?? 500),
  });
  if (params.status) query.set("status", params.status);
  if (params.precision) query.set("precision", params.precision);
  if (params.updated_since) query.set("updated_since", params.updated_since);
  if (params.cursor) query.set("cursor", params.cursor);
  if (params.city) query.set("city", params.city);
  if (params.state) query.set("state", params.state);
  if (params.region) query.set("region", params.region);
  if (params.community) query.set("community", params.community);

  return apiFetch<PublicPointsResponse>(`/map/points?${query.toString()}`);
}

export async function fetchPublicPointById(id: string): Promise<PublicPointDto> {
  return apiFetch<PublicPointDto>(`/map/points/${id}`);
}

export async function fetchPublicCommunities(params?: {
  city?: string;
  state?: string;
}): Promise<{
  items: Array<{
    community_name: string;
    city?: string | null;
    state?: string | null;
    count?: number;
  }>;
}> {
  const query = new URLSearchParams();
  if (params?.city) query.set("city", params.city);
  if (params?.state) query.set("state", params.state);
  const suffix = query.toString();
  return apiFetch<{
    items: Array<{
      community_name: string;
      city?: string | null;
      state?: string | null;
      count?: number;
    }>;
  }>(`/map/communities${suffix ? `?${suffix}` : ""}`);
}

export async function fetchCommunities(params?: {
  city?: string;
  state?: string;
}): Promise<{ items: CommunityInfo[] }> {
  const query = new URLSearchParams();
  if (params?.city) query.set("city", params.city);
  if (params?.state) query.set("state", params.state);
  const suffix = query.toString();
  return apiFetch<{ items: CommunityInfo[] }>(
    `/communities${suffix ? `?${suffix}` : ""}`
  );
}

export async function createCommunity(payload: CommunityInfo) {
  return apiFetch<{ item: CommunityInfo }>("/communities", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchNewsImages(): Promise<{ items: NewsImage[] }> {
  return apiFetch<{ items: NewsImage[] }>("/media/news");
}

export async function listNewsPosts(): Promise<{ items: NewsPost[] }> {
  return apiFetch<{ items: NewsPost[] }>("/news");
}

export async function createNewsPost(payload: {
  title: string;
  subtitle?: string;
  body: string;
  support_subtitle?: string;
  support_text?: string;
  support_image_description?: string;
  support_image_source?: string;
  cover_file: File;
  support_file: File;
}): Promise<{ item: NewsPost }> {
  const formData = new FormData();
  formData.append("title", payload.title);
  formData.append("body", payload.body);
  formData.append("cover_file", payload.cover_file);
  if (payload.subtitle?.trim()) {
    formData.append("subtitle", payload.subtitle.trim());
  }
  if (payload.support_subtitle?.trim()) {
    formData.append("support_subtitle", payload.support_subtitle.trim());
  }
  if (payload.support_text?.trim()) {
    formData.append("support_text", payload.support_text.trim());
  }
  if (payload.support_image_description?.trim()) {
    formData.append(
      "support_image_description",
      payload.support_image_description.trim()
    );
  }
  if (payload.support_image_source?.trim()) {
    formData.append("support_image_source", payload.support_image_source.trim());
  }
  formData.append("support_file", payload.support_file);

  const token = getAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_BASE_URL}/admin/news`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function uploadNewsImage(file: File): Promise<{ item: NewsImage }> {
  const formData = new FormData();
  formData.append("file", file);
  const token = getAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}/media/news`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteNewsImage(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/media/news/${id}`, { method: "DELETE" });
}

export async function fetchReportsImages(): Promise<{ items: NewsImage[] }> {
  return apiFetch<{ items: NewsImage[] }>("/media/reports");
}

export async function uploadReportsImage(
  file: File
): Promise<{ item: NewsImage }> {
  const formData = new FormData();
  formData.append("file", file);
  const token = getAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}/media/reports`, {
    method: "POST",
    headers,
    body: formData,
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
  return response.json();
}

export async function deleteReportsImage(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/media/reports/${id}`, {
    method: "DELETE",
  });
}

export type AccessCode = {
  id: string;
  code: string;
  status: "active" | "used" | "revoked";
  created_at: string;
  used_at?: string | null;
};

export async function validateAccessCode(code: string): Promise<{
  ok: boolean;
  code: string;
  created_by: string;
}> {
  const query = new URLSearchParams({ code });
  return apiFetch<{
    ok: boolean;
    code: string;
    created_by: string;
  }>(`/public/access-code/validate?${query.toString()}`);
}

export async function createAccessCode(): Promise<{ item: AccessCode }> {
  return apiFetch<{ item: AccessCode }>("/access-codes", { method: "POST" });
}

export async function listAccessCodes(params?: {
  status?: string;
}): Promise<{ items: AccessCode[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  const suffix = query.toString();
  return apiFetch<{ items: AccessCode[] }>(
    `/access-codes${suffix ? `?${suffix}` : ""}`
  );
}

export type LinkCode = {
  id: string;
  code: string;
  status: "active" | "used" | "revoked";
  created_at: string;
  used_at?: string | null;
  used_by?: string | null;
};

export async function createLinkCode(): Promise<{ item: LinkCode }> {
  return apiFetch<{ item: LinkCode }>("/link-codes", { method: "POST" });
}

export async function listLinkCodes(params?: {
  status?: string;
}): Promise<{ items: LinkCode[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  const suffix = query.toString();
  return apiFetch<{ items: LinkCode[] }>(
    `/link-codes${suffix ? `?${suffix}` : ""}`
  );
}

export async function revokeLinkCode(id: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/link-codes/${id}/revoke`, {
    method: "PUT",
  });
}

export type AccessCodeSubmissionPayload = {
  code: string;
  resident: Record<string, unknown>;
  profile: Record<string, unknown>;
  point: Record<string, unknown>;
};

export type PendingSubmissionItem = {
  id: string;
  full_name: string;
  doc_id?: string | null;
  birth_date?: string | null;
  sex?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  neighborhood?: string | null;
  community_name?: string | null;
  household_size?: number | null;
  children_count?: number | null;
  elderly_count?: number | null;
  pcd_count?: number | null;
  notes?: string | null;
  status?: string | null;
  created_at: string;
  point_id?: string | null;
  public_lat?: number | null;
  public_lng?: number | null;
  precision?: string | null;
  category?: string | null;
  public_note?: string | null;
  area_type?: string | null;
  reference_point?: string | null;
  location_text?: string | null;
  health_score?: number | null;
  health_has_clinic?: boolean | null;
  health_has_emergency?: boolean | null;
  health_has_community_agent?: boolean | null;
  health_unit_distance_km?: number | null;
  health_travel_time?: string | null;
  health_has_regular_service?: boolean | null;
  health_has_ambulance?: boolean | null;
  health_difficulties?: string | null;
  health_notes?: string | null;
  education_score?: number | null;
  education_level?: string | null;
  education_has_school?: boolean | null;
  education_has_transport?: boolean | null;
  education_material_support?: boolean | null;
  education_has_internet?: boolean | null;
  education_notes?: string | null;
  income_score?: number | null;
  income_monthly?: number | null;
  income_source?: string | null;
  income_contributors?: number | null;
  income_occupation_type?: string | null;
  income_has_social_program?: boolean | null;
  income_social_program?: string | null;
  assets_has_car?: boolean | null;
  assets_has_fridge?: boolean | null;
  assets_has_furniture?: boolean | null;
  assets_has_land?: boolean | null;
  housing_score?: number | null;
  housing_rooms?: number | null;
  housing_area_m2?: number | null;
  housing_land_m2?: number | null;
  housing_type?: string | null;
  housing_material?: string | null;
  housing_has_bathroom?: boolean | null;
  housing_has_water_treated?: boolean | null;
  housing_condition?: string | null;
  housing_risks?: string | null;
  security_score?: number | null;
  security_has_police_station?: boolean | null;
  security_has_patrol?: boolean | null;
  security_has_guard?: boolean | null;
  security_occurrences?: string | null;
  security_notes?: string | null;
  race_identity?: string | null;
  territory_narrative?: string | null;
  territory_memories?: string | null;
  territory_conflicts?: string | null;
  territory_culture?: string | null;
  energy_access?: string | null;
  water_supply?: string | null;
  water_treatment?: string | null;
  sewage_type?: string | null;
  garbage_collection?: string | null;
  internet_access?: boolean | null;
  transport_access?: boolean | null;
  participation_types?: string | null;
  participation_events?: string | null;
  participation_engagement?: string | null;
  demand_priorities?: string | null;
  photo_types?: string | null;
  vulnerability_level?: string | null;
  technical_issues?: string | null;
  referrals?: string | null;
  agencies_contacted?: string | null;
  consent_accepted?: boolean | null;
};

export async function submitAccessCodeRegistration(
  payload: AccessCodeSubmissionPayload,
  file?: File | null
): Promise<{ ok: boolean; resident_id: string; point_id: string; status: string }> {
  if (file) {
    const form = new FormData();
    form.append("payload", JSON.stringify(payload));
    form.append("file", file);
    const response = await fetch(`${API_BASE_URL}/public/access-code/submit`, {
      method: "POST",
      body: form,
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok) {
      let message = `Erro ${response.status}`;
      if (contentType.includes("application/json")) {
        try {
          const body = (await response.json()) as ApiErrorBody;
          message = body.error?.message ?? body.message ?? message;
        } catch {
          // Ignore JSON parsing errors.
        }
      }
      throw new Error(message);
    }
    if (contentType.includes("application/json")) {
      return (await response.json()) as {
        ok: boolean;
        resident_id: string;
        point_id: string;
        status: string;
      };
    }
    return JSON.parse(await response.text()) as {
      ok: boolean;
      resident_id: string;
      point_id: string;
      status: string;
    };
  }

  return apiFetch<{ ok: boolean; resident_id: string; point_id: string; status: string }>(
    "/public/access-code/submit",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export async function listPendingSubmissions(): Promise<{
  items: PendingSubmissionItem[];
}> {
  return apiFetch<{ items: PendingSubmissionItem[] }>("/user/pending-submissions");
}

export async function approvePendingSubmission(id: string) {
  return apiFetch<{ ok: boolean }>(`/user/pending-submissions/${id}/approve`, {
    method: "POST",
  });
}

export async function rejectPendingSubmission(id: string) {
  return apiFetch<{ ok: boolean }>(`/user/pending-submissions/${id}/reject`, {
    method: "POST",
  });
}

export async function createResident(
  payload: CreateResidentPayload
): Promise<CreateResidentResponse> {
  return apiFetch<CreateResidentResponse>("/residents", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function listResidents(createdBy?: "me") {
  const query = createdBy ? "?created_by=me" : "";
  return apiFetch<{
    items: Array<{
      id: string;
      full_name: string;
      city?: string | null;
      state?: string | null;
      community_name?: string | null;
      status: string;
      created_at: string;
    }>;
  }>(
    `/residents${query}`
  );
}

export async function fetchResidentDetail(
  residentId: string
): Promise<ResidentDetailResponse> {
  return apiFetch<ResidentDetailResponse>(`/residents/${residentId}`);
}

export async function updateResident(
  residentId: string,
  payload: Partial<CreateResidentPayload>
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/residents/${residentId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function updatePoint(
  pointId: string,
  payload: Partial<CreatePointPayload>
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/points/${pointId}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function createResidentProfile(
  residentId: string,
  payload: Record<string, unknown>
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/residents/${residentId}/profile`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function createPoint(
  payload: CreatePointPayload
): Promise<CreatePointResponse> {
  return apiFetch<CreatePointResponse>("/points", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function uploadAttachment(payload: FormData): Promise<{ id: string }> {
  const token = getAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(`${API_BASE_URL}/attachments`, {
    method: "POST",
    headers,
    body: payload,
  });
  if (!response.ok) {
    throw new Error(`Erro ${response.status}`);
  }
  return (await response.json()) as { id: string };
}

export async function assignResidentPoint(payload: {
  resident_id: string;
  point_id: string;
}): Promise<void> {
  await apiFetch<void>("/assignments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchAdminUserDetails(
  userId: string
): Promise<AdminUserDetailsResponse> {
  return apiFetch<AdminUserDetailsResponse>(`/admin/users/${userId}/details`);
}

export async function generateReportPreview(payload: {
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  filters?: ReportFilters;
  include?: {
    indicators?: boolean;
    points?: boolean;
    narratives?: boolean;
  };
}): Promise<ReportPreviewResponse> {
  return apiFetch<ReportPreviewResponse>("/reports/preview", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function exportReport(payload: {
  bounds?: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  format: "PDF" | "CSV" | "JSON";
  filters?: ReportFilters;
  include?: {
    indicators?: boolean;
    points?: boolean;
    narratives?: boolean;
  };
}): Promise<ReportExportResponse> {
  return apiFetch<ReportExportResponse>("/reports/export", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function submitComplaint(payload: {
  type: string;
  description: string;
  location_text?: string;
  city?: string;
  state?: string;
  file?: File | null;
}): Promise<{ ok: boolean; id: string }> {
  const form = new FormData();
  form.set("type", payload.type);
  form.set("description", payload.description);
  if (payload.location_text) form.set("location_text", payload.location_text);
  if (payload.city) form.set("city", payload.city);
  if (payload.state) form.set("state", payload.state);
  if (payload.file) form.set("file", payload.file);

  const response = await fetch(`${API_BASE_URL}/public/complaints`, {
    method: "POST",
    body: form,
  });
  if (!response.ok) {
    throw new Error(`Erro ${response.status}`);
  }
  return (await response.json()) as { ok: boolean; id: string };
}

export async function listComplaints(params?: {
  status?: string;
  city?: string;
  state?: string;
  type?: string;
}): Promise<{ items: Complaint[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.city) query.set("city", params.city);
  if (params?.state) query.set("state", params.state);
  if (params?.type) query.set("type", params.type);
  const suffix = query.toString();
  return apiFetch<{ items: Complaint[] }>(
    `/admin/complaints${suffix ? `?${suffix}` : ""}`
  );
}

export async function updateComplaintStatus(
  id: string,
  status: "new" | "reviewing" | "closed"
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/admin/complaints/${id}`, {
    method: "PUT",
    body: JSON.stringify({ status }),
  });
}

export async function fetchAuditEntries(params?: {
  actor_user_id?: string;
  entity_type?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<{ items: Array<Record<string, unknown>> }> {
  const query = new URLSearchParams();
  if (params?.actor_user_id) query.set("actor_user_id", params.actor_user_id);
  if (params?.entity_type) query.set("entity_type", params.entity_type);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.limit) query.set("limit", String(params.limit));
  const suffix = query.toString();
  return apiFetch<{ items: Array<Record<string, unknown>> }>(
    `/audit${suffix ? `?${suffix}` : ""}`
  );
}

export async function fetchProductivity(params?: {
  period?: "day" | "week" | "month";
  from?: string;
  to?: string;
  city?: string;
  state?: string;
  user_id?: string;
}): Promise<ProductivityResponse> {
  const query = new URLSearchParams();
  if (params?.period) query.set("period", params.period);
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.city) query.set("city", params.city);
  if (params?.state) query.set("state", params.state);
  if (params?.user_id) query.set("user_id", params.user_id);
  const suffix = query.toString();
  return apiFetch<ProductivityResponse>(
    `/admin/productivity${suffix ? `?${suffix}` : ""}`
  );
}

export async function geocodeAddress(query: string): Promise<GeocodeResponse> {
  const params = new URLSearchParams({ address: query });
  return apiFetch<GeocodeResponse>(`/geocode?${params.toString()}`);
}

export async function registerUser(payload: {
  email: string;
  password: string;
  full_name: string;
  phone: string;
  organization: string;
  city: string;
  state: string;
  territory: string;
  access_reason: string;
  role: "registrar" | "manager";
  link_code?: string;
}): Promise<RegisterResponse> {
  return apiFetch<RegisterResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function loginUser(payload: {
  email: string;
  password: string;
}): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function requestPasswordReset(email: string): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/password/reset/request", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function confirmPasswordReset(payload: {
  email: string;
  code: string;
  password: string;
}): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>("/auth/password/reset/confirm", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function fetchUserSummary(userId?: string): Promise<UserSummaryResponse> {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return apiFetch<UserSummaryResponse>(`/reports/user-summary${query}`);
}

export async function fetchUserSummaryPdf(
  userId?: string
): Promise<ReportExportResponse> {
  const query = new URLSearchParams();
  if (userId) query.set("user_id", userId);
  query.set("format", "PDF");
  const suffix = query.toString();
  return apiFetch<ReportExportResponse>(`/reports/user-summary?${suffix}`);
}

export async function refreshPublicMapCache(
  force?: boolean
): Promise<PublicCacheRefreshResponse> {
  const suffix = force ? "?force=1" : "";
  return apiFetch<PublicCacheRefreshResponse>(`/admin/sync/public-map${suffix}`, {
    method: "POST",
  });
}

export async function listAdminUsers(params?: {
  status?: string;
  role?: string;
  q?: string;
}): Promise<{ items: AdminUser[] }> {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.role) query.set("role", params.role);
  if (params?.q) query.set("q", params.q);
  const suffix = query.toString();
  return apiFetch<{ items: AdminUser[] }>(
    `/admin/users${suffix ? `?${suffix}` : ""}`
  );
}

export async function updateAdminUser(
  id: string,
  payload: Partial<AdminUser>
): Promise<{ ok: boolean }> {
  return apiFetch<{ ok: boolean }>(`/admin/users/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
