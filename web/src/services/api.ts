const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const AUTH_TOKEN_KEY = "pnit_auth_token";

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY);
  }
}

export function getAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY);
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
  residents?: number;
  public_note?: string;
  photo_url?: string | null;
};

export type PublicPointsResponse = {
  items: PublicPointDto[];
  next_cursor?: string;
  last_sync_at?: string;
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
};

export type ReportExportResponse = {
  download_url?: string;
  content_base64?: string;
  content?: string;
  content_type?: string;
  filename?: string;
};

export type GeocodeResponse = {
  lat: number;
  lng: number;
  formatted_address?: string;
};

export type CreateResidentPayload = {
  full_name: string;
  doc_id?: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  state?: string;
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
  city?: string;
  state?: string;
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
    role: "admin" | "employee" | "user";
  };
};

export type AdminUser = {
  id: string;
  email: string;
  role: "admin" | "employee" | "user";
  status: "active" | "pending" | "disabled";
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
    city?: string | null;
    state?: string | null;
    status: string;
    created_at: string;
  }>;
  active_users?: number | null;
};

export async function fetchPublicPoints(params: {
  bbox: string;
  limit?: number;
  status?: string;
  precision?: string;
  updated_since?: string;
  cursor?: string;
}): Promise<PublicPointsResponse> {
  const query = new URLSearchParams({
    bbox: params.bbox,
    limit: String(params.limit ?? 500),
  });
  if (params.status) query.set("status", params.status);
  if (params.precision) query.set("precision", params.precision);
  if (params.updated_since) query.set("updated_since", params.updated_since);
  if (params.cursor) query.set("cursor", params.cursor);

  return apiFetch<PublicPointsResponse>(`/map/points?${query.toString()}`);
}

export async function fetchPublicPointById(id: string): Promise<PublicPointDto> {
  return apiFetch<PublicPointDto>(`/map/points/${id}`);
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
  return apiFetch<{ items: Array<{ id: string; full_name: string; city?: string | null; state?: string | null; status: string; created_at: string }> }>(
    `/residents${query}`
  );
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

export async function generateReportPreview(payload: {
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
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
  bounds: {
    north: number;
    south: number;
    east: number;
    west: number;
  };
  format: "PDF" | "CSV" | "JSON";
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

export async function fetchUserSummary(userId?: string): Promise<UserSummaryResponse> {
  const query = userId ? `?user_id=${encodeURIComponent(userId)}` : "";
  return apiFetch<UserSummaryResponse>(`/reports/user-summary${query}`);
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
