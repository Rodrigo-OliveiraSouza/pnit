import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import PublicMapSection from "../components/PublicMapSection";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";
import {
  exportReport,
  fetchUserSummary,
  getAuthToken,
  type UserSummaryResponse,
} from "../services/api";

export default function Reports() {
  const isLoggedIn = Boolean(getAuthToken());
  const formatBool = (value?: boolean | null) =>
    value === null || value === undefined ? "-" : value ? "Sim" : "Não";
  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [exportFormat, setExportFormat] = useState<"PDF" | "CSV" | "JSON">("PDF");
  const [exportName, setExportName] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [userSummary, setUserSummary] = useState<UserSummaryResponse | null>(
    null
  );
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
          error instanceof Error ? error.message : "Falha ao carregar relatório.";
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
      setExportFeedback("Não foi possível exportar o relatório.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao exportar relatório.";
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
            <span className="eyebrow">Relatórios</span>
            <h1>Acesso restrito</h1>
            <p className="lead">
              Entre no painel para acessar relatórios territoriais completos.
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
          <span className="eyebrow">Relatórios</span>
          <h1>Selecione áreas e gere relatórios territoriais</h1>
          <p className="lead">
            Use o mapa interativo para recortar áreas e exportar dados públicos
            em diferentes formatos.
          </p>
        </div>
      </section>
      <PublicMapSection mode="reports" />
      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Relatório individual</span>
          <h2>Resumo do usuário logado</h2>
          <p className="muted">
            Consolidado de cadastros, médias e distribuição mensal.
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
                <h3>Usuários ativos</h3>
                <p className="muted">
                  {userSummary.active_users ?? "Disponível para admins"}
                </p>
              </div>
            </div>
            <div className="info-grid">
              <div className="info-card">
                <h3>Médias dos indicadores</h3>
                <div className="summary-grid">
                  <div>
                    <span>Saúde</span>
                    <strong>{userSummary.averages?.health_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Educação</span>
                    <strong>{userSummary.averages?.education_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Renda</span>
                    <strong>{userSummary.averages?.income_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Renda média (R$)</span>
                    <strong>
                      {userSummary.averages?.income_monthly ?? "-"}
                    </strong>
                  </div>
                  <div>
                    <span>Moradia</span>
                    <strong>{userSummary.averages?.housing_score ?? "-"}</strong>
                  </div>
                  <div>
                    <span>Segurança</span>
                    <strong>{userSummary.averages?.security_score ?? "-"}</strong>
                  </div>
                </div>
              </div>
              <div className="info-card">
                <h3>Cadastros por mês</h3>
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
                    <th>Comunidade</th>
                    <th>Cidade</th>
                    <th>Estado</th>
                    <th>Bairro</th>
                    <th>Moradores</th>
                    <th>Status</th>
                    <th>Criado em</th>
                    <th>Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResidents.length > 0 ? (
                    filteredResidents.map((resident) => (
                      <tr key={resident.id}>
                        <td>{resident.id}</td>
                        <td>{resident.full_name}</td>
                        <td>{resident.community_name ?? "-"}</td>
                        <td>{resident.city ?? "-"}</td>
                        <td>{resident.state ?? "-"}</td>
                        <td>{resident.neighborhood ?? "-"}</td>
                        <td>{resident.household_size ?? "-"}</td>
                        <td>{resident.status}</td>
                        <td>
                          {new Date(resident.created_at).toLocaleDateString()}
                        </td>
                        <td>
                          <details>
                            <summary>Ver detalhes</summary>
                            <div className="details-grid">
                              <div>
                                <strong>Identificação</strong>
                                <p>CPF/RG: {resident.doc_id ?? "-"}</p>
                                <p>Nascimento: {resident.birth_date ?? "-"}</p>
                                <p>Sexo: {resident.sex ?? "-"}</p>
                                <p>Telefone: {resident.phone ?? "-"}</p>
                                <p>Email: {resident.email ?? "-"}</p>
                                <p>Endereço: {resident.address ?? "-"}</p>
                                <p>Crianças: {resident.children_count ?? "-"}</p>
                                <p>Idosos: {resident.elderly_count ?? "-"}</p>
                                <p>PCD: {resident.pcd_count ?? "-"}</p>
                              </div>
                              <div>
                                <strong>Localização</strong>
                                <p>Cidade: {resident.city ?? "-"}</p>
                                <p>Estado: {resident.state ?? "-"}</p>
                                <p>Bairro: {resident.neighborhood ?? "-"}</p>
                                <p>Área: {resident.point_area_type ?? "-"}</p>
                                <p>Referência: {resident.point_reference_point ?? "-"}</p>
                                <p>Precisão: {resident.point_precision ?? "-"}</p>
                              </div>
                              <div>
                                <strong>Infraestrutura</strong>
                                <p>Energia: {resident.energy_access ?? "-"}</p>
                                <p>Água: {resident.water_supply ?? "-"}</p>
                                <p>Tratamento: {resident.water_treatment ?? "-"}</p>
                                <p>Esgoto: {resident.sewage_type ?? "-"}</p>
                                <p>Lixo: {resident.garbage_collection ?? "-"}</p>
                                <p>Internet: {formatBool(resident.internet_access)}</p>
                                <p>Transporte: {formatBool(resident.transport_access)}</p>
                              </div>
                              <div>
                                <strong>Saúde e educação</strong>
                                <p>Posto: {formatBool(resident.health_has_clinic)}</p>
                                <p>Emergência: {formatBool(resident.health_has_emergency)}</p>
                                <p>Agente: {formatBool(resident.health_has_community_agent)}</p>
                                <p>Unidade (km): {resident.health_unit_distance_km ?? "-"}</p>
                                <p>Tempo: {resident.health_travel_time ?? "-"}</p>
                                <p>Regular: {formatBool(resident.health_has_regular_service)}</p>
                                <p>Ambulância: {formatBool(resident.health_has_ambulance)}</p>
                                <p>Dificuldades: {resident.health_difficulties ?? "-"}</p>
                                <p>Escolaridade: {resident.education_level ?? "-"}</p>
                                <p>Escola: {formatBool(resident.education_has_school)}</p>
                                <p>Transporte: {formatBool(resident.education_has_transport)}</p>
                                <p>Material: {formatBool(resident.education_material_support)}</p>
                                <p>Internet estudo: {formatBool(resident.education_has_internet)}</p>
                              </div>
                              <div>
                                <strong>Renda e moradia</strong>
                                <p>Renda: {resident.income_monthly ?? "-"}</p>
                                <p>Contribuintes: {resident.income_contributors ?? "-"}</p>
                                <p>Ocupação: {resident.income_occupation_type ?? "-"}</p>
                                <p>Programa social: {formatBool(resident.income_has_social_program)}</p>
                                <p>Qual: {resident.income_social_program ?? "-"}</p>
                                <p>Moradia: {resident.housing_type ?? "-"}</p>
                                <p>Quartos: {resident.housing_rooms ?? "-"}</p>
                                <p>Área (m2): {resident.housing_area_m2 ?? "-"}</p>
                                <p>Terreno (m2): {resident.housing_land_m2 ?? "-"}</p>
                                <p>Material: {resident.housing_material ?? "-"}</p>
                                <p>Banheiro: {formatBool(resident.housing_has_bathroom)}</p>
                                <p>Água tratada: {formatBool(resident.housing_has_water_treated)}</p>
                                <p>Condição: {resident.housing_condition ?? "-"}</p>
                                <p>Riscos: {resident.housing_risks ?? "-"}</p>
                              </div>
                              <div>
                                <strong>Segurança e participação</strong>
                                <p>Delegacia: {formatBool(resident.security_has_police_station)}</p>
                                <p>Patrulhamento: {formatBool(resident.security_has_patrol)}</p>
                                <p>Guarda: {formatBool(resident.security_has_guard)}</p>
                                <p>Ocorrências: {resident.security_occurrences ?? "-"}</p>
                                <p>Participação: {resident.participation_types ?? "-"}</p>
                                <p>Eventos: {resident.participation_events ?? "-"}</p>
                                <p>Engajamento: {resident.participation_engagement ?? "-"}</p>
                              </div>
                              <div>
                                <strong>Demandas e avaliação</strong>
                                <p>Demandas: {resident.demand_priorities ?? "-"}</p>
                                <p>Registros visuais: {resident.photo_types ?? "-"}</p>
                                <p>Vulnerabilidade: {resident.vulnerability_level ?? "-"}</p>
                                <p>Problemas: {resident.technical_issues ?? "-"}</p>
                                <p>Encaminhamentos: {resident.referrals ?? "-"}</p>
                                <p>Órgãos: {resident.agencies_contacted ?? "-"}</p>
                              </div>
                            </div>
                          </details>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10}>
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
