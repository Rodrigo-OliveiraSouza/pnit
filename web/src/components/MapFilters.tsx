import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";

type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

type BrazilCity = { name: string; state: string };
const BRAZIL_CITIES = citiesData as BrazilCity[];

type MapFiltersProps = {
  selectionActive: boolean;
  selectedBounds: Bounds | null;
  reportReady: boolean;
  reportLoading: boolean;
  canGenerateReport: boolean;
  reportFormat: "PDF" | "CSV" | "JSON";
  reportName: string;
  includeIndicators: boolean;
  includePoints: boolean;
  includeNarratives: boolean;
  statusFilter: "all" | "active" | "inactive";
  precisionFilter: "all" | "approx" | "exact";
  updatedWithinDays: number | null;
  cityFilter: string;
  stateFilter: string;
  regionFilter: string;
  onReportFormatChange: (value: "PDF" | "CSV" | "JSON") => void;
  onReportNameChange: (value: string) => void;
  onIncludeChange: (
    field: "indicators" | "points" | "narratives",
    value: boolean
  ) => void;
  onStartSelection: () => void;
  onUseViewport: () => void;
  onClearSelection: () => void;
  onGenerateReport: () => void;
  onStatusFilterChange: (value: "all" | "active" | "inactive") => void;
  onPrecisionFilterChange: (value: "all" | "approx" | "exact") => void;
  onUpdatedFilterChange: (value: number | null) => void;
  onCityFilterChange: (value: string) => void;
  onStateFilterChange: (value: string) => void;
  onRegionFilterChange: (value: string) => void;
  onApplyFilters: () => void;
};

function formatCoord(value: number) {
  return value.toFixed(5);
}

