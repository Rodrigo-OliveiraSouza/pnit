
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MapEditor, { type SelectedLocation } from "../components/MapEditor";
import type { AuditEntry } from "../types/models";
import {
  assignResidentPoint,
  createPoint,
  createResident,
  createResidentProfile,
  fetchAuditEntries,
  listResidents,
  uploadAttachment,
  type CreatePointPayload,
  type CreateResidentPayload,
} from "../services/api";
import { formatStatus } from "../utils/format";

type DashboardResident = {
  id: string;
  full_name: string;
  city?: string | null;
  state?: string | null;
  status: string;
  created_at: string;
};

function parseLatLng(input: string) {
  const matches = input.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i);
  if (!matches) return null;
  const lat = Number(matches[1]);
  const lng = Number(matches[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

const initialFormState = {
  fullName: "",
  docId: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  status: "active" as "active" | "inactive",
  category: "Residencia",
  precision: "approx" as "approx" | "exact",
  publicNote: "",
  notes: "",
  locationText: "",
  raceIdentity: "",
  territoryNarrative: "",
  territoryMemories: "",
  territoryConflicts: "",
  territoryCulture: "",
  healthHasClinic: false,
  healthHasEmergency: false,
  healthHasCommunityAgent: false,
  healthNotes: "",
  educationLevel: "",
  educationHasSchool: false,
  educationHasTransport: false,
  educationMaterialSupport: false,
  educationNotes: "",
  incomeMonthly: "",
  incomeSource: "",
  assetsHasCar: false,
  assetsHasFridge: false,
  assetsHasFurniture: false,
  assetsHasLand: false,
  housingRooms: "",
  housingAreaM2: "",
  housingLandM2: "",
  housingType: "",
  securityHasPoliceStation: false,
  securityHasPatrol: false,
  securityNotes: "",
};

type IndicatorSummary = {
  score: number;
  note: string;
};

type IndicatorSet = {
  health: IndicatorSummary;
  education: IndicatorSummary;
  income: IndicatorSummary;
  housing: IndicatorSummary;
  security: IndicatorSummary;
};

function clampScore(value: number) {
  return Math.min(10, Math.max(1, Math.round(value)));
}

function parseNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}

function computeIndicators(form: typeof initialFormState): IndicatorSet {
  let healthScore = 2;
  const healthParts: string[] = [];
  if (form.healthHasClinic) {
    healthScore += 3;
    healthParts.push("posto proximo");
  } else {
    healthParts.push("sem posto");
  }
  if (form.healthHasEmergency) {
    healthScore += 3;
    healthParts.push("emergencia");
  }
  if (form.healthHasCommunityAgent) {
    healthScore += 2;
    healthParts.push("agente comunitario");
  }

  let educationScore = 2;
  const educationParts: string[] = [];
  if (form.educationHasSchool) {
    educationScore += 3;
    educationParts.push("escola proxima");
  }
  if (form.educationHasTransport) {
    educationScore += 2;
    educationParts.push("transporte escolar");
  }
  if (form.educationMaterialSupport) {
    educationScore += 2;
    educationParts.push("materiais fornecidos");
  }
  if (form.educationLevel.trim()) {
    educationScore += 1;
    educationParts.push(`nivel: ${form.educationLevel.trim()}`);
  }

  let incomeScore = 2;
  const incomeParts: string[] = [];
  const incomeMonthly = parseNumber(form.incomeMonthly);
  if (incomeMonthly !== null) {
    if (incomeMonthly >= 3000) {
      incomeScore += 4;
    } else if (incomeMonthly >= 1500) {
      incomeScore += 3;
    } else if (incomeMonthly >= 800) {
      incomeScore += 2;
    } else if (incomeMonthly > 0) {
      incomeScore += 1;
    }
    incomeParts.push(`renda: R$ ${incomeMonthly.toFixed(0)}`);
  }
  if (form.assetsHasCar) {
    incomeScore += 1;
    incomeParts.push("carro");
  }
  if (form.assetsHasFridge) {
    incomeScore += 1;
    incomeParts.push("geladeira");
  }
  if (form.assetsHasFurniture) {
    incomeScore += 1;
    incomeParts.push("moveis");
  }
  if (form.assetsHasLand) {
    incomeScore += 1;
    incomeParts.push("terreno");
  }

  let housingScore = 2;
  const housingParts: string[] = [];
  const rooms = parseNumber(form.housingRooms);
  const area = parseNumber(form.housingAreaM2);
  const land = parseNumber(form.housingLandM2);
  if (rooms !== null) {
    if (rooms >= 3) housingScore += 2;
    else if (rooms >= 2) housingScore += 1;
    housingParts.push(`${rooms} quartos`);
  }
  if (area !== null) {
    if (area >= 80) housingScore += 2;
    else if (area >= 50) housingScore += 1;
    housingParts.push(`${area}m2`);
  }
  if (land !== null) {
    if (land >= 150) housingScore += 2;
    else if (land >= 100) housingScore += 1;
    housingParts.push(`terreno ${land}m2`);
  }
  if (form.housingType.trim()) {
    housingScore += 1;
    housingParts.push(form.housingType.trim());
  }

  let securityScore = 2;
  const securityParts: string[] = [];
  if (form.securityHasPoliceStation) {
    securityScore += 3;
    securityParts.push("delegacia");
  }
  if (form.securityHasPatrol) {
    securityScore += 3;
    securityParts.push("patrulha");
  }

  return {
    health: {
      score: clampScore(healthScore),
      note: healthParts.join(", ") || "sem informacoes",
    },
    education: {
      score: clampScore(educationScore),
      note: educationParts.join(", ") || "sem informacoes",
    },
    income: {
      score: clampScore(incomeScore),
      note: incomeParts.join(", ") || "sem informacoes",
    },
    housing: {
      score: clampScore(housingScore),
      note: housingParts.join(", ") || "sem informacoes",
    },
    security: {
      score: clampScore(securityScore),
      note: securityParts.join(", ") || "sem informacoes",
    },
  };
}

export default function EmployeeDashboard() {
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [residents, setResidents] = useState<DashboardResident[]>([]);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditView, setAuditView] = useState<"recent" | "history">("recent");
  const [auditPage, setAuditPage] = useState(0);
  const [formState, setFormState] = useState(initialFormState);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const loadResidents = async () => {
    try {
      const response = await listResidents("me");
      setResidents(response.items);
    } catch {
      setResidents([]);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const response = await fetchAuditEntries({ limit: 100 });
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

  const auditPageSize = 10;
  const auditTotalPages = Math.max(1, Math.ceil(auditEntries.length / auditPageSize));
  const recentAuditEntries = auditEntries.slice(0, auditPageSize);
  const pagedAuditEntries = auditEntries.slice(
    auditPage * auditPageSize,
    auditPage * auditPageSize + auditPageSize
  );

  useEffect(() => {
    void loadResidents();
    void loadAudit();
  }, []);

  const handleFieldChange = (
    field: keyof typeof formState,
    value: string | boolean
  ) => {
    setFormState((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const resetForm = () => {
    setFormState(initialFormState);
    setPhotoFile(null);
    setSelectedLocation(null);
    setResetKey((current) => current + 1);
  };

  const resolvedLocation = useMemo(() => {
    if (selectedLocation) return selectedLocation;
    if (!formState.locationText) return null;
    return parseLatLng(formState.locationText);
  }, [formState.locationText, selectedLocation]);

  const indicators = useMemo(() => computeIndicators(formState), [formState]);

  const handleSave = async () => {
    if (!resolvedLocation) {
      setSaveFeedback({
        type: "error",
        message:
          "Informe a localizacao no mapa ou cole a coordenada do WhatsApp.",
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
    if (!photoFile) {
      setSaveFeedback({
        type: "error",
        message: "Adicione pelo menos uma foto do ponto.",
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
        city: formState.city || undefined,
        state: formState.state || undefined,
        status: formState.status,
        notes: formState.notes || undefined,
      };
      const residentResponse = await createResident(residentPayload);

      const pointPayload: CreatePointPayload = {
        lat: resolvedLocation.lat,
        lng: resolvedLocation.lng,
        status: formState.status,
        precision: formState.precision,
        category: formState.category,
        public_note: formState.publicNote || undefined,
        city: formState.city || undefined,
        state: formState.state || undefined,
        location_text: formState.locationText || undefined,
      };
      const pointResponse = await createPoint(pointPayload);

      await assignResidentPoint({
        resident_id: residentResponse.id,
        point_id: pointResponse.id,
      });

      await createResidentProfile(residentResponse.id, {
        health_score: indicators.health.score,
        health_has_clinic: formState.healthHasClinic,
        health_has_emergency: formState.healthHasEmergency,
        health_has_community_agent: formState.healthHasCommunityAgent,
        health_notes: formState.healthNotes || null,
        education_score: indicators.education.score,
        education_level: formState.educationLevel || null,
        education_has_school: formState.educationHasSchool,
        education_has_transport: formState.educationHasTransport,
        education_material_support: formState.educationMaterialSupport,
        education_notes: formState.educationNotes || null,
        income_score: indicators.income.score,
        income_monthly: formState.incomeMonthly
          ? Number(formState.incomeMonthly)
          : null,
        income_source: formState.incomeSource || null,
        assets_has_car: formState.assetsHasCar,
        assets_has_fridge: formState.assetsHasFridge,
        assets_has_furniture: formState.assetsHasFurniture,
        assets_has_land: formState.assetsHasLand,
        housing_score: indicators.housing.score,
        housing_rooms: formState.housingRooms
          ? Number(formState.housingRooms)
          : null,
        housing_area_m2: formState.housingAreaM2
          ? Number(formState.housingAreaM2)
          : null,
        housing_land_m2: formState.housingLandM2
          ? Number(formState.housingLandM2)
          : null,
        housing_type: formState.housingType || null,
        security_score: indicators.security.score,
        security_has_police_station: formState.securityHasPoliceStation,
        security_has_patrol: formState.securityHasPatrol,
        security_notes: formState.securityNotes || null,
        race_identity: formState.raceIdentity || null,
        territory_narrative: formState.territoryNarrative || null,
        territory_memories: formState.territoryMemories || null,
        territory_conflicts: formState.territoryConflicts || null,
        territory_culture: formState.territoryCulture || null,
      });

      const formData = new FormData();
      formData.append("file", photoFile);
      formData.append("point_id", pointResponse.id);
      formData.append("resident_id", residentResponse.id);
      formData.append("visibility", "public");
      await uploadAttachment(formData);

      setSaveFeedback({
        type: "success",
        message:
          "Cadastro salvo. O mapa publico sera atualizado no proximo ciclo diario.",
      });
      resetForm();
      await loadResidents();
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
          <h1>Cadastro de pessoas no mapa</h1>
          <p>
            Registre pessoas e indicadores sociais. Cada pessoa vira um ponto
            no mapa e aparece na sincronizacao diaria.
          </p>
        </div>
        <div className="dashboard-actions">
          <button className="btn btn-primary" type="button">
            Novo cadastro
          </button>
        </div>
      </section>

      <section className="form-section">
        <div className="form-header">
          <div>
            <span className="eyebrow">Cadastro e georreferenciamento</span>
            <h2>Registrar pessoa (ponto no mapa)</h2>
            <p className="muted">
              Preencha os dados, inclua fotografia e indicadores. O mapa publico
              sera atualizado a cada 24 horas.
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
                  Cidade
                  <input
                    type="text"
                    placeholder="Cidade"
                    value={formState.city}
                    onChange={(event) =>
                      handleFieldChange("city", event.target.value)
                    }
                  />
                </label>
                <label>
                  Estado
                  <input
                    type="text"
                    placeholder="UF"
                    value={formState.state}
                    onChange={(event) =>
                      handleFieldChange("state", event.target.value)
                    }
                  />
                </label>
              </div>
              <label>
                Localizacao do WhatsApp (link ou coordenada)
                <input
                  type="text"
                  placeholder="Cole o link ou 'lat,lng'"
                  value={formState.locationText}
                  onChange={(event) =>
                    handleFieldChange("locationText", event.target.value)
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
                      resolvedLocation ? resolvedLocation.lat.toFixed(5) : ""
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
                      resolvedLocation ? resolvedLocation.lng.toFixed(5) : ""
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
                Foto do ponto (obrigatoria)
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setPhotoFile(event.target.files?.[0] ?? null)
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

              <div className="form-note">
                <strong>Indicadores sociais (escala 1-10)</strong>
                <p className="muted">
                  Use 1 para baixa cobertura e 10 para alta cobertura.
                </p>
              </div>
              <div className="form-row">
                <label>
                  Saude
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={indicators.health.score}
                    readOnly
                  />
                  <span className="muted">Criterios: {indicators.health.note}</span>
                </label>
                <label>
                  Educacao
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={indicators.education.score}
                    readOnly
                  />
                  <span className="muted">
                    Criterios: {indicators.education.note}
                  </span>
                </label>
              </div>
              <div className="form-row">
                <label>
                  Renda
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={indicators.income.score}
                    readOnly
                  />
                  <span className="muted">Criterios: {indicators.income.note}</span>
                </label>
                <label>
                  Moradia
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={indicators.housing.score}
                    readOnly
                  />
                  <span className="muted">Criterios: {indicators.housing.note}</span>
                </label>
                <label>
                  Seguranca
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={indicators.security.score}
                    readOnly
                  />
                  <span className="muted">
                    Criterios: {indicators.security.note}
                  </span>
                </label>
              </div>

              <div className="form-note">
                <strong>Saude</strong>
              </div>
              <div className="checkbox-list">
                <label>
                  <input
                    type="checkbox"
                    checked={formState.healthHasClinic}
                    onChange={(event) =>
                      handleFieldChange("healthHasClinic", event.target.checked)
                    }
                  />
                  Ha posto ou unidade basica perto?
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.healthHasEmergency}
                    onChange={(event) =>
                      handleFieldChange(
                        "healthHasEmergency",
                        event.target.checked
                      )
                    }
                  />
                  Ha atendimento de emergencia?
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.healthHasCommunityAgent}
                    onChange={(event) =>
                      handleFieldChange(
                        "healthHasCommunityAgent",
                        event.target.checked
                      )
                    }
                  />
                  Acesso a agente comunitario?
                </label>
              </div>
              <label>
                Observacoes de saude
                <textarea
                  rows={2}
                  placeholder="Qualidade do atendimento, distancia, etc."
                  value={formState.healthNotes}
                  onChange={(event) =>
                    handleFieldChange("healthNotes", event.target.value)
                  }
                />
              </label>

              <div className="form-note">
                <strong>Educacao</strong>
              </div>
              <label>
                Nivel de escolaridade
                <input
                  type="text"
                  placeholder="Ensino fundamental, medio, superior..."
                  value={formState.educationLevel}
                  onChange={(event) =>
                    handleFieldChange("educationLevel", event.target.value)
                  }
                />
              </label>
              <div className="checkbox-list">
                <label>
                  <input
                    type="checkbox"
                    checked={formState.educationHasSchool}
                    onChange={(event) =>
                      handleFieldChange("educationHasSchool", event.target.checked)
                    }
                  />
                  Ha escola proxima?
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.educationHasTransport}
                    onChange={(event) =>
                      handleFieldChange(
                        "educationHasTransport",
                        event.target.checked
                      )
                    }
                  />
                  Ha transporte escolar?
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.educationMaterialSupport}
                    onChange={(event) =>
                      handleFieldChange(
                        "educationMaterialSupport",
                        event.target.checked
                      )
                    }
                  />
                  A escola fornece materiais?
                </label>
              </div>
              <label>
                Observacoes de educacao
                <textarea
                  rows={2}
                  placeholder="Qualidade da escola, turnos, etc."
                  value={formState.educationNotes}
                  onChange={(event) =>
                    handleFieldChange("educationNotes", event.target.value)
                  }
                />
              </label>

              <div className="form-note">
                <strong>Renda e bens</strong>
              </div>
              <div className="form-row">
                <label>
                  Renda mensal (R$)
                  <input
                    type="number"
                    placeholder="0"
                    value={formState.incomeMonthly}
                    onChange={(event) =>
                      handleFieldChange("incomeMonthly", event.target.value)
                    }
                  />
                </label>
                <label>
                  Fonte de renda
                  <input
                    type="text"
                    placeholder="Emprego formal, informal, beneficios..."
                    value={formState.incomeSource}
                    onChange={(event) =>
                      handleFieldChange("incomeSource", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="checkbox-list">
                <label>
                  <input
                    type="checkbox"
                    checked={formState.assetsHasCar}
                    onChange={(event) =>
                      handleFieldChange("assetsHasCar", event.target.checked)
                    }
                  />
                  Possui carro
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.assetsHasFridge}
                    onChange={(event) =>
                      handleFieldChange("assetsHasFridge", event.target.checked)
                    }
                  />
                  Possui geladeira
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.assetsHasFurniture}
                    onChange={(event) =>
                      handleFieldChange(
                        "assetsHasFurniture",
                        event.target.checked
                      )
                    }
                  />
                  Possui moveis essenciais
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.assetsHasLand}
                    onChange={(event) =>
                      handleFieldChange("assetsHasLand", event.target.checked)
                    }
                  />
                  Possui terreno proprio
                </label>
              </div>

              <div className="form-note">
                <strong>Moradia</strong>
              </div>
              <div className="form-row">
                <label>
                  Quartos
                  <input
                    type="number"
                    placeholder="0"
                    value={formState.housingRooms}
                    onChange={(event) =>
                      handleFieldChange("housingRooms", event.target.value)
                    }
                  />
                </label>
                <label>
                  Area da casa (m2)
                  <input
                    type="number"
                    placeholder="0"
                    value={formState.housingAreaM2}
                    onChange={(event) =>
                      handleFieldChange("housingAreaM2", event.target.value)
                    }
                  />
                </label>
                <label>
                  Area do terreno (m2)
                  <input
                    type="number"
                    placeholder="0"
                    value={formState.housingLandM2}
                    onChange={(event) =>
                      handleFieldChange("housingLandM2", event.target.value)
                    }
                  />
                </label>
              </div>
              <label>
                Tipo de moradia
                <input
                  type="text"
                  placeholder="Alvenaria, madeira, aluguel, etc."
                  value={formState.housingType}
                  onChange={(event) =>
                    handleFieldChange("housingType", event.target.value)
                  }
                />
              </label>

              <div className="form-note">
                <strong>Seguranca</strong>
              </div>
              <div className="checkbox-list">
                <label>
                  <input
                    type="checkbox"
                    checked={formState.securityHasPoliceStation}
                    onChange={(event) =>
                      handleFieldChange(
                        "securityHasPoliceStation",
                        event.target.checked
                      )
                    }
                  />
                  Ha delegacia proxima?
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.securityHasPatrol}
                    onChange={(event) =>
                      handleFieldChange(
                        "securityHasPatrol",
                        event.target.checked
                      )
                    }
                  />
                  Ha patrulhamento regular?
                </label>
              </div>
              <label>
                Observacoes de seguranca
                <textarea
                  rows={2}
                  placeholder="Percepcao de risco, ocorrencias, etc."
                  value={formState.securityNotes}
                  onChange={(event) =>
                    handleFieldChange("securityNotes", event.target.value)
                  }
                />
              </label>

              <div className="form-note">
                <strong>Identidade e territorio</strong>
              </div>
              <label>
                Identificacao racial
                <input
                  type="text"
                  placeholder="Autodeclaracao"
                  value={formState.raceIdentity}
                  onChange={(event) =>
                    handleFieldChange("raceIdentity", event.target.value)
                  }
                />
              </label>
              <label>
                Narrativa do territorio
                <textarea
                  rows={3}
                  placeholder="Resumo da historia, identidade e dinamicas locais"
                  value={formState.territoryNarrative}
                  onChange={(event) =>
                    handleFieldChange("territoryNarrative", event.target.value)
                  }
                />
              </label>
              <label>
                Memoriais e referencias
                <textarea
                  rows={3}
                  placeholder="Memoria coletiva, marcos simbolicos"
                  value={formState.territoryMemories}
                  onChange={(event) =>
                    handleFieldChange("territoryMemories", event.target.value)
                  }
                />
              </label>
              <label>
                Conflitos e tensoes
                <textarea
                  rows={3}
                  placeholder="Conflitos territoriais, disputas, etc."
                  value={formState.territoryConflicts}
                  onChange={(event) =>
                    handleFieldChange("territoryConflicts", event.target.value)
                  }
                />
              </label>
              <label>
                Manifestacoes culturais
                <textarea
                  rows={3}
                  placeholder="Festas, praticas culturais, coletivos"
                  value={formState.territoryCulture}
                  onChange={(event) =>
                    handleFieldChange("territoryCulture", event.target.value)
                  }
                />
              </label>

              {saveFeedback && (
                <div
                  className={
                    saveFeedback.type === "success"
                      ? "alert alert-success"
                      : "alert"
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
                <button
                  className="btn btn-outline"
                  type="button"
                  disabled={saving}
                  onClick={resetForm}
                >
                  Limpar formulario
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

      <section className="table-section">
        <div className="table-header">
          <div>
            <span className="eyebrow">Pessoas</span>
            <h2>Pessoas cadastradas (pontos)</h2>
          </div>
          <Link className="btn btn-primary" to="/relatorios">
            Gerar relatorio publico
          </Link>
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
              {residents.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="table-empty">
                      Nenhum cadastro registrado ainda.
                    </div>
                  </td>
                </tr>
              ) : (
                residents.map((resident) => (
                  <tr key={resident.id}>
                    <td>{resident.id}</td>
                    <td>{resident.full_name}</td>
                    <td>{resident.city ?? "-"}</td>
                    <td>{resident.state ?? "-"}</td>
                    <td>
                      <span className={`status ${resident.status}`}>
                        {formatStatus(resident.status as "active" | "inactive")}
                      </span>
                    </td>
                    <td>{new Date(resident.created_at).toLocaleDateString()}</td>
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
            <span className="eyebrow">Registro</span>
            <h2>
              {auditView === "recent"
                ? "Minhas acoes recentes (ultimas 10)"
                : "Historico completo de acoes"}
            </h2>
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
        <div className="table-card">
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
      </section>
    </div>
  );
}
