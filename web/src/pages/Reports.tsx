import { useEffect, useState } from "react";
import PublicMapSection from "../components/PublicMapSection";
import { fetchUserSummary, getAuthToken } from "../services/api";

export default function Reports() {
  const [userSummary, setUserSummary] = useState<{
    summary?: { total_residents?: number };
    averages?: {
      health_score?: string;
      education_score?: string;
      income_score?: string;
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

  useEffect(() => {
    if (!getAuthToken()) {
      return;
    }
    fetchUserSummary()
      .then((response) => setUserSummary(response))
      .catch((error) => {
        const message =
          error instanceof Error ? error.message : "Falha ao carregar relatorio.";
        setSummaryError(message);
      });
  }, []);

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
      <PublicMapSection />
      {getAuthToken() && (
        <section className="module-section">
          <div className="module-header">
            <span className="eyebrow">Relatorio individual</span>
            <h2>Resumo do usuario logado</h2>
            <p className="muted">
              Consolidado de cadastros, medias e distribuicao mensal.
            </p>
          </div>
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
                    {userSummary.residents && userSummary.residents.length > 0 ? (
                      userSummary.residents.map((resident) => (
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
      )}
    </div>
  );
}
