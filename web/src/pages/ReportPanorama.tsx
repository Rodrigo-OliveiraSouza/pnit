import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { BRAZIL_STATES } from "../data/brazil-states";
import {
  fetchUserSummary,
  getAuthRole,
  getAuthToken,
  type UserSummaryResponse,
} from "../services/api";

type ResidentRecord = NonNullable<UserSummaryResponse["residents"]>[number];
type NumericResidentField =
  | "health_score"
  | "education_score"
  | "income_score"
  | "income_monthly"
  | "housing_score"
  | "security_score";

const SCORE_FORMATTER = new Intl.NumberFormat("pt-BR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const CURRENCY_FORMATTER = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
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

const getSum = (values: Array<number | null | undefined>) =>
  values.reduce<number>((total, value) => total + (value ?? 0), 0);

const getDistinctCount = (values: Array<string | null | undefined>) =>
  new Set(
    values
      .map((value) => value?.trim() ?? "")
      .filter((value) => Boolean(value))
      .map((value) => normalizeText(value))
  ).size;

const getFrequencyList = (
  values: Array<string | null | undefined>,
  limit = 5
) => {
  const counts = new Map<string, { label: string; total: number }>();

  values.forEach((value) => {
    const label = value?.trim() ?? "";
    const key = normalizeText(label);
    if (!key) return;

    const current = counts.get(key);
    if (current) {
      current.total += 1;
      return;
    }

    counts.set(key, { label, total: 1 });
  });

  return Array.from(counts.values())
    .sort(
      (left, right) =>
        right.total - left.total ||
        left.label.localeCompare(right.label, "pt-BR")
    )
    .slice(0, limit);
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
    .sort((left, right) => left[0].localeCompare(right[0]))
    .slice(-6)
    .map(([month, total]) => ({ month, total }));
};

const formatMonthLabel = (value: string) => {
  const parsedDate = new Date(`${value}-01T00:00:00`);
  if (Number.isNaN(parsedDate.getTime())) {
    return value;
  }
  return MONTH_FORMATTER.format(parsedDate);
};

const getBooleanCoverage = (
  residents: ResidentRecord[],
  selector: (resident: ResidentRecord) => boolean | null | undefined
) => {
  const answered = residents.filter((resident) => {
    const value = selector(resident);
    return value !== null && value !== undefined;
  });
  const positive = answered.filter((resident) => selector(resident) === true);

  return {
    base: answered.length,
    total: positive.length,
    percent:
      answered.length > 0 ? Math.round((positive.length / answered.length) * 100) : 0,
  };
};

const getLatestDate = (residents: ResidentRecord[]) =>
  residents.reduce((latest, resident) => {
    if (!resident.created_at) return latest;
    const current = new Date(resident.created_at);
    if (Number.isNaN(current.getTime())) return latest;
    if (!latest || current > latest) return current;
    return latest;
  }, null as Date | null);

const getStatusLabel = (value?: string | null) => {
  const normalizedValue = normalizeText(value);
  if (normalizedValue === "active" || normalizedValue === "ativo") {
    return "Ativos";
  }
  if (normalizedValue === "inactive" || normalizedValue === "inativo") {
    return "Inativos";
  }
  if (normalizedValue === "pending" || normalizedValue === "pendente") {
    return "Pendentes";
  }
  return value?.trim() || "Sem classificação";
};

export default function ReportPanorama() {
  const isLoggedIn = Boolean(getAuthToken());
  const authRole = getAuthRole();
  const [searchParams] = useSearchParams();
  const [userSummary, setUserSummary] = useState<UserSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (authRole === "content") {
    return <Navigate to="/admin" replace />;
  }

  const filterState = getStateCode(searchParams.get("state"));
  const filterCity = searchParams.get("city")?.trim() ?? "";

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError(null);

    fetchUserSummary()
      .then((response) => {
        if (!active) return;
        setUserSummary(response);
      })
      .catch((requestError) => {
        if (!active) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Nao foi possivel carregar o panorama."
        );
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const allResidents = userSummary?.residents ?? [];
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

  const latestDate = useMemo(
    () => getLatestDate(filteredResidents),
    [filteredResidents]
  );
  const communityRanking = useMemo(
    () => getFrequencyList(filteredResidents.map((resident) => resident.community_name)),
    [filteredResidents]
  );
  const cityRanking = useMemo(
    () =>
      getFrequencyList(
        filteredResidents.map((resident) =>
          resident.city?.trim()
            ? `${resident.city.trim()}${resident.state ? ` (${getStateCode(resident.state)})` : ""}`
            : ""
        )
      ),
    [filteredResidents]
  );
  const vulnerabilityRanking = useMemo(
    () =>
      getFrequencyList(
        filteredResidents.map((resident) => resident.vulnerability_level),
        4
      ),
    [filteredResidents]
  );
  const statusBreakdown = useMemo(() => {
    const groups = new Map<string, number>();

    filteredResidents.forEach((resident) => {
      const label = getStatusLabel(resident.status);
      groups.set(label, (groups.get(label) ?? 0) + 1);
    });

    return Array.from(groups.entries())
      .map(([label, total]) => ({
        label,
        total,
        percent:
          filteredResidents.length > 0
            ? Math.round((total / filteredResidents.length) * 100)
            : 0,
      }))
      .sort(
        (left, right) =>
          right.total - left.total ||
          left.label.localeCompare(right.label, "pt-BR")
      );
  }, [filteredResidents]);
  const dominantStatus = statusBreakdown[0] ?? null;

  const indicatorAverages = useMemo(
    () => ({
      health: getResidentAverage(filteredResidents, "health_score"),
      education: getResidentAverage(filteredResidents, "education_score"),
      income: getResidentAverage(filteredResidents, "income_score"),
      incomeMonthly: getResidentAverage(filteredResidents, "income_monthly"),
      housing: getResidentAverage(filteredResidents, "housing_score"),
      security: getResidentAverage(filteredResidents, "security_score"),
    }),
    [filteredResidents]
  );

  const serviceCoverage = useMemo(
    () => [
      {
        label: "Internet",
        helper: "cadastros com acesso informado",
        ...getBooleanCoverage(filteredResidents, (resident) => resident.internet_access),
      },
      {
        label: "Transporte",
        helper: "cadastros com acesso a transporte",
        ...getBooleanCoverage(filteredResidents, (resident) => resident.transport_access),
      },
      {
        label: "Escola",
        helper: "familias com escola de referência",
        ...getBooleanCoverage(filteredResidents, (resident) => resident.education_has_school),
      },
      {
        label: "Clinica",
        helper: "moradias com acesso a clínica",
        ...getBooleanCoverage(filteredResidents, (resident) => resident.health_has_clinic),
      },
      {
        label: "Agua tratada",
        helper: "domicílios com água tratada",
        ...getBooleanCoverage(
          filteredResidents,
          (resident) => resident.housing_has_water_treated
        ),
      },
      {
        label: "Programa social",
        helper: "cadastros com programa informado",
        ...getBooleanCoverage(
          filteredResidents,
          (resident) => resident.income_has_social_program
        ),
      },
    ],
    [filteredResidents]
  );

  const monthlySeries = useMemo(
    () => buildMonthlySeries(filteredResidents),
    [filteredResidents]
  );
  const monthlyPeak = Math.max(
    1,
    ...monthlySeries.map((item) => item.total)
  );

  const householdAverage = useMemo(() => {
    const values = filteredResidents
      .map((resident) => resident.household_size ?? null)
      .filter((value): value is number => value !== null);

    if (values.length === 0) {
      return null;
    }

    return values.reduce((total, value) => total + value, 0) / values.length;
  }, [filteredResidents]);

  const totals = useMemo(
    () => ({
      children: getSum(filteredResidents.map((resident) => resident.children_count)),
      elderly: getSum(filteredResidents.map((resident) => resident.elderly_count)),
      pcd: getSum(filteredResidents.map((resident) => resident.pcd_count)),
      household: getSum(filteredResidents.map((resident) => resident.household_size)),
    }),
    [filteredResidents]
  );

  const scopeTitle = useMemo(() => {
    if (filterState && filterCity) {
      return `${filterCity} (${filterState})`;
    }
    if (filterState) {
      return getStateName(filterState);
    }
    return "Panorama geral da plataforma";
  }, [filterCity, filterState]);

  const scopeDescription = useMemo(() => {
    if (filterState && filterCity) {
      return `Leitura territorial com foco em ${filterCity}, no estado de ${getStateName(filterState)}.`;
    }
    if (filterState) {
      return `Leitura territorial consolidada do estado de ${getStateName(filterState)}.`;
    }
    return "Leitura territorial consolidada de toda a base cadastrada na plataforma.";
  }, [filterCity, filterState]);

  const panoramaNarrative = useMemo(() => {
    if (filteredResidents.length === 0) {
      return "Ajuste o recorte para montar um panorama com os indicadores disponíveis.";
    }

    const fragments = [
      `${filteredResidents.length} cadastros compõem este recorte.`,
    ];

    if (dominantStatus) {
      fragments.push(
        `${dominantStatus.label} representam ${dominantStatus.percent}% da base atual.`
      );
    }

    if (communityRanking[0]) {
      fragments.push(
        `${communityRanking[0].label} aparece como a comunidade mais recorrente no território analisado.`
      );
    }

    if (indicatorAverages.health !== null && indicatorAverages.education !== null) {
      fragments.push(
        `Saúde tem média ${formatScore(indicatorAverages.health)} e educação ${formatScore(indicatorAverages.education)} na escala cadastrada pela equipe.`
      );
    }

    return fragments.join(" ");
  }, [
    communityRanking,
    dominantStatus,
    filteredResidents.length,
    indicatorAverages.education,
    indicatorAverages.health,
  ]);

  const heroCards = useMemo(
    () => [
      {
        label: "Cadastros",
        value: String(filteredResidents.length),
      },
      {
        label: "Comunidades",
        value: String(
          getDistinctCount(filteredResidents.map((resident) => resident.community_name))
        ),
      },
      {
        label: "Bairros",
        value: String(
          getDistinctCount(filteredResidents.map((resident) => resident.neighborhood))
        ),
      },
      {
        label: "Atualizado em",
        value: latestDate ? latestDate.toLocaleDateString("pt-BR") : "-",
      },
    ],
    [filteredResidents, latestDate]
  );

  const overviewCards = useMemo(
    () => [
      {
        label: "Famílias observadas",
        value: String(filteredResidents.length),
        note: "Total de registros com dados disponíveis neste recorte.",
      },
      {
        label: "Média de moradores",
        value: householdAverage === null ? "-" : formatScore(householdAverage),
        note: "Tamanho médio dos domicílios registrados.",
      },
      {
        label: "Renda mensal média",
        value: formatCurrency(indicatorAverages.incomeMonthly),
        note: "Estimativa calculada com base na renda mensal informada.",
      },
      {
        label: "Cobertura territorial",
        value: `${cityRanking.length} cidades`,
        note: "Municípios presentes dentro do recorte ativo.",
      },
    ],
    [cityRanking.length, filteredResidents.length, householdAverage, indicatorAverages.incomeMonthly]
  );

  const indicatorItems = useMemo(
    () => [
      {
        label: "Saúde",
        value: indicatorAverages.health,
        helper: "Percepção geral sobre acesso e continuidade do cuidado.",
      },
      {
        label: "Educação",
        value: indicatorAverages.education,
        helper: "Presença de acesso escolar e suporte educacional.",
      },
      {
        label: "Renda",
        value: indicatorAverages.income,
        helper: "Situação econômica consolidada do território.",
      },
      {
        label: "Moradia",
        value: indicatorAverages.housing,
        helper: "Condição estrutural e infraestrutura do domicílio.",
      },
      {
        label: "Segurança",
        value: indicatorAverages.security,
        helper: "Leitura de proteção e ocorrências reportadas.",
      },
    ],
    [indicatorAverages]
  );

  const demographicItems = useMemo(
    () => [
      {
        label: "Crianças",
        value: String(totals.children),
        note: "Total informado nos registros filtrados.",
      },
      {
        label: "Idosos",
        value: String(totals.elderly),
        note: "Pessoas idosas contabilizadas na base.",
      },
      {
        label: "PCD",
        value: String(totals.pcd),
        note: "Pessoas com deficiência registradas.",
      },
      {
        label: "Moradores",
        value: String(totals.household),
        note: "Soma de pessoas nos domicílios mapeados.",
      },
    ],
    [totals]
  );

  return (
    <div className="page panorama-page">
      <section className="public-hero panorama-hero">
        <div className="panorama-hero-copy">
          <span className="eyebrow">Panorama territorial</span>
          <h1>{scopeTitle}</h1>
          <p className="lead">{scopeDescription}</p>
          <p className="panorama-hero-summary">{panoramaNarrative}</p>
          <div className="panorama-hero-actions">
            <Link className="btn btn-primary" to="/relatorios">
              Voltar aos relatórios
            </Link>
          </div>
        </div>
        <div className="panorama-hero-meta">
          {heroCards.map((item) => (
            <article key={item.label} className="panorama-hero-card">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </article>
          ))}
        </div>
      </section>

      {loading && <div className="alert alert-success">Carregando panorama...</div>}
      {error && <div className="alert">{error}</div>}

      {!loading && !error && filteredResidents.length === 0 && (
        <section className="module-section reports-module-section">
          <div className="reports-panel">
            <div className="table-empty reports-empty-state">
              <strong>Nenhum cadastro encontrado neste recorte.</strong>
              <span>
                Volte aos relatórios e ajuste estado ou cidade para montar o panorama.
              </span>
            </div>
          </div>
        </section>
      )}

      {!loading && !error && filteredResidents.length > 0 && (
        <>
          <section className="module-section reports-module-section">
            <div className="panorama-stat-grid">
              {overviewCards.map((card) => (
                <article key={card.label} className="panorama-stat-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <p>{card.note}</p>
                </article>
              ))}
            </div>
          </section>

          <section className="module-section reports-module-section">
            <div className="panorama-topic-grid">
              <article className="info-card panorama-panel panorama-panel-wide">
                <div className="reports-card-heading">
                  <div>
                    <span className="eyebrow">Indicadores centrais</span>
                    <h2>Panorama de qualidade territorial</h2>
                  </div>
                  <p className="muted">
                    Leitura inspirada em páginas de panorama, agora baseada na sua
                    base territorial.
                  </p>
                </div>
                <div className="panorama-progress-list">
                  {indicatorItems.map((item) => {
                    const width =
                      item.value === null
                        ? 0
                        : Math.max(12, Math.min(100, item.value * 10));

                    return (
                      <div key={item.label} className="panorama-progress-row">
                        <div className="panorama-progress-top">
                          <strong>{item.label}</strong>
                          <span>{formatScore(item.value)}</span>
                        </div>
                        <div className="panorama-progress-track">
                          <span
                            className="panorama-progress-fill"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <p>{item.helper}</p>
                      </div>
                    );
                  })}
                </div>
              </article>

              <article className="info-card panorama-panel">
                <div className="reports-card-heading">
                  <div>
                    <span className="eyebrow">Infraestrutura</span>
                    <h2>Cobertura de acesso</h2>
                  </div>
                </div>
                <div className="panorama-progress-list">
                  {serviceCoverage.map((item) => (
                    <div key={item.label} className="panorama-progress-row">
                      <div className="panorama-progress-top">
                        <strong>{item.label}</strong>
                        <span>{item.base > 0 ? `${item.percent}%` : "-"}</span>
                      </div>
                      <div className="panorama-progress-track">
                        <span
                          className="panorama-progress-fill panorama-progress-fill-soft"
                          style={{ width: `${Math.max(item.percent, item.base ? 10 : 0)}%` }}
                        />
                      </div>
                      <p>
                        {item.base > 0
                          ? `${item.total} de ${item.base} ${item.helper}.`
                          : "Sem respostas suficientes neste eixo."}
                      </p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="info-card panorama-panel">
                <div className="reports-card-heading">
                  <div>
                    <span className="eyebrow">Cadastros recentes</span>
                    <h2>Evolução mensal</h2>
                  </div>
                </div>
                {monthlySeries.length > 0 ? (
                  <div className="panorama-progress-list">
                    {monthlySeries.map((item) => (
                      <div key={item.month} className="panorama-progress-row">
                        <div className="panorama-progress-top">
                          <strong>{formatMonthLabel(item.month)}</strong>
                          <span>{item.total}</span>
                        </div>
                        <div className="panorama-progress-track">
                          <span
                            className="panorama-progress-fill panorama-progress-fill-strong"
                            style={{
                              width: `${Math.max(
                                14,
                                (item.total / monthlyPeak) * 100
                              )}%`,
                            }}
                          />
                        </div>
                        <p>Registros adicionados no período.</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">
                    Ainda não há série mensal suficiente para este recorte.
                  </p>
                )}
              </article>

              <article className="info-card panorama-panel">
                <div className="reports-card-heading">
                  <div>
                    <span className="eyebrow">Concentração</span>
                    <h2>Territórios mais recorrentes</h2>
                  </div>
                </div>
                <div className="panorama-ranking-grid">
                  <div>
                    <h3 className="panorama-list-title">Cidades</h3>
                    <div className="panorama-ranking-list">
                      {cityRanking.length > 0 ? (
                        cityRanking.map((item, index) => (
                          <div key={item.label} className="panorama-ranking-item">
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <strong>{item.label}</strong>
                            <em>{item.total} registros</em>
                          </div>
                        ))
                      ) : (
                        <p className="muted">Sem cidades suficientes neste recorte.</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3 className="panorama-list-title">Comunidades</h3>
                    <div className="panorama-ranking-list">
                      {communityRanking.length > 0 ? (
                        communityRanking.map((item, index) => (
                          <div key={item.label} className="panorama-ranking-item">
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <strong>{item.label}</strong>
                            <em>{item.total} registros</em>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          Sem comunidades nomeadas no recorte selecionado.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </article>

              <article className="info-card panorama-panel panorama-panel-wide">
                <div className="reports-card-heading">
                  <div>
                    <span className="eyebrow">Perfil social</span>
                    <h2>Estrutura demográfica e situação da base</h2>
                  </div>
                  <p className="muted">
                    Resumo rápido das famílias acompanhadas e da leitura de status.
                  </p>
                </div>
                <div className="panorama-demographic-grid">
                  {demographicItems.map((item) => (
                    <article key={item.label} className="panorama-mini-stat">
                      <span>{item.label}</span>
                      <strong>{item.value}</strong>
                      <p>{item.note}</p>
                    </article>
                  ))}
                </div>
                <div className="panorama-footer-grid">
                  <div className="panorama-subpanel">
                    <h3 className="panorama-list-title">Status do recorte</h3>
                    <div className="panorama-ranking-list">
                      {statusBreakdown.map((item) => (
                        <div key={item.label} className="panorama-ranking-item">
                          <span>{item.percent}%</span>
                          <strong>{item.label}</strong>
                          <em>{item.total} registros</em>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="panorama-subpanel">
                    <h3 className="panorama-list-title">Vulnerabilidades mais citadas</h3>
                    <div className="panorama-ranking-list">
                      {vulnerabilityRanking.length > 0 ? (
                        vulnerabilityRanking.map((item, index) => (
                          <div key={item.label} className="panorama-ranking-item">
                            <span>{String(index + 1).padStart(2, "0")}</span>
                            <strong>{item.label}</strong>
                            <em>{item.total} ocorrências</em>
                          </div>
                        ))
                      ) : (
                        <p className="muted">
                          Sem classificação de vulnerabilidade suficiente.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
