import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  Tooltip,
} from "chart.js";
import { Bar, Pie } from "react-chartjs-2";
import MapShell from "./MapShell";
import MapFilters from "./MapFilters";
import type { MapPoint } from "../types/models";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";
import {
  exportReport,
  fetchPublicPoints,
  fetchPublicCommunities,
  generateReportPreview,
  type PublicPointDto,
} from "../services/api";

const defaultCenter = { lat: -14.235, lng: -51.925 };
// Wide bounds used when a state/city/community filter is active so results
// are not unintentionally limited by the current viewport.
const BRAZIL_BBOX = "-74.1,-34.0,-34.7,5.4";

type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type ReportStatus = "idle" | "ready";
type ReportFormat = "PDF" | "CSV" | "JSON";
type ReportSummary = {
  points?: number;
  residents?: number;
  last_updated?: string;
};

type ReportBreakdown = {
  status?: Array<{ status: string; count: number }>;
  precision?: Array<{ precision: string; count: number }>;
  by_city?: Array<{ city: string; count: number }>;
  by_state?: Array<{ state: string; count: number }>;
};

type PointFilters = {
  status: "all" | "active" | "inactive";
  precision: "all" | "approx" | "exact";
  updatedWithinDays: number | null;
  city: string;
  state: string;
  region: string;
  community: string;
};

const emptyPoints: MapPoint[] = [];
const defaultFilters: PointFilters = {
  status: "all",
  precision: "all",
  updatedWithinDays: null,
  city: "",
  state: "",
  region: "",
  community: "",
};

type BrazilCity = { name: string; state: string };
const BRAZIL_CITIES = citiesData as BrazilCity[];

type PublicMapMode = "public" | "reports";
type PublicMapSectionProps = {
  mode?: PublicMapMode;
};

function mapPointFromApi(point: PublicPointDto): MapPoint {
  return {
    id: point.id,
    publicLat: point.public_lat,
    publicLng: point.public_lng,
    status: point.status,
    precision: point.precision,
    updatedAt: point.updated_at,
    region: point.region ?? "-",
    city: point.city ?? null,
    state: point.state ?? null,
    residents: point.residents ?? 0,
    communityName: point.community_name ?? null,
    publicNote: point.public_note,
    photoUrl: point.photo_url ?? null,
  };
}

