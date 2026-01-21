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
import {
  exportReport,
  fetchPublicPoints,
  geocodeAddress,
  generateReportPreview,
  type PublicPointDto,
} from "../services/api";

const defaultCenter = { lat: -14.235, lng: -51.925 };

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
};

const emptyPoints: MapPoint[] = [];
const defaultFilters: PointFilters = {
  status: "all",
  precision: "all",
  updatedWithinDays: null,
  city: "",
  state: "",
  region: "",
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
    publicNote: point.public_note,
    photoUrl: point.photo_url ?? null,
  };
}

export default function PublicMapSection() {
  const [selectionActive, setSelectionActive] = useState(false);
  const [selectedBounds, setSelectedBounds] = useState<Bounds | null>(null);
  const [reportStatus, setReportStatus] = useState<ReportStatus>("idle");
  const [reportFormat, setReportFormat] = useState<ReportFormat>("PDF");
  const [reportName, setReportName] = useState("");
  const [reportFeedback, setReportFeedback] = useState<string | null>(null);
  const [reportSummary, setReportSummary] = useState<ReportSummary | null>(null);
  const [reportBreakdown, setReportBreakdown] =
    useState<ReportBreakdown | null>(null);
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
  const [searchValue, setSearchValue] = useState("");
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);
  const [filterDraft, setFilterDraft] =
    useState<PointFilters>(defaultFilters);
  const [appliedFilters, setAppliedFilters] =
    useState<PointFilters>(defaultFilters);
  const mapRef = useRef<google.maps.Map | null>(null);
  const rectangleRef = useRef<google.maps.Rectangle | null>(null);
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null);
  const idleListenerRef = useRef<google.maps.MapsEventListener | null>(null);
  const fetchTimeoutRef = useRef<number | null>(null);

  const getGoogleMaps = useCallback(
    () => (window as typeof window & { google?: typeof google }).google,
    []
  );

  const loadPointsForBounds = useCallback(async (
    bounds: google.maps.LatLngBounds,
    filtersOverride?: PointFilters
  ) => {
    const northEast = bounds.getNorthEast();
    const southWest = bounds.getSouthWest();
    const bbox = `${southWest.lng()},${southWest.lat()},${northEast.lng()},${northEast.lat()}`;
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
      });
      setMapPoints(response.items.map(mapPointFromApi));
      setLastSyncAt(response.last_sync_at ?? null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar pontos.";
      setPointsError(message);
    } finally {
      setPointsLoading(false);
    }
  }, [appliedFilters]);

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
          void loadPointsForBounds(bounds);
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
      setReportStatus("ready");
      return true;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao gerar relatorio.";
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
        setReportFeedback("Nao foi possivel exportar o relatorio.");
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Falha ao exportar relatorio.";
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
    void loadPointsForBounds(bounds);
  }, [loadPointsForBounds]);

  const handleSearchSubmit = useCallback(() => {
    const query = searchValue.trim();
    if (!query) {
      setSearchFeedback("Informe um endereco ou regiao.");
      return;
    }
    if (!mapRef.current) {
      setSearchFeedback("Mapa ainda carregando. Tente novamente.");
      return;
    }
    geocodeAddress(query)
      .then((response) => {
        mapRef.current?.panTo({ lat: response.lat, lng: response.lng });
        mapRef.current?.setZoom(12);
        setSearchFeedback(null);
      })
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Nao foi possivel localizar.";
        setSearchFeedback(message);
      });
  }, [searchValue]);

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

  const handleApplyFilters = useCallback(() => {
    setAppliedFilters(filterDraft);
    const bounds = mapRef.current?.getBounds();
    if (!bounds) {
      return;
    }
    void loadPointsForBounds(bounds, filterDraft);
  }, [filterDraft, loadPointsForBounds]);

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
    setSearchFeedback(null);
  }, [searchValue]);

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

  const canGenerateReport = Boolean(
    selectedBounds ||
      appliedFilters.city.trim() ||
      appliedFilters.state.trim() ||
      appliedFilters.region.trim()
  );

  return (
    <section className="map-section" id="relatorios">
      <div className="map-grid">
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
          searchValue={searchValue}
          searchFeedback={searchFeedback}
          statusFilter={filterDraft.status}
          precisionFilter={filterDraft.precision}
          updatedWithinDays={filterDraft.updatedWithinDays}
          cityFilter={filterDraft.city}
          stateFilter={filterDraft.state}
          regionFilter={filterDraft.region}
          onSearchChange={setSearchValue}
          onSearchSubmit={handleSearchSubmit}
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
        <div className="map-area">
          <div className="map-header">
            <div>
              <span className="eyebrow">Mapa e relatorios</span>
              <h2>Navegacao publica com selecao de areas</h2>
            </div>
            <div className="map-actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={handleRefreshArea}
                disabled={pointsLoading}
              >
                Atualizar area
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={!canGenerateReport || reportLoading}
                onClick={handleExportReport}
              >
                Exportar relatorio
              </button>
            </div>
          </div>
          <MapShell
            points={mapPoints}
            center={defaultCenter}
            zoom={4}
            libraries={["drawing"]}
            onMapReady={handleMapReady}
          />
          <div className="map-info-grid">
            <div className="info-card">
              <span className="eyebrow">Informacoes</span>
              <h3>Pontos publicos</h3>
              {pointsLoading ? (
                <p className="muted">Carregando pontos da area atual.</p>
              ) : pointsError ? (
                <div className="alert">{pointsError}</div>
              ) : (
                <p className="muted">
                  {mapPoints.length === 0
                    ? "Nenhum ponto publicado para a area atual."
                    : `${mapPoints.length} pontos disponiveis na area.`}
                </p>
              )}
              {lastSyncAt && (
                <p className="muted">Ultima atualizacao: {lastSyncAt}</p>
              )}
              {!lastSyncAt && (
                <p className="muted">Dados publicos sincronizados diariamente.</p>
              )}
            </div>
            <div className="info-card">
              <span className="eyebrow">Relatorio</span>
              <h3>Status da selecao</h3>
              <p className="muted">
                {selectedBounds
                  ? "Area pronta para gerar relatorio."
                  : "Selecione uma area no mapa para iniciar."}
              </p>
              {reportLoading && (
                <p className="muted">Gerando relatorio agregado...</p>
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
                <div className="report-ready">Relatorio pronto para exportar.</div>
              )}
              {reportFeedback && (
                <div className="report-ready">{reportFeedback}</div>
              )}
            </div>
            <div className="info-card">
              <span className="eyebrow">Grafico</span>
              <h3>Status dos pontos</h3>
              {reportBreakdown?.status && reportBreakdown.status.length > 0 ? (
                <Pie data={statusChart} />
              ) : (
                <p className="muted">Gere o relatorio para visualizar.</p>
              )}
            </div>
            <div className="info-card">
              <span className="eyebrow">Grafico</span>
              <h3>Precisao dos pontos</h3>
              {reportBreakdown?.precision &&
              reportBreakdown.precision.length > 0 ? (
                <Bar data={precisionChart} />
              ) : (
                <p className="muted">Gere o relatorio para visualizar.</p>
              )}
            </div>
          </div>
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
              <p className="muted">Gere o relatorio para ver a tabela.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
