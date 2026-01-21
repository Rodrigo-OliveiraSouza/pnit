import { useEffect, useMemo, useState } from "react";
import { formatStatus } from "../utils/format";
import type { AuditEntry } from "../types/models";
import {
  fetchAuditEntries,
  fetchProductivity,
  getAuthRole,
  getAuthUserId,
  listAdminUsers,
  listComplaints,
  refreshPublicMapCache,
  updateAdminUser,
  updateComplaintStatus,
  type AdminUser,
  type Complaint,
  type ProductivityResponse,
} from "../services/api";

export function AdminPanel() {
  const [activeTab, setActiveTab] = useState<
    "requests" | "users" | "complaints" | "productivity" | "settings" | "audit"
  >("requests");
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [productivity, setProductivity] = useState<ProductivityResponse | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [complaintLoading, setComplaintLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [productivityLoading, setProductivityLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
  const [auditView, setAuditView] = useState<"recent" | "history">("recent");
  const [auditPage, setAuditPage] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, all] = await Promise.all([
        listAdminUsers({ status: "pending" }),
        listAdminUsers(),
      ]);
      setPendingUsers(pending.items);
      setAllUsers(all.items);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar usuarios.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadUsers();
    void loadComplaints();
    void loadAudit();
    void loadProductivity();
  }, []);

  const handleApprove = async (id: string) => {
    await updateAdminUser(id, { status: "active" });
    await loadUsers();
  };

  const handleDisable = async (id: string) => {
    await updateAdminUser(id, { status: "disabled" });
    await loadUsers();
  };

  const loadComplaints = async () => {
    setComplaintLoading(true);
    try {
      const response = await listComplaints();
      setComplaints(response.items);
    } catch {
      setComplaints([]);
    } finally {
      setComplaintLoading(false);
    }
  };

  const handleComplaintStatus = async (
    id: string,
    status: "new" | "reviewing" | "closed"
  ) => {
    await updateComplaintStatus(id, status);
    await loadComplaints();
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const actorUserId = getAuthUserId();
      const response = await fetchAuditEntries({
        limit: 100,
        actor_user_id: actorUserId ?? undefined,
      });
      const mapped = response.items.map((entry) => ({
        id: String(entry.id ?? ""),
        actor_user_id: String(entry.actor_user_id ?? ""),
        action: String(entry.action ?? ""),
        entity_type: String(entry.entity_type ?? ""),
        entity_id: String(entry.entity_id ?? ""),
        created_at: String(entry.created_at ?? ""),
      }));
      setAuditEntries(mapped);
      setAuditPage(0);
      setAuditView("recent");
    } catch {
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const loadProductivity = async () => {
    setProductivityLoading(true);
    try {
      const response = await fetchProductivity({ period: "month" });
      setProductivity(response);
    } catch {
      setProductivity(null);
    } finally {
      setProductivityLoading(false);
    }
  };

  const auditPageSize = 10;
  const auditTotalPages = Math.max(1, Math.ceil(auditEntries.length / auditPageSize));
  const recentAuditEntries = useMemo(
    () => auditEntries.slice(0, auditPageSize),
    [auditEntries]
  );
  const pagedAuditEntries = useMemo(
    () =>
      auditEntries.slice(
        auditPage * auditPageSize,
        auditPage * auditPageSize + auditPageSize
      ),
    [auditEntries, auditPage]
  );

  const handleForceRefresh = async () => {
    setRefreshLoading(true);
    setRefreshFeedback(null);
    try {
      const response = await refreshPublicMapCache(true);
      if (response.skipped) {
        const when = response.last_refresh
          ? new Date(response.last_refresh).toLocaleString()
          : "agora";
        setRefreshFeedback(
          `Atualizacao ja executada nas ultimas 24h (ultima: ${when}).`
        );
      } else {
        const when = response.refreshed_at
          ? new Date(response.refreshed_at).toLocaleString()
          : "agora";
        setRefreshFeedback(`Atualizacao executada em ${when}.`);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Falha ao atualizar o mapa publico.";
      setRefreshFeedback(message);
    } finally {
      setRefreshLoading(false);
    }
  };

  return (
    <>
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Admin</span>
          <h1>Gestao de equipes e auditoria</h1>
          <p>
            Acompanhe acessos, aprove solicitacoes e garanta a integridade dos
            dados.
          </p>
          {refreshFeedback && <div className="alert">{refreshFeedback}</div>}
        </div>
        <div className="dashboard-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void handleForceRefresh()}
            disabled={refreshLoading}
          >
            {refreshLoading ? "Atualizando..." : "Atualizar mapa geral"}
          </button>
          <button className="btn btn-outline" type="button">
            Exportar auditoria
          </button>
        </div>
      </section>

      <section className="module-section">
        <div className="tabs">
          <button
            className={`tab ${activeTab === "requests" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("requests")}
          >
            Cadastros pendentes
            {pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ""}
          </button>
          <button
            className={`tab ${activeTab === "users" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("users")}
          >
            Cadastros registrados
          </button>
          <button
            className={`tab ${activeTab === "complaints" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("complaints")}
          >
            Denuncias
          </button>
          <button
            className={`tab ${activeTab === "productivity" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("productivity")}
          >
            Relatorio de usuario
          </button>
          <button
            className={`tab ${activeTab === "settings" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("settings")}
          >
            Configuracoes
          </button>
          <button
            className={`tab ${activeTab === "audit" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("audit")}
          >
            Minhas acoes
          </button>
        </div>
        {error && <div className="alert">{error}</div>}
        {activeTab === "requests" && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Territorio</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : pendingUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        Nenhuma solicitacao pendente.
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.full_name ?? "-"}</td>
                      <td>{user.email}</td>
                      <td>{user.territory ?? "-"}</td>
                      <td>
                        <span className="status pending">
                          {formatStatus("pending")}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => void handleApprove(user.id)}
                        >
                          Aprovar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "users" && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : allUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        Nenhum usuario cadastrado ainda.
                      </div>
                    </td>
                  </tr>
                ) : (
                  allUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.full_name ?? "-"}</td>
                      <td>{user.email}</td>
                      <td>{user.role}</td>
                      <td>
                        <span className={`status ${user.status}`}>
                          {formatStatus(user.status)}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => void handleDisable(user.id)}
                        >
                          Desativar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "complaints" && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Cidade</th>
                  <th>Estado</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {complaintLoading ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : complaints.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-empty">
                        Nenhuma denuncia registrada.
                      </div>
                    </td>
                  </tr>
                ) : (
                  complaints.map((complaint) => (
                    <tr key={complaint.id}>
                      <td>{complaint.id}</td>
                      <td>{complaint.type}</td>
                      <td>{complaint.city ?? "-"}</td>
                      <td>{complaint.state ?? "-"}</td>
                      <td>
                        <span className={`status ${complaint.status}`}>
                          {formatStatus(complaint.status)}
                        </span>
                      </td>
                      <td>
                        {new Date(complaint.created_at).toLocaleDateString()}
                      </td>
                      <td>
                        <select
                          className="select"
                          value={complaint.status}
                          onChange={(event) =>
                            void handleComplaintStatus(
                              complaint.id,
                              event.target.value as "new" | "reviewing" | "closed"
                            )
                          }
                        >
                          <option value="new">Novo</option>
                          <option value="reviewing">Em analise</option>
                          <option value="closed">Encerrado</option>
                        </select>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "productivity" && (
          <div className="dashboard-card">
            <h3>Relatorio de usuarios</h3>
            {productivityLoading && <p className="muted">Carregando...</p>}
            {!productivityLoading && !productivity && (
              <p className="muted">Sem dados disponiveis.</p>
            )}
            {productivity && (
              <>
                <div className="summary-grid">
                  <div>
                    <span>Total de cadastros</span>
                    <strong>{productivity.summary.total_residents}</strong>
                  </div>
                  <div>
                    <span>Total de pontos</span>
                    <strong>{productivity.summary.total_points}</strong>
                  </div>
                  <div>
                    <span>Periodo</span>
                    <strong>{productivity.summary.period}</strong>
                  </div>
                </div>
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Agente</th>
                        <th>Email</th>
                        <th>Cadastros</th>
                        <th>Pontos</th>
                        <th>Media Saude</th>
                        <th>Media Educacao</th>
                        <th>Media Renda</th>
                        <th>Media Moradia</th>
                        <th>Media Seguranca</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productivity.by_user.length === 0 ? (
                        <tr>
                          <td colSpan={9}>
                            <div className="table-empty">
                              Nenhuma atividade registrada.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        productivity.by_user.map((item) => (
                          <tr key={item.user_id}>
                            <td>{item.full_name ?? "-"}</td>
                            <td>{item.email ?? "-"}</td>
                            <td>{item.residents}</td>
                            <td>{item.points}</td>
                            <td>{item.health_avg ?? "-"}</td>
                            <td>{item.education_avg ?? "-"}</td>
                            <td>{item.income_avg ?? "-"}</td>
                            <td>{item.housing_avg ?? "-"}</td>
                            <td>{item.security_avg ?? "-"}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        {activeTab === "settings" && (
          <div className="dashboard-card">
            <h3>Configuracoes</h3>
            <p className="muted">
              Parametros territoriais e textos institucionais serao
              adicionados aqui.
            </p>
          </div>
        )}
        {activeTab === "audit" && (
          <div className="table-card">
            <div className="table-header" style={{ marginBottom: "0.8rem" }}>
              <div>
                <span className="eyebrow">Registro</span>
                <h3>
                  {auditView === "recent"
                    ? "Minhas acoes recentes (ultimas 10)"
                    : "Historico completo de acoes"}
                </h3>
              </div>
              {auditView === "recent" && auditEntries.length > auditPageSize && (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setAuditView("history")}
                >
                  Ver todas as acoes
                </button>
              )}
              {auditView === "history" && (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setAuditView("recent")}
                >
                  Voltar para recentes
                </button>
              )}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Acao</th>
                  <th>Entidade</th>
                  <th>Registro</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {auditLoading ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : auditEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="table-empty">
                        Nenhuma acao registrada ainda.
                      </div>
                    </td>
                  </tr>
                ) : (
                  (auditView === "recent"
                    ? recentAuditEntries
                    : pagedAuditEntries
                  ).map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.action}</td>
                      <td>{entry.entity_type}</td>
                      <td>{entry.entity_id}</td>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {auditView === "history" && auditEntries.length > auditPageSize && (
              <div className="table-footer">
                <span className="muted">
                  Pagina {auditPage + 1} de {auditTotalPages}
                </span>
                <div className="pager">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setAuditPage((current) => Math.max(0, current - 1))}
                    disabled={auditPage === 0}
                  >
                    Anterior
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() =>
                      setAuditPage((current) =>
                        Math.min(auditTotalPages - 1, current + 1)
                      )
                    }
                    disabled={auditPage >= auditTotalPages - 1}
                  >
                    Proxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

export default function Admin() {
  const role = getAuthRole();
  if (role !== "admin") {
    return (
      <div className="page">
        <div className="alert">Acesso restrito ao painel admin.</div>
      </div>
    );
  }
  return (
    <div className="page">
      <AdminPanel />
    </div>
  );
}
