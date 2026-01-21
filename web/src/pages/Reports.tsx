import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PublicMapSection from "../components/PublicMapSection";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";
import { exportReport, fetchUserSummary, getAuthToken } from "../services/api";

export default function Reports() {
  const isLoggedIn = Boolean(getAuthToken());
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [exportFormat, setExportFormat] = useState<"PDF" | "CSV" | "JSON">("PDF");
  const [exportName, setExportName] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [userSummary, setUserSummary] = useState<{
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
  } | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  type BrazilCity = { name: string; state: string };
  const BRAZIL_CITIES = citiesData as BrazilCity[];
  const availableCities = useMemo(() => {
    if (!filterState) return BRAZIL_CITIES;
    return BRAZIL_CITIES.filter((city) => city.state === filterState);
  }, [BRAZIL_CITIES, filterState]);
  const selectedCityValue =
    filterCity && filterState ? `${filterCity}__${filterState}` : "";
  const filteredResidents = useMemo(() => {
    if (!userSummary?.residents) {
      return [];
    }
    return userSummary.residents.filter((resident) => {
      const matchesState = !filterState || resident.state === filterState;
      const matchesCity = !filterCity || resident.city === filterCity;
      return matchesState && matchesCity;
    });
  }, [filterCity, filterState, userSummary]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }
    fetchUserSummary()
      .then((response) => setUserSummary(response))
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Falha ao carregar relatorio.";
        setSummaryError(message);
      });
  }, [isLoggedIn]);

  const handleCityChange = (value: string) => {
    if (!value) {
      setFilterCity("");
      return;
    }
    const [city, state] = value.split("__");
    setFilterState(state);
    setFilterCity(city);
  };

  const handleStateChange = (value: string) => {
    setFilterState(value);
    setFilterCity("");
  };

  const handleExportUserReport = async () => {
    if (!filterState || !filterCity) {
      setExportFeedback("Selecione cidade e estado para exportar.");
      return;
    }
    setExportLoading(true);
    setExportFeedback(null);
    try {
      const response = await exportReport({
        format: exportFormat,
        filters: {
          city: filterCity,
          state: filterState,
        },
      });
      const contentType = response.content_type ?? "text/plain";
      const safeName = exportName
        .trim()
        .replace(/[^a-zA-Z0-9-_]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
      const fallbackName = `relatorio-${new Date()
        .toISOString()
        .replace(/[:.]/g, "-")}`;
      const filename =
        response.filename ??
        `${safeName || fallbackName}.${exportFormat.toLowerCase()}`;
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
      setExportFeedback("Nao foi possivel exportar o relatorio.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao exportar relatorio.";
      setExportFeedback(message);
    } finally {
      setExportLoading(false);
    }
  };

  if (!isLoggedIn) {
    return (
      <div className="page">
        <section className="public-hero">
          <div>
            <span className="eyebrow">Relatorios</span>
            <h1>Acesso restrito</h1>
            <p className="lead">
              Entre no painel para acessar relatorios territoriais completos.
            </p>
            <Link className="btn btn-primary" to="/login">
              Entrar no painel
            </Link>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="public-hero">
        <div>
          <span className="eyebrow">Relatorios</span>
          <h1>Selecione areas e gere relatorios territoriais</h1>
          <p className="lead">
            Use o mapa interativo para recortar areas e exportar dados publicos
            em diferentes formatos.
          </p>
        </div>
      </section>
      <PublicMapSection mode="reports" />
      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Relatorio individual</span>
          <h2>Resumo do usuario logado</h2>
          <p className="muted">
            Consolidado de cadastros, medias e distribuicao mensal.
          </p>
        </div>
        <div className="form-row" style={{ alignItems: "flex-end" }}>
          <label>
            Estado
            <select
              className="select"
              value={filterState}
              onChange={(event) => handleStateChange(event.target.value)}
            >
              <option value="">Selecione um estado</option>
              {BRAZIL_STATES.map((state) => (
                <option key={state.code} value={state.code}>
                  {state.code} - {state.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cidade
            <select
              className="select"
              value={selectedCityValue}
              onChange={(event) => handleCityChange(event.target.value)}
            >
              <option value="">Selecione uma cidade</option>
              {availableCities.map((city) => (
                <option
                  key={`${city.name}-${city.state}`}
                  value={`${city.name}__${city.state}`}
                >
                  {city.name} ({city.state})
                </option>
              ))}
            </select>
          </label>
          <label>
            Formato
            <select
              className="select"
              value={exportFormat}
              onChange={(event) =>
                setExportFormat(event.target.value as "PDF" | "CSV" | "JSON")
              }
            >
              <option value="PDF">PDF</option>
              <option value="CSV">CSV</option>
              <option value="JSON">JSON</option>
            </select>
          </label>
          <label>
            Nome do arquivo
            <input
              type="text"
              placeholder="relatorio-cidade"
              value={exportName}
              onChange={(event) => setExportName(event.target.value)}
            />
          </label>
          <button
            className="btn btn-primary"
            type="button"
            onClick={handleExportUserReport}
            disabled={exportLoading}
          >
            {exportLoading ? "Exportando..." : "Exportar pontos filtrados"}
          </button>
        </div>
        {exportFeedback && <div className="alert">{exportFeedback}</div>}
        {summaryError && <div className="alert">{summaryError}</div>}
        {userSummary && (
          <>
            <div className="info-grid">
              <div className="info-card">
                <h3>Total de cadastros</h3>
                <p className="muted">
                  {userSummary.summary?.total_residents ?? 0} registros
                </p>
              </div>
              <div className="info-card">
                <h3>Usuarios ativos</h3>
                <p className="muted">
                  {userSummary.active_users ?? "Disponivel para admins"}
                </p>
              </div>
            </div>
            <div className="info-grid">
              <div className="info-card">
                <h3>Medias dos indicadores</h3>
                <div className="summary-grid">
                  <div>
                    <span>Saude</span>
                    <strong>{userSummary.averages?.health_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Educacao</span>
                    <strong>{userSummary.averages?.education_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Renda</span>
                    <strong>{userSummary.averages?.income_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Renda media (R$)</span>
                    <strong>
                      {userSummary.averages?.income_monthly ?? "-"}
                    </strong>
                  </div>
                  <div>
                    <span>Moradia</span>
                    <strong>{userSummary.averages?.housing_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Seguranca</span>
                    <strong>{userSummary.averages?.security_score ?? "-"}</strong>
                  </div>
                </div>
              </div>
              <div className="info-card">
                <h3>Cadastros por mes</h3>
                {userSummary.monthly && userSummary.monthly.length > 0 ? (
                  <ul className="activity-list">
                    {userSummary.monthly.map((item) => (
                      <li key={item.month} className="empty-row">
                        {item.month}: {item.total}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">Nenhum registro mensal ainda.</p>
                )}
              </div>
            </div>
            <div className="table-card">
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Nome</th>
                    <th>Cidade</th>
                    <th>Estado</th>
                    <th>Status</th>
                    <th>Criado em</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResidents.length > 0 ? (
                    filteredResidents.map((resident) => (
                      <tr key={resident.id}>
                        <td>{resident.id}</td>
                        <td>{resident.full_name}</td>
                        <td>{resident.city ?? "-"}</td>
                        <td>{resident.state ?? "-"}</td>
                        <td>{resident.status}</td>
                        <td>
                          {new Date(resident.created_at).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6}>
                        <div className="table-empty">
                          Nenhum cadastro registrado ainda.
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