export default function MapFilters({
  selectionActive,
  selectedBounds,
  reportReady,
  reportLoading,
  canGenerateReport,
  reportFormat,
  reportName,
  includeIndicators,
  includePoints,
  includeNarratives,
  statusFilter,
  precisionFilter,
  updatedWithinDays,
  cityFilter,
  stateFilter,
  regionFilter,
  onReportFormatChange,
  onReportNameChange,
  onIncludeChange,
  onStartSelection,
  onUseViewport,
  onClearSelection,
  onGenerateReport,
  onStatusFilterChange,
  onPrecisionFilterChange,
  onUpdatedFilterChange,
  onCityFilterChange,
  onStateFilterChange,
  onRegionFilterChange,
  onApplyFilters,
}: MapFiltersProps) {
  const updatedValue = updatedWithinDays ? String(updatedWithinDays) : "all";
  const availableCities = stateFilter
    ? BRAZIL_CITIES.filter((city) => city.state === stateFilter)
    : BRAZIL_CITIES;
  const selectedCityValue =
    cityFilter && stateFilter ? `${cityFilter}__${stateFilter}` : "";

  const handleStateChange = (value: string) => {
    onStateFilterChange(value);
    onCityFilterChange("");
  };

  const handleCityChange = (value: string) => {
    if (!value) {
      onCityFilterChange("");
      return;
    }
    const [name, state] = value.split("__");
    onStateFilterChange(state);
    onCityFilterChange(name);
  };

  return (
    <aside className="map-filters">
      <div className="filter-block">
        <span className="eyebrow">Navegação</span>
        <h3>Mapa público</h3>
        <p>
          Navegue pelo mapa, selecione uma área e gere relatórios agregados sem
          dados sensíveis.
        </p>
      </div>

      <div className="filter-block">
        <span className="eyebrow">Seleção</span>
        <h4>Área para relatório</h4>
        <div className="action-stack">
          <button
            className={`btn ${selectionActive ? "btn-primary" : "btn-outline"}`}
            type="button"
            onClick={onStartSelection}
          >
            {selectionActive ? "Selecione no mapa" : "Selecionar área"}
          </button>
          <button className="btn btn-outline" type="button" onClick={onUseViewport}>
            Usar área visível
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClearSelection}>
            Limpar seleção
          </button>
        </div>
        {selectedBounds ? (
          <div className="selection-card">
            <div>
              <span>Norte</span>
              <strong>{formatCoord(selectedBounds.north)}</strong>
            </div>
            <div>
              <span>Sul</span>
              <strong>{formatCoord(selectedBounds.south)}</strong>
            </div>
            <div>
              <span>Leste</span>
              <strong>{formatCoord(selectedBounds.east)}</strong>
            </div>
            <div>
              <span>Oeste</span>
              <strong>{formatCoord(selectedBounds.west)}</strong>
            </div>
          </div>
        ) : (
          <p className="muted">Nenhuma área selecionada.</p>
        )}
      </div>

      <div className="filter-block">
        <label className="filter-label">Nome do relatório</label>
        <input
          type="text"
          value={reportName}
          onChange={(event) => onReportNameChange(event.target.value)}
        />
        <label className="filter-label">Formato</label>
        <select
          className="select"
          value={reportFormat}
          onChange={(event) =>
            onReportFormatChange(event.target.value as "PDF" | "CSV" | "JSON")
          }
        >
          <option value="PDF">PDF</option>
          <option value="CSV">CSV</option>
          <option value="JSON">JSON</option>
        </select>
        <label className="filter-label">Incluir</label>
        <div className="checkbox-list">
          <label>
            <input
              type="checkbox"
              checked={includeIndicators}
              onChange={(event) =>
                onIncludeChange("indicators", event.target.checked)
              }
            />{" "}
            Indicadores agregados
          </label>
          <label>
            <input
              type="checkbox"
              checked={includePoints}
              onChange={(event) =>
                onIncludeChange("points", event.target.checked)
              }
            />{" "}
            Pontos públicos
          </label>
          <label>
            <input
              type="checkbox"
              checked={includeNarratives}
              onChange={(event) =>
                onIncludeChange("narratives", event.target.checked)
              }
            />{" "}
            Narrativas territoriais
          </label>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={onGenerateReport}
          disabled={!canGenerateReport || reportLoading}
        >
          {reportLoading ? "Gerando..." : "Gerar relatório"}
        </button>
        {reportReady && (
          <div className="report-ready">
            Relatório gerado. Revise os dados antes de exportar.
          </div>
        )}
      </div>

      <div className="filter-block">
        <span className="eyebrow">Filtros</span>
        <label className="filter-label">Status</label>
        <div className="pill-group">
          <button
            className={`pill${statusFilter === "all" ? " is-active" : ""}`}
            type="button"
            onClick={() => onStatusFilterChange("all")}
          >
            Todos
          </button>
          <button
            className={`pill${statusFilter === "active" ? " is-active" : ""}`}
            type="button"
            onClick={() => onStatusFilterChange("active")}
          >
            Ativo
          </button>
          <button
            className={`pill${statusFilter === "inactive" ? " is-active" : ""}`}
            type="button"
            onClick={() => onStatusFilterChange("inactive")}
          >
            Inativo
          </button>
        </div>
        <label className="filter-label">Precisão</label>
        <div className="pill-group">
          <button
            className={`pill${precisionFilter === "all" ? " is-active" : ""}`}
            type="button"
            onClick={() => onPrecisionFilterChange("all")}
          >
            Todos
          </button>
          <button
            className={`pill${precisionFilter === "approx" ? " is-active" : ""}`}
            type="button"
            onClick={() => onPrecisionFilterChange("approx")}
          >
            Aproximado
          </button>
          <button
            className={`pill${precisionFilter === "exact" ? " is-active" : ""}`}
            type="button"
            onClick={() => onPrecisionFilterChange("exact")}
          >
            Exato (privado)
          </button>
        </div>
        <label className="filter-label">Atualizado</label>
        <select
          className="select"
          value={updatedValue}
          onChange={(event) => {
            const value = event.target.value;
            onUpdatedFilterChange(value === "all" ? null : Number(value));
          }}
        >
          <option value="all">Todos</option>
          <option value="7">Ultimos 7 dias</option>
          <option value="30">Ultimos 30 dias</option>
          <option value="90">Ultimos 90 dias</option>
        </select>
        <label className="filter-label">Cidade</label>
        <select
          className="select"
          value={selectedCityValue}
          onChange={(event) => handleCityChange(event.target.value)}
        >
          <option value="">Selecione uma cidade</option>
          {availableCities.map((city) => (
            <option key={`${city.name}-${city.state}`} value={`${city.name}__${city.state}`}>
              {city.name} ({city.state})
            </option>
          ))}
        </select>
        <label className="filter-label">Estado</label>
        <select
          className="select"
          value={stateFilter}
          onChange={(event) => handleStateChange(event.target.value)}
        >
          <option value="">Todos os estados</option>
          {BRAZIL_STATES.map((state) => (
            <option key={state.code} value={state.code}>
              {state.code} - {state.name}
            </option>
          ))}
        </select>
        <label className="filter-label">{"Territ\u00f3rio"}</label>
        <input
          type="text"
          placeholder="Norte, Centro, etc."
          value={regionFilter}
          onChange={(event) => onRegionFilterChange(event.target.value)}
        />
        <button className="btn btn-outline" type="button" onClick={onApplyFilters}>
          Aplicar filtros
        </button>
      </div>
    </aside>
  );
}
