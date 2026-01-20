import { useState } from "react";
import { Link } from "react-router-dom";
import MapEditor, { type SelectedLocation } from "../components/MapEditor";
import type { Resident } from "../types/models";
import {
  assignResidentPoint,
  createPoint,
  createResident,
  type CreatePointPayload,
  type CreateResidentPayload,
} from "../services/api";
import { formatStatus } from "../utils/format";

const residents: Resident[] = [];

export default function EmployeeDashboard() {
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [formState, setFormState] = useState({
    fullName: "",
    docId: "",
    phone: "",
    email: "",
    address: "",
    status: "active" as "active" | "inactive",
    category: "Residencia",
    precision: "approx" as "approx" | "exact",
    publicNote: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const handleFieldChange = (
    field: keyof typeof formState,
    value: string
  ) => {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setFormState({
      fullName: "",
      docId: "",
      phone: "",
      email: "",
      address: "",
      status: "active",
      category: "Residencia",
      precision: "approx",
      publicNote: "",
      notes: "",
    });
    setSelectedLocation(null);
    setResetKey((current) => current + 1);
  };

  const handleSave = async () => {
    if (!selectedLocation) {
      setSaveFeedback({
        type: "error",
        message: "Selecione um ponto no mapa para continuar.",
      });
      return;
    }
    if (!formState.fullName.trim()) {
      setSaveFeedback({
        type: "error",
        message: "Informe o nome completo.",
      });
      return;
    }

    setSaving(true);
    setSaveFeedback(null);
    try {
      const residentPayload: CreateResidentPayload = {
        full_name: formState.fullName,
        doc_id: formState.docId || undefined,
        phone: formState.phone || undefined,
        email: formState.email || undefined,
        address: formState.address || undefined,
        status: formState.status,
        notes: formState.notes || undefined,
      };
      const residentResponse = await createResident(residentPayload);

      const pointPayload: CreatePointPayload = {
        lat: selectedLocation.lat,
        lng: selectedLocation.lng,
        status: formState.status,
        precision: formState.precision,
        category: formState.category,
        public_note: formState.publicNote || undefined,
      };
      const pointResponse = await createPoint(pointPayload);

      await assignResidentPoint({
        resident_id: residentResponse.id,
        point_id: pointResponse.id,
      });

      setSaveFeedback({
        type: "success",
        message:
          "Cadastro salvo. O mapa publico sera atualizado no proximo ciclo diario.",
      });
      resetForm();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao salvar cadastro.";
      setSaveFeedback({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page">
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">Painel do funcionario</span>
          <h1>Controle de residentes e pontos</h1>
          <p>
            Cadastre pessoas, associe pontos e acompanhe indicadores de campo
            com auditoria automatica.
          </p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn btn-outline" to="/modulos">
            Acessar modulos
          </Link>
          <button className="btn btn-primary" type="button">
            Novo cadastro
          </button>
        </div>
      </section>

      <section className="form-section">
        <div className="form-header">
          <div>
            <span className="eyebrow">Cadastro e georreferenciamento</span>
            <h2>Registrar pessoa e informacoes no mapa</h2>
            <p className="muted">
              Preencha os dados, escolha o local no mapa e salve o registro
              para atualizar o painel publico.
            </p>
          </div>
        </div>
        <div className="form-grid">
          <div className="form-card">
            <form className="form">
              <label>
                Nome completo
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={formState.fullName}
                  onChange={(event) =>
                    handleFieldChange("fullName", event.target.value)
                  }
                />
              </label>
              <div className="form-row">
                <label>
                  Documento
                  <input
                    type="text"
                    placeholder="Documento"
                    value={formState.docId}
                    onChange={(event) =>
                      handleFieldChange("docId", event.target.value)
                    }
                  />
                </label>
                <label>
                  Telefone
                  <input
                    type="tel"
                    placeholder="Telefone"
                    value={formState.phone}
                    onChange={(event) =>
                      handleFieldChange("phone", event.target.value)
                    }
                  />
                </label>
              </div>
              <label>
                Email
                <input
                  type="email"
                  placeholder="Email"
                  value={formState.email}
                  onChange={(event) =>
                    handleFieldChange("email", event.target.value)
                  }
                />
              </label>
              <label>
                Endereco
                <input
                  type="text"
                  placeholder="Endereco completo"
                  value={formState.address}
                  onChange={(event) =>
                    handleFieldChange("address", event.target.value)
                  }
                />
              </label>
              <div className="form-row">
                <label>
                  Latitude
                  <input
                    type="text"
                    placeholder="Selecione no mapa"
                    value={
                      selectedLocation
                        ? selectedLocation.lat.toFixed(5)
                        : ""
                    }
                    readOnly
                  />
                </label>
                <label>
                  Longitude
                  <input
                    type="text"
                    placeholder="Selecione no mapa"
                    value={
                      selectedLocation
                        ? selectedLocation.lng.toFixed(5)
                        : ""
                    }
                    readOnly
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Categoria do ponto
                  <select
                    className="select"
                    value={formState.category}
                    onChange={(event) =>
                      handleFieldChange("category", event.target.value)
                    }
                  >
                    <option>Residencia</option>
                    <option>Equipamento publico</option>
                    <option>Organizacao comunitaria</option>
                    <option>Outro</option>
                  </select>
                </label>
                <label>
                  Precisao publica
                  <select
                    className="select"
                    value={formState.precision}
                    onChange={(event) =>
                      handleFieldChange(
                        "precision",
                        event.target.value === "exact" ? "exact" : "approx"
                      )
                    }
                  >
                    <option value="approx">Aproximado</option>
                    <option value="exact">Exato (restrito)</option>
                  </select>
                </label>
              </div>
              <label>
                Informacao publica no mapa
                <textarea
                  rows={3}
                  placeholder="Descricao publica do ponto"
                  value={formState.publicNote}
                  onChange={(event) =>
                    handleFieldChange("publicNote", event.target.value)
                  }
                />
              </label>
              <label>
                Status do cadastro
                <select
                  className="select"
                  value={formState.status}
                  onChange={(event) =>
                    handleFieldChange(
                      "status",
                      event.target.value === "inactive" ? "inactive" : "active"
                    )
                  }
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </label>
              <label>
                Observacoes do agente
                <textarea
                  rows={3}
                  placeholder="Resumo e informacoes relevantes"
                  value={formState.notes}
                  onChange={(event) =>
                    handleFieldChange("notes", event.target.value)
                  }
                />
              </label>
              {saveFeedback && (
                <div
                  className={
                    saveFeedback.type === "success" ? "alert alert-success" : "alert"
                  }
                >
                  {saveFeedback.message}
                </div>
              )}
              <div className="form-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving ? "Salvando..." : "Salvar e publicar"}
                </button>
                <button className="btn btn-outline" type="button" disabled={saving}>
                  Salvar rascunho
                </button>
              </div>
            </form>
          </div>
          <div className="form-card">
            <MapEditor
              onLocationChange={setSelectedLocation}
              resetKey={resetKey}
            />
            <div className="form-note">
              <strong>Dica:</strong> clique no mapa para definir o ponto e
              adicionar informacoes do territorio.
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="dashboard-card">
          <h3>Atividades recentes</h3>
          <ul className="activity-list">
            <li className="empty-row">
              Nenhuma atividade registrada ate o momento.
            </li>
          </ul>
          <Link className="text-link" to="/admin">
            Ver auditoria
          </Link>
        </div>
        <div className="dashboard-card">
          <h3>Resumo do territorio</h3>
          <p className="muted">
            Os indicadores aparecem apos a integracao com o backend.
          </p>
          <Link className="text-link" to="/relatorios">
            Gerar relatorio publico
          </Link>
        </div>
      </section>

      <section className="table-section">
        <div className="table-header">
          <div>
            <span className="eyebrow">Residentes</span>
            <h2>Lista de acompanhamento</h2>
          </div>
          <button className="btn btn-primary" type="button">
            Exportar dados
          </button>
        </div>
        <div className="table-card">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Nome</th>
                <th>Status</th>
                <th>Ponto</th>
                <th>Atualizacao</th>
                <th>Acoes</th>
              </tr>
            </thead>
            <tbody>
              {residents.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">
                      Nenhum residente cadastrado ainda.
                    </div>
                  </td>
                </tr>
              ) : (
                residents.map((resident) => (
                  <tr key={resident.id}>
                    <td>{resident.id}</td>
                    <td>{resident.name}</td>
                    <td>
                      <span className={`status ${resident.status}`}>
                        {formatStatus(resident.status)}
                      </span>
                    </td>
                    <td>{resident.pointId ?? "Nao associado"}</td>
                    <td>{resident.lastUpdate}</td>
                    <td>
                      <button className="btn btn-ghost" type="button">
                        Editar
                      </button>
                    </td>
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
