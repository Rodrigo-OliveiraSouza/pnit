import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import NewsCarousel from "../components/NewsCarousel";
import PublicMapSection from "../components/PublicMapSection";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";
import {
  exportReport,
  fetchUserSummary,
  getAuthRole,
  getAuthToken,
  type UserRole,
  type UserSummaryResponse,
} from "../services/api";

type BrazilCity = { name: string; state: string };
type ResidentRecord = NonNullable<UserSummaryResponse["residents"]>[number];
type NumericResidentField =
  | "health_score"
  | "education_score"
  | "income_score"
  | "income_monthly"
  | "housing_score"
  | "security_score";

const BRAZIL_CITIES = citiesData as BrazilCity[];
const SCORE_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const MONTH_FORMATTER = new Intl.DateTimeFormat("pt-BR", {
  month: "short",
  year: "numeric",
});

const normalizeText = (value?: string | null) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const STATE_CODE_LOOKUP = new Map<string, string>(
  BRAZIL_STATES.flatMap((state) => [
    [normalizeText(state.code), state.code],
    [normalizeText(state.name), state.code],
  ])
);

const getStateCode = (value?: string | null) => {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) return "";
  return (
    STATE_CODE_LOOKUP.get(normalizedValue) ?? String(value).trim().toUpperCase()
  );
};

const getStateName = (code?: string | null) =>
  BRAZIL_STATES.find((state) => state.code === code)?.name ?? code ?? "";

const toNumber = (value?: string | number | null) => {
  if (value === null || value === undefined) return null;
  const numeric = Number(String(value).replace(",", "."));
  return Number.isFinite(numeric) ? numeric : null;
};

const formatScore = (value?: string | number | null) => {
  const numeric = toNumber(value);
  return numeric === null ? "-" : SCORE_FORMATTER.format(numeric);
};

const formatCurrency = (value?: string | number | null) => {
  const numeric = toNumber(value);
  return numeric === null ? "-" : CURRENCY_FORMATTER.format(numeric);
};

const getResidentAverage = (
  residents: ResidentRecord[],
  field: NumericResidentField
) => {
  const values = residents
    .map((resident) =>
      toNumber(resident[field] as string | number | null | undefined)
    )
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return values.reduce((total, value) => total + value, 0) / values.length;
};

const buildMonthlySeries = (residents: ResidentRecord[]) => {
  const totals = new Map<string, number>();

  residents.forEach((resident) => {
    if (!resident.created_at) return;
    const createdAt = new Date(resident.created_at);
    if (Number.isNaN(createdAt.getTime())) return;

    const key = `${createdAt.getFullYear()}-${String(
      createdAt.getMonth() + 1
    ).padStart(2, "0")}`;
    totals.set(key, (totals.get(key) ?? 0) + 1);
  });

  return Array.from(totals.entries())
    .sort((left, right) => right[0].localeCompare(left[0]))
    .slice(0, 12)
    .map(([month, total]) => ({ month, total }));
};

const formatMonthLabel = (value: string) => {
  const parsedDate = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }
  return MONTH_FORMATTER.format(parsedDate);
};

const getReportCopy = (role: UserRole | null) => {
  if (role === "admin") {
    return {
      title: "Resumo geral da plataforma",
      description:
        "Acompanhe os cadastros e indicadores disponíveis em toda a plataforma.",
      totalDescription: "Cobertura geral da plataforma.",
      activeUsersDescription: "Usuários ativos com acesso ao sistema.",
      emptyHint: "Ainda não há cadastros disponíveis para este recorte.",
    };
  }

  if (role === "manager" || role === "teacher") {
    return {
      title: "Resumo da rede vinculada",
      description:
        "Acompanhe os cadastros do seu perfil e dos usuários aprovados por você.",
      totalDescription: "Cobertura geral da sua rede vinculada.",
      activeUsersDescription: "Usuários ativos ligados ao seu perfil.",
      emptyHint: "Ainda não há cadastros aprovados ou criados neste escopo.",
    };
  }

  return {
    title: "Resumo do usuário logado",
    description:
      "Visão executiva do desempenho de cadastros e indicadores do seu perfil.",
    totalDescription: "Cobertura geral do seu perfil.",
    activeUsersDescription: "Disponível para perfis supervisores.",
    emptyHint: "Cadastre pessoas no painel para começar a visualizar indicadores.",
  };
};