export default function PublicMapSection({ mode = "reports" }: PublicMapSectionProps) {
  const isPublicMode = mode === "public";
  const [selectionActive, setSelectionActive] = useState(false);
  const [selectedBounds, setSelectedBounds] = useState<Bounds | null>(null);
  const [reportStatus, setReportStatus] = useState<ReportStatus>("idle");
  const [reportFormat, setReportFormat] = useState<ReportFormat>("PDF");
  const [reportName, setReportName] = useState("");
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [reportBreakdown, setReportBreakdown] =
    useState<ReportBreakdown | null>(null);
  const [reportIndicators, setReportIndicators] = useState<{
    total_residents?: number | string | null;
    health_avg?: number | string | null;
    education_avg?: number | string | null;
    income_avg?: number | string | null;
    housing_avg?: number | string | null;
    security_avg?: number | string | null;
  } | null>(null);
  const [reportIndicatorScores, setReportIndicatorScores] = useState<{
    health?: number[];
    education?: number[];
    income?: number[];
    housing?: number[];
    security?: number[];
  } | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportInclude, setReportInclude] = useState({
    indicators: true,
    points: true,
    narratives: false,
  });
  const [mapPoints, setMapPoints] = useState<MapPoint[]>(emptyPoints);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [pointsError, setPointsError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] =
    useState<PointFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<PointFilters>(defaultFilters);
  const [publicFilters, setPublicFilters] =
    useState<PointFilters>(defaultFilters);
  const [publicCommunities, setPublicCommunities] = useState<
    Array<{
      community_name: string;
      city?: string | null;
      state?: string | null;
      count?: number;
    }>
  >([]);
  const [publicCommunitiesLoading, setPublicCommunitiesLoading] = useState(false);
  const [publicCommunitiesError, setPublicCommunitiesError] = useState<string | null>(
    null
  );
  const mapRef = useRef<google.maps.Map | null>(null);
  const rectangleRef = useRef<google.maps.Rectangle | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const fetchTimeoutRef = useRef<number | null>(null);
  const lastRequestRef = useRef<string | null>(null);
  const activeFiltersRef = useRef<PointFilters>(defaultFilters);
  const lastFittedFilterRef = useRef<string | null>(null);

  const getGoogleMaps = useCallback(
    () => (window as typeof window & { google?: typeof google }).google,
    []
  );

  const loadPointsForBounds = useCallback(async (
    bounds: google.maps.LatLngBounds,
    filtersOverride?: PointFilters,
    force = false
  ) => {
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    const computedBbox = `${southWest.lng()},${southWest.lat()},${northEast.lng()},${northEast.lat()}`;
    const filters = filtersOverride ?? appliedFilters;
    const status = filters.status === "all" ? undefined : filters.status;
    const precision = filters.precision === "all" ? undefined : filters.precision;
    const updatedSince = filters.updatedWithinDays
      ? new Date(
          Date.now() - filters.updatedWithinDays * 24 * 60 * 60 * 1000
        ).toISOString()
      : undefined;
    const city = filters.city.trim() ? filters.city.trim() : undefined;
    const state = filters.state.trim() ? filters.state.trim() : undefined;
    const region = filters.region.trim() ? filters.region.trim() : undefined;
    const community = filters.community.trim()
      ? filters.community.trim()
      : undefined;
    const useWideBounds = Boolean(state || city || community);
    const bbox = useWideBounds ? BRAZIL_BBOX : computedBbox;
    const requestKey = JSON.stringify({
      bbox,
      status,
      precision,
      updatedSince,
      city,
      state,
      region,
      community,
    });
    if (!force && lastRequestRef.current === requestKey) {
      return;
    }
    lastRequestRef.current = requestKey;
    setPointsLoading(true);
    setPointsError(null);
    try {
      const response = await fetchPublicPoints({
        bbox,
        limit: 500,
        status,
        precision,
        updated_since: updatedSince,
        city,
        state,
        region,
        community,
      });
      setMapPoints(response.items.map(mapPointFromApi));
      setLastSyncAt(response.last_sync_at ?? null);

      // When filtering by state/city/community, fit the map to the filtered
      // points once so the user can see all matching markers.
      if (useWideBounds) {
        const filterKey = `${state ?? ""}|${city ?? ""}|${community ?? ""}`;
        const map = mapRef.current;
        const googleMaps = getGoogleMaps();
        if (
          map &&
          googleMaps?.maps &&
          response.items.length > 0 &&
          filterKey !== lastFittedFilterRef.current
        ) {
          const fitBounds = new googleMaps.maps.LatLngBounds();
          response.items.forEach((item) => {
            fitBounds.extend({ lat: item.public_lat, lng: item.public_lng });
          });
          map.fitBounds(fitBounds, 56);
          lastFittedFilterRef.current = filterKey;
        }
      } else {
        lastFittedFilterRef.current = null;
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar pontos.";
      setPointsError(message);
    } finally {
      setPointsLoading(false);
    }
  }, [appliedFilters, getGoogleMaps]);

  const handleMapReady = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      if (idleListenerRef.current) {
        idleListenerRef.current.remove();
      }
      idleListenerRef.current = map.addListener("idle", () => {
        const bounds = map.getBounds();
        if (!bounds) {
          return;
        }
        if (fetchTimeoutRef.current) {
          window.clearTimeout(fetchTimeoutRef.current);
        }
        fetchTimeoutRef.current = window.setTimeout(() => {
          void loadPointsForBounds(bounds, activeFiltersRef.current);
        }, 350);
      });
    },
    [loadPointsForBounds]
  );

  const clearSelection = useCallback(() => {
    if (rectangleRef.current) {
      rectangleRef.current.setMap(null);
      rectangleRef.current = null;
    }
    setSelectedBounds(null);
    setSelectionActive(false);
    setReportStatus("idle");
    setReportFeedback(null);
    setReportSummary(null);
    setReportBreakdown(null);
    setReportError(null);
  }, []);

  const useViewportBounds = useCallback(() => {
    if (!mapRef.current) {
      return;
    }
    const bounds = mapRef.current.getBounds();
    if (!bounds) {
      return;
    }
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    setSelectedBounds({
      north: northEast.lat(),
      east: northEast.lng(),
      south: southWest.lat(),
      west: southWest.lng(),
    });
    setReportStatus("idle");
    setSelectionActive(false);
    setReportFeedback(null);
    setReportSummary(null);
    setReportBreakdown(null);
    setReportError(null);
  }, []);

  const runReportPreview = useCallback(async () => {
    const filters = {
      city: appliedFilters.city.trim() || undefined,
      state: appliedFilters.state.trim() || undefined,
      region: appliedFilters.region.trim() || undefined,
    };
    if (!selectedBounds && !filters.city && !filters.state && !filters.region) {
      return false;
    }
    setReportLoading(true);
    setReportError(null);
    setReportFeedback(null);
    try {
      const response = await generateReportPreview({
        bounds: selectedBounds ?? undefined,
        filters,
        include: reportInclude,
      });
      setReportSummary(response.summary ?? null);
      setReportBreakdown(response.breakdown ?? null);
      setReportIndicators(response.indicators ?? null);
      setReportIndicatorScores(response.indicator_scores ?? null);
      setReportStatus("ready");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao gerar relatório.";
      setReportError(message);
      setReportStatus("idle");
      return false;
    } finally {
      setReportLoading(false);
    }
  }, [appliedFilters, reportInclude, selectedBounds]);

  const handleGenerateReport = useCallback(() => {
    void runReportPreview();
  }, [runReportPreview]);

  const handleExportReport = useCallback(async () => {
    const filters = {
      city: appliedFilters.city.trim() || undefined,
      state: appliedFilters.state.trim() || undefined,
      region: appliedFilters.region.trim() || undefined,
    };
    if (!selectedBounds && !filters.city && !filters.state && !filters.region) {
      return;
    }
    if (reportStatus !== "ready") {
      const ok = await runReportPreview();
      if (!ok) {
        return;
      }
    }
    setReportFeedback(null);
    exportReport({
      bounds: selectedBounds ?? undefined,
      filters,
      format: reportFormat,
      include: reportInclude,
    })
      .then((response) => {
        if (response.download_url) {
          window.open(response.download_url, "_blank", "noopener,noreferrer");
          return;
        }
        const contentType = response.content_type ?? "text/plain";
        const safeName = reportName
          .trim()
          .replace(/[^a-zA-Z0-9-_]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .toLowerCase();
        const fallbackName = `relatorio-${new Date()
          .toISOString()
          .replace(/[:.]/g, "-")}`;
        const filename =
          response.filename ??
          `${safeName || fallbackName}.${reportFormat.toLowerCase()}`;
        if (response.content_base64) {
          const binary = window.atob(response.content_base64);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i += 1) {
            bytes[i] = binary.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: contentType });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(url);
          return;
        }
        if (response.content) {
          const blob = new Blob([response.content], { type: contentType });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = filename;
          link.click();
          URL.revokeObjectURL(url);
          return;
        }
        setReportFeedback("Não foi possível exportar o relatório.");
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Falha ao exportar relatório.";
        setReportFeedback(message);
      });
  }, [
    appliedFilters,
    reportFormat,
    reportInclude,
    reportName,
    reportStatus,
    runReportPreview,
    selectedBounds,
  ]);

  const toggleSelection = useCallback(() => {
    setSelectionActive((current) => !current);
    setReportStatus("idle");
    setReportFeedback(null);
    setReportSummary(null);
    setReportBreakdown(null);
    setReportError(null);
  }, []);

  const handleIncludeChange = useCallback(
    (field: "indicators" | "points" | "narratives", value: boolean) => {
      setReportInclude((current) => ({ ...current, [field]: value }));
      setReportStatus("idle");
      setReportSummary(null);
      setReportBreakdown(null);
      setReportFeedback(null);
    },
    []
  );

  const handleRefreshArea = useCallback(() => {
    const bounds = mapRef.current?.getBounds();
    if (!bounds) {
      return;
    }
    void loadPointsForBounds(bounds, activeFiltersRef.current, true);
  }, [loadPointsForBounds]);


  const handleStatusFilterChange = useCallback(
    (value: PointFilters["status"]) => {
      setFilterDraft((current) => ({ ...current, status: value }));
    },
    []
  );

  const handlePrecisionFilterChange = useCallback(
    (value: PointFilters["precision"]) => {
      setFilterDraft((current) => ({ ...current, precision: value }));
    },
    []
  );

  const handleUpdatedFilterChange = useCallback((value: number | null) => {
    setFilterDraft((current) => ({ ...current, updatedWithinDays: value }));
  }, []);

  const selectedPublicCityValue =
    publicFilters.city && publicFilters.state
      ? `${publicFilters.city}__${publicFilters.state}`
      : "";

  const handlePublicCityChange = (value: string) => {
    if (!value) {
      setPublicFilters((current) => ({
        ...current,
        city: "",
        state: "",
        community: "",
      }));
      return;
    }
    const [city, state] = value.split("__");
    setPublicFilters((current) => ({
      ...current,
      city,
      state,
      community: "",
    }));
  };

  const handlePublicStateChange = (value: string) => {
    setPublicFilters((current) => ({
      ...current,
      state: value,
      city: "",
      community: "",
    }));
  };

  const handlePublicCommunityChange = (value: string) => {
    setPublicFilters((current) => ({ ...current, community: value }));
  };

  const filteredCities = useMemo(() => {
    if (!publicFilters.state) {
      return BRAZIL_CITIES;
    }
    return BRAZIL_CITIES.filter((city) => city.state === publicFilters.state);
  }, [publicFilters.state]);

  useEffect(() => {
    if (!isPublicMode || !mapRef.current) {
      return;
    }
    const bounds = mapRef.current.getBounds();
    if (!bounds) {
      return;
    }
    void loadPointsForBounds(bounds, publicFilters);
  }, [isPublicMode, loadPointsForBounds, publicFilters]);

  useEffect(() => {
    activeFiltersRef.current = isPublicMode ? publicFilters : appliedFilters;
  }, [appliedFilters, isPublicMode, publicFilters]);

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters(filterDraft);
    const bounds = mapRef.current?.getBounds();
    if (!bounds) {
      return;
    }
    void loadPointsForBounds(bounds, filterDraft);
  }, [filterDraft, loadPointsForBounds]);

  const loadPublicCommunities = useCallback(
    async (city?: string, state?: string) => {
      setPublicCommunitiesLoading(true);
      setPublicCommunitiesError(null);
      try {
        const response = await fetchPublicCommunities({ city, state });
        const items = response.items ?? [];
        if (city || state) {
          setPublicCommunities(items);
        } else {
          const unique = new Map<string, (typeof items)[number]>();
          items.forEach((item) => {
            if (!unique.has(item.community_name)) {
              unique.set(item.community_name, item);
            }
          });
          setPublicCommunities(Array.from(unique.values()));
        }
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
          : "Falha ao carregar comunidades.";
        setPublicCommunitiesError(message);
        setPublicCommunities([]);
      } finally {
        setPublicCommunitiesLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    if (!isPublicMode) {
      return;
    }
    void loadPublicCommunities(
      publicFilters.city || undefined,
      publicFilters.state || undefined
    );
  }, [
    isPublicMode,
    loadPublicCommunities,
    lastSyncAt,
    publicFilters.city,
    publicFilters.state,
  ]);

  useEffect(() => {
    if (!selectionActive || !mapRef.current) {
      return;
    }

    const googleMaps = getGoogleMaps();
    if (!googleMaps?.maps?.drawing) {
      return;
    }

    if (drawingManagerRef.current) {
      drawingManagerRef.current.setMap(null);
      drawingManagerRef.current = null;
    }

    const drawingManager = new googleMaps.maps.drawing.DrawingManager({
      drawingControl: false,
      drawingMode: googleMaps.maps.drawing.OverlayType.RECTANGLE,
      rectangleOptions: {
        fillColor: "#d7a344",
        fillOpacity: 0.18,
        strokeColor: "#b35a2d",
        strokeOpacity: 0.9,
        strokeWeight: 2,
        clickable: false,
        editable: false,
      },
    });

    drawingManager.setMap(mapRef.current);
    drawingManagerRef.current = drawingManager;

    const listener = googleMaps.maps.event.addListener(
      drawingManager,
      "rectanglecomplete",
      (rectangle: google.maps.Rectangle) => {
        if (rectangleRef.current) {
          rectangleRef.current.setMap(null);
        }
        rectangleRef.current = rectangle;
        const bounds = rectangle.getBounds();
        if (!bounds) {
          return;
        }
        const northEast = bounds.getNorthEast();
        const southWest = bounds.getSouthWest();
        setSelectedBounds({
          north: northEast.lat(),
          east: northEast.lng(),
          south: southWest.lat(),
          west: southWest.lng(),
        });
        setSelectionActive(false);
        setReportStatus("idle");
        setReportFeedback(null);
      }
    );

    return () => {
      listener.remove();
      drawingManager.setMap(null);
      drawingManagerRef.current = null;
    };
  }, [getGoogleMaps, selectionActive]);

  useEffect(() => {
    return () => {
      if (idleListenerRef.current) {
        idleListenerRef.current.remove();
      }
      if (fetchTimeoutRef.current) {
        window.clearTimeout(fetchTimeoutRef.current);
      }
    };
  }, []);


  useEffect(() => {
    if (!mapRef.current) {
      return;
    }
    mapRef.current.setOptions({
      draggableCursor: selectionActive ? "crosshair" : null,
    });
  }, [selectionActive]);

  useEffect(() => {
    ChartJS.register(
      ArcElement,
      BarElement,
      CategoryScale,
      LinearScale,
      Tooltip,
      Legend
    );
  }, []);

  const statusChart = useMemo(() => {
    const items = reportBreakdown?.status ?? [];
    return {
      labels: items.map((item) => item.status),
      datasets: [
        {
          label: "Pontos",
          data: items.map((item) => item.count),
          backgroundColor: ["#4a2d1b", "#b35a2d", "#d7a344"],
        },
      ],
    };
  }, [reportBreakdown]);

  const precisionChart = useMemo(() => {
    const items = reportBreakdown?.precision ?? [];
    return {
      labels: items.map((item) => item.precision),
      datasets: [
        {
          label: "Pontos",
          data: items.map((item) => item.count),
          backgroundColor: "#4a2d1b",
        },
      ],
    };
  }, [reportBreakdown]);

  const scoreLabels = useMemo(
    () => Array.from({ length: 10 }, (_, index) => `${index + 1}`),
    []
  );
  const parseMetricValue = (value?: number | string | null) => {
    if (value === null || value === undefined) return 0;
    const parsed = typeof value === "string" ? Number(value) : value;
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const buildScoreChart = useCallback(
    (label: string, data?: number[], color = "#4a2d1b") => ({
      labels: scoreLabels,
      datasets: [
        {
          label,
          data: data && data.length === scoreLabels.length ? data : scoreLabels.map(() => 0),
          backgroundColor: color,
        },
      ],
    }),
    [scoreLabels]
  );

  const healthChart = useMemo(
    () =>
      buildScoreChart(
        "Saúde",
        reportIndicatorScores?.health,
        "#3f7f5a"
      ),
    [buildScoreChart, reportIndicatorScores]
  );
  const educationChart = useMemo(
    () =>
      buildScoreChart(
        "Educação",
        reportIndicatorScores?.education,
        "#395fa3"
      ),
    [buildScoreChart, reportIndicatorScores]
  );
  const securityChart = useMemo(
    () =>
      buildScoreChart(
        "Segurança",
        reportIndicatorScores?.security,
        "#a33a3a"
      ),
    [buildScoreChart, reportIndicatorScores]
  );
  const indicatorsPie = useMemo(() => {
    if (!reportIndicators) return null;
    const values = [
      parseMetricValue(reportIndicators.health_avg),
      parseMetricValue(reportIndicators.education_avg),
      parseMetricValue(reportIndicators.income_avg),
      parseMetricValue(reportIndicators.housing_avg),
      parseMetricValue(reportIndicators.security_avg),
    ];
    const total = values.reduce((sum, value) => sum + value, 0);
    if (!total) return null;
    return {
      labels: ["Saúde", "Educação", "Renda", "Moradia", "Segurança"],
      datasets: [
        {
          label: "Média",
          data: values,
          backgroundColor: [
            "#3f7f5a",
            "#395fa3",
            "#c9783a",
            "#8b5a2b",
            "#a33a3a",
          ],
        },
      ],
    };
  }, [reportIndicators]);
  const hasScoreData = useMemo(() => {
    const health = reportIndicatorScores?.health ?? [];
    const education = reportIndicatorScores?.education ?? [];
    const security = reportIndicatorScores?.security ?? [];
    return (
      health.some((value) => value > 0) ||
      education.some((value) => value > 0) ||
      security.some((value) => value > 0)
    );
  }, [reportIndicatorScores]);

  const canGenerateReport = Boolean(
    selectedBounds ||
      appliedFilters.city.trim() ||
      appliedFilters.state.trim() ||
      appliedFilters.region.trim()
  );

  return (
    <section className="map-section" id="relatorios">
      <div className="map-grid">
        {isPublicMode ? (
          <aside className="map-filters">
            <div className="filter-block">
              <span className="eyebrow">Navegação</span>
              <h3>Mapa público</h3>
              <p>
                Navegue pelos pontos cadastrados e filtre por estado, cidade ou
                comunidade.
              </p>
            </div>

            <div className="filter-block">
              <span className="eyebrow">Filtros</span>
              <label className="filter-label">Estado</label>
              <select
                className="select"
                value={publicFilters.state}
                onChange={(event) => handlePublicStateChange(event.target.value)}
              >
                <option value="">Selecione um estado</option>
                {BRAZIL_STATES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code} - {item.name}
                  </option>
                ))}
              </select>
              <label className="filter-label">Cidade</label>
              <select
                className="select"
                value={selectedPublicCityValue}
                onChange={(event) => handlePublicCityChange(event.target.value)}
              >
                <option value="">Selecione uma cidade</option>
                {filteredCities.map((city) => (
                  <option
                    key={`${city.name}-${city.state}`}
                    value={`${city.name}__${city.state}`}
                  >
                    {city.name} ({city.state})
                  </option>
                ))}
              </select>
              <label className="filter-label">Comunidade</label>
              <select
                className="select"
                value={publicFilters.community}
                onChange={(event) => handlePublicCommunityChange(event.target.value)}
                disabled={publicCommunitiesLoading}
              >
                <option value="">Selecione uma comunidade</option>
                {publicCommunities.map((item) => (
                  <option
                    key={`${item.community_name}-${item.city}-${item.state}`}
                    value={item.community_name}
                  >
                    {item.community_name}
                  </option>
                ))}
              </select>
              {publicCommunitiesError && (
                <div className="alert">{publicCommunitiesError}</div>
              )}
              {publicFilters.community && (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => handlePublicCommunityChange("")}
                >
                  Limpar comunidade
                </button>
              )}
            </div>
          </aside>
        ) : (
          <MapFilters
            selectionActive={selectionActive}
            selectedBounds={selectedBounds}
            reportReady={reportStatus === "ready"}
            reportLoading={reportLoading}
            canGenerateReport={canGenerateReport}
            reportFormat={reportFormat}
            reportName={reportName}
            includeIndicators={reportInclude.indicators}
            includePoints={reportInclude.points}
            includeNarratives={reportInclude.narratives}
            statusFilter={filterDraft.status}
            precisionFilter={filterDraft.precision}
            updatedWithinDays={filterDraft.updatedWithinDays}
            cityFilter={filterDraft.city}
            stateFilter={filterDraft.state}
            regionFilter={filterDraft.region}
            onReportFormatChange={setReportFormat}
            onReportNameChange={setReportName}
            onIncludeChange={handleIncludeChange}
            onStartSelection={toggleSelection}
            onUseViewport={useViewportBounds}
            onClearSelection={clearSelection}
            onGenerateReport={handleGenerateReport}
            onStatusFilterChange={handleStatusFilterChange}
            onPrecisionFilterChange={handlePrecisionFilterChange}
            onUpdatedFilterChange={handleUpdatedFilterChange}
            onCityFilterChange={(value) =>
              setFilterDraft((current) => ({ ...current, city: value }))
            }
            onStateFilterChange={(value) =>
              setFilterDraft((current) => ({ ...current, state: value }))
            }
            onRegionFilterChange={(value) =>
              setFilterDraft((current) => ({ ...current, region: value }))
            }
            onApplyFilters={handleApplyFilters}
          />
        )}
        <div className="map-area">
          <div className="map-header">
            <div>
              <span className="eyebrow">
                {isPublicMode ? "Mapa público" : "Mapa e relatórios"}
              </span>
              <h2>
                {isPublicMode
                  ? "Navegação por cidade e comunidade"
                  : "Navegação pública com seleção de áreas"}
              </h2>
            </div>
            <div className="map-actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={handleRefreshArea}
                disabled={pointsLoading}
              >
                Atualizar área
              </button>
              {!isPublicMode && (
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={!canGenerateReport || reportLoading}
                  onClick={handleExportReport}
                >
                  Exportar relatório
                </button>
              )}
            </div>
          </div>
          <MapShell
            points={mapPoints}
            center={defaultCenter}
            zoom={4}
            libraries={isPublicMode ? [] : ["drawing"]}
            onMapReady={handleMapReady}
          />
          <div className="map-info-grid">
            <div className="info-card">
              <span className="eyebrow">Informações</span>
              <h3>Pontos públicos</h3>
              {pointsLoading ? (
                <p className="muted">Carregando pontos da área atual.</p>
              ) : pointsError ? (
                <div className="alert">{pointsError}</div>
              ) : (
                <p className="muted">
                  {mapPoints.length === 0
                    ? "Nenhum ponto publicado para a área atual."
                    : `${mapPoints.length} pontos disponíveis na área.`}
                </p>
              )}
              {lastSyncAt && (
                <p className="muted">Última atualização: {lastSyncAt}</p>
              )}
              {!lastSyncAt && (
                <p className="muted">Dados públicos sincronizados diariamente.</p>
              )}
            </div>
            {!isPublicMode && (
              <>
                <div className="info-card">
                  <span className="eyebrow">Relatório</span>
                  <h3>Status da seleção</h3>
                  <p className="muted">
                    {selectedBounds
                      ? "Área pronta para gerar relatório."
                      : "Selecione uma área no mapa para iniciar."}
                  </p>
                  {reportLoading && (
                    <p className="muted">Gerando relatório agregado...</p>
                  )}
                  {reportError && <div className="alert">{reportError}</div>}
                  {reportSummary && (
                    <div className="summary-grid">
                      <div>
                        <span>Pontos</span>
                        <strong>{reportSummary.points ?? 0}</strong>
                      </div>
                      <div>
                        <span>Residentes</span>
                        <strong>{reportSummary.residents ?? 0}</strong>
                      </div>
                    </div>
                  )}
                  {reportStatus === "ready" && (
                    <div className="report-ready">
                      Relatório pronto para exportar.
                    </div>
                  )}
                  {reportFeedback && (
                    <div className="report-ready">{reportFeedback}</div>
                  )}
                </div>
                <div className="info-card">
                  <span className="eyebrow">Gráfico</span>
                  <h3>Status dos pontos</h3>
                  {reportBreakdown?.status && reportBreakdown.status.length > 0 ? (
                    <Pie data={statusChart} />
                  ) : (
                    <p className="muted">Gere o relatório para visualizar.</p>
                  )}
                </div>
                <div className="info-card">
                  <span className="eyebrow">Gráfico</span>
                  <h3>Precisão dos pontos</h3>
                  {reportBreakdown?.precision &&
                  reportBreakdown.precision.length > 0 ? (
                    <Bar data={precisionChart} />
                  ) : (
                    <p className="muted">Gere o relatório para visualizar.</p>
                  )}
                </div>
                {reportInclude.indicators && (
                  <>
                    <div className="info-card">
                      <span className="eyebrow">Gráfico</span>
                      <h3>Saúde (1-10)</h3>
                      {hasScoreData ? (
                        <Bar data={healthChart} />
                      ) : (
                        <p className="muted">Gere o relatório para visualizar.</p>
                      )}
                    </div>
                    <div className="info-card">
                      <span className="eyebrow">Gráfico</span>
                      <h3>Educação (1-10)</h3>
                      {hasScoreData ? (
                        <Bar data={educationChart} />
                      ) : (
                        <p className="muted">Gere o relatório para visualizar.</p>
                      )}
                    </div>
                    <div className="info-card">
                      <span className="eyebrow">Gráfico</span>
                      <h3>Segurança (1-10)</h3>
                      {hasScoreData ? (
                        <Bar data={securityChart} />
                      ) : (
                        <p className="muted">Gere o relatório para visualizar.</p>
                      )}
                    </div>
                    <div className="info-card">
                      <span className="eyebrow">Gráfico</span>
                      <h3>Condição média</h3>
                      {indicatorsPie ? (
                        <Pie data={indicatorsPie} />
                      ) : (
                        <p className="muted">Gere o relatório para visualizar.</p>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
          {!isPublicMode && (
            <div className="info-card" style={{ marginTop: "1.5rem" }}>
              <span className="eyebrow">Tabela</span>
              <h3>Resumo por cidade e estado</h3>
              {reportBreakdown?.by_city?.length ||
              reportBreakdown?.by_state?.length ? (
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Tipo</th>
                        <th>Local</th>
                        <th>Quantidade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(reportBreakdown?.by_city ?? []).map((item) => (
                        <tr key={`city-${item.city}`}>
                          <td>Cidade</td>
                          <td>{item.city}</td>
                          <td>{item.count}</td>
                        </tr>
                      ))}
                      {(reportBreakdown?.by_state ?? []).map((item) => (
                        <tr key={`state-${item.state}`}>
                          <td>Estado</td>
                          <td>{item.state}</td>
                          <td>{item.count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="muted">Gere o relatório para ver a tabela.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
