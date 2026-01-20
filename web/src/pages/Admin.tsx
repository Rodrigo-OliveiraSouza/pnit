import { useEffect, useState } from "react";
import { formatStatus } from "../utils/format";
import type { AuditEntry } from "../types/models";
import { listAdminUsers, updateAdminUser, type AdminUser } from "../services/api";

const auditEntries: AuditEntry[] = [];

export default function Admin() {
  const [activeTab, setActiveTab] = useState<
    "requests" | "users" | "settings" | "audit"
  >("requests");
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
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
  }, []);

  const handleApprove = async (id: string) => {
    await updateAdminUser(id, { status: "active" });
    await loadUsers();
  };

  const handleDisable = async (id: string) => {
    await updateAdminUser(id, { status: "disabled" });
    await loadUsers();
  };

  return (
    <div className="page">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Admin</span>
          <h1>Gestao de equipes e auditoria</h1>
          <p>
            Acompanhe acessos, aprove solicitacoes e garanta a integridade dos
            dados.
          </p>
        </div>
        <div className="dashboard-actions">
          <button className="btn btn-primary" type="button">
            Novo funcionario
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
            Solicitacoes
          </button>
          <button
            className={`tab ${activeTab === "users" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("users")}
          >
            Usuarios
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
            Auditoria
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
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Ator</th>
                  <th>Acao</th>
                  <th>Entidade</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {auditEntries.length === 0 ? (
                  <tr>
                    <td colSpan={5}>
                      <div className="table-empty">
                        Nenhum evento de auditoria registrado ainda.
                      </div>
                    </td>
                  </tr>
                ) : (
                  auditEntries.map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.id}</td>
                      <td>{entry.actor}</td>
                      <td>{entry.action}</td>
                      <td>{entry.entity}</td>
                      <td>{entry.createdAt}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