export default function Reports() {
  const isLoggedIn = Boolean(getAuthToken());
  const authRole = getAuthRole();
  const reportCopy = getReportCopy(authRole);

  const formatBool = (value?: boolean | null) =>
    value === null || value === undefined ? "-" : value ? "Sim" : "Não";

  const [filterState, setFilterState] = useState("");
  const [filterCity, setFilterCity] = useState("");
  const [exportFormat, setExportFormat] = useState<"PDF" | "CSV" | "JSON">(
    "PDF"
  );
  const [exportName, setExportName] = useState("");
  const [exportLoading, setExportLoading] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const [userSummary, setUserSummary] = useState<UserSummaryResponse | null>(
    null
  );
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  const allResidents = userSummary?.residents ?? [];
  const availableStates = useMemo(() => {
    const codes = new Set(
      allResidents
        .map((resident) => getStateCode(resident.state))
        .filter((value): value is string => Boolean(value))
    );

    if (codes.size === 0) {
      return BRAZIL_STATES;
    }

    return BRAZIL_STATES.filter((state) => codes.has(state.code));
  }, [allResidents]);

  const availableCities = useMemo(() => {
    if (!filterState) {
      return [];
    }

    const residentsCities = new Map<string, BrazilCity>();
    allResidents.forEach((resident) => {
      const residentState = getStateCode(resident.state);
      const residentCity = resident.city?.trim();
      if (!residentCity || residentState !== filterState) {
        return;
      }

      const key = `${normalizeText(residentCity)}__${residentState}`;
      residentsCities.set(key, { name: residentCity, state: residentState });
    });

    if (residentsCities.size > 0) {
      return Array.from(residentsCities.values()).sort((left, right) =>
        left.name.localeCompare(right.name, "pt-BR")
      );
    }

    return BRAZIL_CITIES.filter((city) => city.state === filterState).sort(
      (left, right) => left.name.localeCompare(right.name, "pt-BR")
    );
  }, [allResidents, filterState]);

  const availableCityCount = useMemo(() => {
    const cityKeys = new Set<string>();

    allResidents.forEach((resident) => {
      const residentState = getStateCode(resident.state);
      const residentCity = resident.city?.trim();
      if (!residentState || !residentCity) {
        return;
      }

      cityKeys.add(`${normalizeText(residentCity)}__${residentState}`);
    });

    return cityKeys.size;
  }, [allResidents]);

  const selectedCityValue =
    filterCity && filterState ? `${filterCity}__${filterState}` : "";
  const filteredResidents = useMemo(
    () =>
      allResidents.filter((resident) => {
        const residentState = getStateCode(resident.state);
        const residentCity = normalizeText(resident.city);
        const matchesState = !filterState || residentState === filterState;
        const matchesCity =
          !filterCity || residentCity === normalizeText(filterCity);

        return matchesState && matchesCity;
      }),
    [allResidents, filterCity, filterState]
  );

  const hasActiveFilters = Boolean(filterState || filterCity);
  const indicatorSummary = useMemo(() => {
    const fallbackAverages = {
      health: getResidentAverage(allResidents, "health_score"),
      education: getResidentAverage(allResidents, "education_score"),
      income: getResidentAverage(allResidents, "income_score"),
      incomeMonthly: getResidentAverage(allResidents, "income_monthly"),
      housing: getResidentAverage(allResidents, "housing_score"),
      security: getResidentAverage(allResidents, "security_score"),
    };

    if (!hasActiveFilters) {
      return {
        health: formatScore(
          userSummary?.averages?.health_score ?? fallbackAverages.health
        ),
        education: formatScore(
          userSummary?.averages?.education_score ?? fallbackAverages.education
        ),
        income: formatScore(
          userSummary?.averages?.income_score ?? fallbackAverages.income
        ),
        incomeMonthly: formatCurrency(
          userSummary?.averages?.income_monthly ?? fallbackAverages.incomeMonthly
        ),
        housing: formatScore(
          userSummary?.averages?.housing_score ?? fallbackAverages.housing
        ),
        security: formatScore(
          userSummary?.averages?.security_score ?? fallbackAverages.security
        ),
      };
    }

    return {
      health: formatScore(getResidentAverage(filteredResidents, "health_score")),
      education: formatScore(
        getResidentAverage(filteredResidents, "education_score")
      ),
      income: formatScore(getResidentAverage(filteredResidents, "income_score")),
      incomeMonthly: formatCurrency(
        getResidentAverage(filteredResidents, "income_monthly")
      ),
      housing: formatScore(
        getResidentAverage(filteredResidents, "housing_score")
      ),
      security: formatScore(
        getResidentAverage(filteredResidents, "security_score")
      ),
    };
  }, [allResidents, filteredResidents, hasActiveFilters, userSummary]);

  const monthlySeries = useMemo(
    () => buildMonthlySeries(filteredResidents),
    [filteredResidents]
  );
  const latestDate = useMemo(
    () =>
      filteredResidents.reduce((latest, resident) => {
        if (!resident.created_at) return latest;
        const current = new Date(resident.created_at);
        if (Number.isNaN(current.getTime())) return latest;
        if (!latest || current > latest) return current;
        return latest;
      }, null as Date | null),
    [filteredResidents]
  );

  const reportMeta = useMemo(() => {
    const stateLabel = filterState ? getStateName(filterState) : "";
    const activeUsers =
      typeof userSummary?.active_users === "number"
        ? String(userSummary.active_users)
        : authRole === "admin" || authRole === "manager" || authRole === "teacher"
          ? "-"
          : "Não disponível";

    return {
      totalResidents: userSummary?.summary?.total_residents ?? allResidents.length,
      filteredResidents: filteredResidents.length,
      activeUsers,
      lastUpdate: latestDate ? latestDate.toLocaleDateString("pt-BR") : "-",
      filterLabel:
        filterState && filterCity
          ? `${filterCity} / ${stateLabel}`
          : filterState
            ? stateLabel
            : "Todos os registros",
    };
  }, [
    allResidents.length,
    authRole,
    filterCity,
    filterState,
    filteredResidents.length,
    latestDate,
    userSummary,
  ]);

  const emptyState = useMemo(() => {
    if (summaryLoading) {
      return null;
    }

    if (allResidents.length === 0) {
      return {
        title: "Nenhum cadastro disponível neste escopo.",
        description: reportCopy.emptyHint,
      };
    }

    if (filteredResidents.length === 0) {
      return {
        title: "Nenhum cadastro encontrado para o filtro selecionado.",
        description:
          "Limpe os filtros ou escolha outro estado e cidade para visualizar os registros.",
      };
    }

    return null;
  }, [
    allResidents.length,
    filteredResidents.length,
    reportCopy.emptyHint,
    summaryLoading,
  ]);

  useEffect(() => {
    if (!isLoggedIn) {
      return;
    }

    setSummaryLoading(true);
    setSummaryError(null);

    fetchUserSummary()
      .then((response) => setUserSummary(response))
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Falha ao carregar relatório.";
        setSummaryError(message);
      })
      .finally(() => {
        setSummaryLoading(false);
      });
  }, [isLoggedIn]);

  useEffect(() => {
    if (!filterCity) {
      return;
    }

    const cityStillAvailable = availableCities.some(
      (city) => normalizeText(city.name) === normalizeText(filterCity)
    );

    if (!cityStillAvailable) {
      setFilterCity("");
    }
  }, [availableCities, filterCity]);

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
    setExportFeedback(null);
  };

  const handleClearFilters = () => {
    setFilterState("");
    setFilterCity("");
    setExportFeedback(null);
  };

  const handleExportUserReport = async () => {
    if (!filterState && !filterCity) {
      setExportFeedback("Selecione ao menos um estado para exportar o recorte.");
      return;
    }

    setExportLoading(true);
    setExportFeedback(null);

    try {
      const response = await exportReport({
        format: exportFormat,
        filters: {
          city: filterCity || undefined,
          state: filterState || undefined,
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
      <div className="page news-page">
        <section className="news-hero news-hero-media">
          <NewsCarousel
            className="news-carousel-hero news-carousel-media"
            imageOnly
            splitView={false}
            showDots={false}
            collection="reports"
          />
        </section>
        <div className="form-actions" style={{ marginTop: "1rem" }}>
          <Link className="btn btn-primary" to="/login">
            Entrar no painel
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="public-hero reports-hero">
        <div className="reports-hero-card">
          <span className="eyebrow">Relatórios</span>
          <h1>Selecione áreas e gere relatórios territoriais</h1>
          <p className="lead">
            Use o mapa interativo para recortar áreas e exportar dados públicos em
            diferentes formatos.
          </p>
        </div>
      </section>
      <PublicMapSection mode="reports" />
      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Relatório individual</span>
          <h2>{reportCopy.title}</h2>
          <p className="muted">{reportCopy.description}</p>
        </div>
        <div className="info-grid">
          <div className="info-card">
            <h3>Registros filtrados</h3>
            <p className="muted">{reportMeta.filteredResidents} registros</p>
            <p className="muted">Filtro: {reportMeta.filterLabel}</p>
          </div>
          <div className="info-card">
            <h3>Total de cadastros</h3>
            <p className="muted">{reportMeta.totalResidents} registros</p>
            <p className="muted">{reportCopy.totalDescription}</p>
          </div>
          <div className="info-card">
            <h3>Usuários ativos</h3>
            <p className="muted">{reportMeta.activeUsers}</p>
            <p className="muted">{reportCopy.activeUsersDescription}</p>
          </div>
          <div className="info-card">
            <h3>Última atualização</h3>
            <p className="muted">{reportMeta.lastUpdate}</p>
            <p className="muted">Dados mais recentes cadastrados no recorte.</p>
          </div>
        </div>
        <div className="form-row reports-filter-row">
          <label>
            Estado
            <select
              className="select"
              value={filterState}
              onChange={(event) => handleStateChange(event.target.value)}
            >
              <option value="">Selecione um estado</option>
              {availableStates.map((state) => (
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
              disabled={!filterState}
            >
              <option value="">
                {filterState
                  ? "Selecione uma cidade"
                  : "Selecione um estado primeiro"}
              </option>
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
              placeholder="relatorio-usuario"
              value={exportName}
              onChange={(event) => setExportName(event.target.value)}
            />
          </label>
          <div className="reports-filter-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={handleExportUserReport}
              disabled={exportLoading}
            >
              {exportLoading ? "Exportando..." : "Exportar relatório filtrado"}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={handleClearFilters}
              disabled={!hasActiveFilters}
            >
              Limpar filtros
            </button>
          </div>
        </div>
        <p className="reports-filter-hint">
          {availableStates.length} estados e {availableCityCount} cidades com
          cadastros disponíveis neste escopo.
        </p>
        {summaryLoading && !userSummary && (
          <div className="alert alert-success">Carregando relatório...</div>
        )}
        {exportFeedback && <div className="alert">{exportFeedback}</div>}
        {summaryError && <div className="alert">{summaryError}</div>}
        {userSummary && (
          <>
            <div className="info-grid">
              <div className="info-card">
                <h3>Médias dos indicadores</h3>
                <div className="summary-grid">
                  <div>
                    <span>Saúde</span>
                    <strong>{indicatorSummary.health}</strong>
                  </div>
                  <div>
                    <span>Educação</span>
                    <strong>{indicatorSummary.education}</strong>
                  </div>
                  <div>
                    <span>Renda</span>
                    <strong>{indicatorSummary.income}</strong>
                  </div>
                  <div>
                    <span>Renda média (R$)</span>
                    <strong>{indicatorSummary.incomeMonthly}</strong>
                  </div>
                  <div>
                    <span>Moradia</span>
                    <strong>{indicatorSummary.housing}</strong>
                  </div>
                  <div>
                    <span>Segurança</span>
                    <strong>{indicatorSummary.security}</strong>
                  </div>
                </div>
              </div>
              <div className="info-card">
                <h3>Cadastros por mês</h3>
                {monthlySeries.length > 0 ? (
                  <ul className="activity-list">
                    {monthlySeries.map((item) => (
                      <li key={item.month} className="empty-row">
                        {formatMonthLabel(item.month)}: {item.total}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="muted">
                    Nenhum registro mensal encontrado no recorte atual.
                  </p>
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
                          {new Date(resident.created_at).toLocaleDateString("pt-BR")}
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
                        <div className="table-empty reports-empty-state">
                          <strong>{emptyState?.title ?? "Nenhum cadastro registrado."}</strong>
                          <span>
                            {emptyState?.description ??
                              "Cadastre pessoas no painel para começar a visualizar os dados."}
                          </span>
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
