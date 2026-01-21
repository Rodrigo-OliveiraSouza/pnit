type Bounds = {
  north: number;
  south: number;
  east: number;
  west: number;
};

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
  searchValue: string;
  searchFeedback: string | null;
  statusFilter: "all" | "active" | "inactive";
  precisionFilter: "all" | "approx" | "exact";
  updatedWithinDays: number | null;
  cityFilter: string;
  stateFilter: string;
  regionFilter: string;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
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
  searchValue,
  searchFeedback,
  statusFilter,
  precisionFilter,
  updatedWithinDays,
  cityFilter,
  stateFilter,
  regionFilter,
  onSearchChange,
  onSearchSubmit,
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

  return (
    <aside className="map-filters">
      <div className="filter-block">
        <span className="eyebrow">Navegacao</span>
        <h3>Mapa publico</h3>
        <p>
          Navegue pelo mapa, selecione uma area e gere relatorios agregados sem
          dados sensiveis.
        </p>
        <label className="filter-label">Busca territorial</label>
        <div className="search-row">
          <input
            type="search"
            placeholder="Buscar por endereco ou regiao"
            value={searchValue}
            onChange={(event) => onSearchChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                onSearchSubmit();
              }
            }}
          />
          <button className="btn btn-outline" type="button" onClick={onSearchSubmit}>
            Buscar
          </button>
        </div>
        {searchFeedback && (
          <div className="search-feedback">{searchFeedback}</div>
        )}
      </div>

      <div className="filter-block">
        <span className="eyebrow">Selecao</span>
        <h4>Area para relatorio</h4>
        <div className="action-stack">
          <button
            className={`btn ${selectionActive ? "btn-primary" : "btn-outline"}`}
            type="button"
            onClick={onStartSelection}
          >
            {selectionActive ? "Selecione no mapa" : "Selecionar area"}
          </button>
          <button className="btn btn-outline" type="button" onClick={onUseViewport}>
            Usar area visivel
          </button>
          <button className="btn btn-ghost" type="button" onClick={onClearSelection}>
            Limpar selecao
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
          <p className="muted">Nenhuma area selecionada.</p>
        )}
      </div>

      <div className="filter-block">
        <span className="eyebrow">Relatorio</span>
        <label className="filter-label">Nome do relatorio</label>
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
            Pontos publicos
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
          {reportLoading ? "Gerando..." : "Gerar relatorio"}
        </button>
        {reportReady && (
          <div className="report-ready">
            Relatorio gerado. Revise os dados antes de exportar.
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
        <label className="filter-label">Precisao</label>
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
        <input
          type="text"
          placeholder="Ex.: Cruz das Almas"
          value={cityFilter}
          onChange={(event) => onCityFilterChange(event.target.value)}
        />
        <label className="filter-label">Estado</label>
        <input
          type="text"
          placeholder="UF"
          value={stateFilter}
          onChange={(event) => onStateFilterChange(event.target.value)}
        />
        <label className="filter-label">Regiao</label>
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
