const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

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
  residents?: number;
  public_note?: string;
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
  status: "active" | "inactive";
  notes?: string;
};

export type CreatePointPayload = {
  lat: number;
  lng: number;
  accuracy_m?: number | null;
  status: "active" | "inactive";
  precision: "approx" | "exact";
  category?: string;
  public_note?: string;
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

export async function createPoint(
  payload: CreatePointPayload
): Promise<CreatePointResponse> {
  return apiFetch<CreatePointResponse>("/points", {
    method: "POST",
    body: JSON.stringify(payload),
  });
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
