import { formatStatus, type StatusLabel } from "../utils/format";
import type { AuditEntry } from "../types/models";

const auditEntries: AuditEntry[] = [];

const staff: Array<{
  id: string;
  name: string;
  role: string;
  status: StatusLabel;
}> = [];

export default function Admin() {
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

      <section className="table-section">
        <div className="table-header">
          <div>
            <span className="eyebrow">Funcionarios</span>
            <h2>Equipe cadastrada</h2>
          </div>
          <button className="btn btn-outline" type="button">
            Revisar pendencias
          </button>
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>Perfil</th>
                <th>Status</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={5}>
                    <div className="table-empty">
                      Nenhum funcionario cadastrado ainda.
                    </div>
                  </td>
                </tr>
              ) : (
                staff.map((member) => (
                  <tr key={member.id}>
                    <td>{member.id}</td>
                    <td>{member.name}</td>
                    <td>{member.role}</td>
                    <td>
                      <span className={`status ${member.status}`}>
                        {formatStatus(member.status)}
                      </span>
                    </td>
                    <td>
                      <button className="btn btn-ghost" type="button">
                        Revisar
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <span className="eyebrow">Auditoria</span>
            <h2>Eventos recentes</h2>
          </div>
          <button className="btn btn-outline" type="button">
            Ajustar filtros
          </button>
        </div>
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
      </section>
    </div>
  );
}
