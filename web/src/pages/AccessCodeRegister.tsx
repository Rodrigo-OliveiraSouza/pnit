import { useMemo, useState } from "react";
import MapEditor, { type SelectedLocation } from "../components/MapEditor";
import {
  submitAccessCodeRegistration,
  validateAccessCode,
  type AccessCodeSubmissionPayload,
} from "../services/api";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";

type BrazilCity = { name: string; state: string };
const BRAZIL_CITIES = citiesData as BrazilCity[];

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
  birthDate: "",
  sex: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  neighborhood: "",
  communityName: "",
  householdSize: "",
  childrenCount: "",
  elderlyCount: "",
  pcdCount: "",
  status: "active" as "active" | "inactive",
  category: "Residencia",
  precision: "approx" as "approx" | "exact",
  areaType: "",
  referencePoint: "",
  publicNote: "",
  notes: "",
  locationText: "",
  raceIdentity: "",
  territoryNarrative: "",
  territoryMemories: "",
  territoryConflicts: "",
  territoryCulture: "",
  energyAccess: "",
  waterSupply: "",
  waterTreatment: "",
  sewageType: "",
  garbageCollection: "",
  internetAccess: false,
  transportAccess: false,
  healthHasClinic: false,
  healthHasEmergency: false,
  healthHasCommunityAgent: false,
  healthUnitDistanceKm: "",
  healthTravelTime: "",
  healthHasRegularService: false,
  healthHasAmbulance: false,
  healthDifficulties: "",
  healthNotes: "",
  educationLevel: "",
  educationHasSchool: false,
  educationHasTransport: false,
  educationMaterialSupport: false,
  educationHasInternet: false,
  educationNotes: "",
  incomeMonthly: "",
  incomeSource: "",
  incomeContributors: "",
  incomeOccupationType: "",
  incomeHasSocialProgram: false,
  incomeSocialProgram: "",
  assetsHasCar: false,
  assetsHasFridge: false,
  assetsHasFurniture: false,
  assetsHasLand: false,
  housingRooms: "",
  housingAreaM2: "",
  housingLandM2: "",
  housingType: "",
  housingMaterial: "",
  housingHasBathroom: false,
  housingHasWaterTreated: false,
  housingCondition: "",
  housingRisks: "",
  securityHasPoliceStation: false,
  securityHasPatrol: false,
  securityHasGuard: false,
  securityOccurrences: "",
  securityNotes: "",
  participationTypes: "",
  participationEvents: "",
  participationEngagement: "",
  demandPriorities: "",
  vulnerabilityLevel: "",
  technicalIssues: "",
  referrals: "",
  agenciesContacted: "",
  consentAccepted: false,
};

type AccessFormState = typeof initialFormState;

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

function computeIndicators(form: AccessFormState): IndicatorSet {
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

export default function AccessCodeRegister() {
  const [code, setCode] = useState("");
  const [formState, setFormState] = useState(initialFormState);
  const [codeValidated, setCodeValidated] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  const availableCities = useMemo(() => {
    if (!formState.state) return [] as BrazilCity[];
    return BRAZIL_CITIES.filter((item) => item.state === formState.state);
  }, [formState.state]);

  const resolvedLocation = useMemo(() => {
    if (selectedLocation) return selectedLocation;
    if (!formState.locationText) return null;
    return parseLatLng(formState.locationText);
  }, [formState.locationText, selectedLocation]);

  const indicators = useMemo(
    () => computeIndicators(formState),
    [formState]
  );

  const handleFieldChange = <K extends keyof AccessFormState>(
    field: K,
    value: AccessFormState[K]
  ) => {
    setFormState((current) => ({ ...current, [field]: value }));
  };

  const handleValidateCode = async () => {
    setCodeError(null);
    if (!code.trim()) {
      setCodeError("Informe o codigo de acesso.");
      return;
    }
    setCodeLoading(true);
    try {
      const response = await validateAccessCode(code.trim().toUpperCase());
      if (!response.ok) {
        setCodeError("Codigo invalido ou expirado.");
        setCodeValidated(false);
        return;
      }
      setCode(response.code);
      setCodeValidated(true);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao validar o codigo.";
      setCodeError(message);
      setCodeValidated(false);
    } finally {
      setCodeLoading(false);
    }
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!codeValidated) {
      setFeedback({ type: "error", message: "Valide o codigo de acesso." });
      return;
    }
    if (!code.trim()) {
      setFeedback({ type: "error", message: "Informe o codigo de acesso." });
      return;
    }
    if (!formState.fullName.trim()) {
      setFeedback({ type: "error", message: "Informe o nome completo." });
      return;
    }
    if (!formState.communityName.trim()) {
      setFeedback({ type: "error", message: "Informe a comunidade." });
      return;
    }
    if (!formState.city.trim() || !formState.state.trim()) {
      setFeedback({ type: "error", message: "Informe cidade e estado." });
      return;
    }
    if (!formState.consentAccepted) {
      setFeedback({
        type: "error",
        message: "Aceite o termo de consentimento para continuar.",
      });
      return;
    }
    if (!resolvedLocation) {
      setFeedback({
        type: "error",
        message: "Informe a localizacao no mapa ou cole a coordenada.",
      });
      return;
    }

    const householdSize = parseNumber(formState.householdSize);
    const childrenCount = parseNumber(formState.childrenCount);
    const elderlyCount = parseNumber(formState.elderlyCount);
    const pcdCount = parseNumber(formState.pcdCount);
    const healthDistance = parseNumber(formState.healthUnitDistanceKm);
    const incomeContributors = parseNumber(formState.incomeContributors);
    const rooms = parseNumber(formState.housingRooms);
    const houseArea = parseNumber(formState.housingAreaM2);
    const landArea = parseNumber(formState.housingLandM2);

    const payload: AccessCodeSubmissionPayload = {
      code: code.trim().toUpperCase(),
      resident: {
        full_name: formState.fullName.trim(),
        doc_id: formState.docId.trim() || null,
        birth_date: formState.birthDate.trim() || null,
        sex: formState.sex || null,
        phone: formState.phone.trim() || null,
        email: formState.email.trim() || null,
        address: formState.address.trim() || null,
        city: formState.city.trim(),
        state: formState.state.trim(),
        neighborhood: formState.neighborhood.trim() || null,
        community_name: formState.communityName.trim(),
        household_size: householdSize ?? null,
        children_count: childrenCount ?? null,
        elderly_count: elderlyCount ?? null,
        pcd_count: pcdCount ?? null,
        notes: formState.notes.trim() || null,
        status: formState.status,
      },
      profile: {
        health_score: indicators.health.score,
        education_score: indicators.education.score,
        income_score: indicators.income.score,
        housing_score: indicators.housing.score,
        security_score: indicators.security.score,
        health_has_clinic: formState.healthHasClinic,
        health_has_emergency: formState.healthHasEmergency,
        health_has_community_agent: formState.healthHasCommunityAgent,
        health_unit_distance_km: healthDistance ?? null,
        health_travel_time: formState.healthTravelTime || null,
        health_has_regular_service: formState.healthHasRegularService,
        health_has_ambulance: formState.healthHasAmbulance,
        health_difficulties: formState.healthDifficulties || null,
        health_notes: formState.healthNotes || null,
        education_level: formState.educationLevel || null,
        education_has_school: formState.educationHasSchool,
        education_has_transport: formState.educationHasTransport,
        education_material_support: formState.educationMaterialSupport,
        education_has_internet: formState.educationHasInternet,
        education_notes: formState.educationNotes || null,
        income_monthly: formState.incomeMonthly
          ? Number(formState.incomeMonthly)
          : null,
        income_source: formState.incomeSource || null,
        income_contributors: incomeContributors ?? null,
        income_occupation_type: formState.incomeOccupationType || null,
        income_has_social_program: formState.incomeHasSocialProgram,
        income_social_program: formState.incomeSocialProgram || null,
        assets_has_car: formState.assetsHasCar,
        assets_has_fridge: formState.assetsHasFridge,
        assets_has_furniture: formState.assetsHasFurniture,
        assets_has_land: formState.assetsHasLand,
        housing_rooms: rooms ?? null,
        housing_area_m2: houseArea ?? null,
        housing_land_m2: landArea ?? null,
        housing_type: formState.housingType || null,
        housing_material: formState.housingMaterial || null,
        housing_has_bathroom: formState.housingHasBathroom,
        housing_has_water_treated: formState.housingHasWaterTreated,
        housing_condition: formState.housingCondition || null,
        housing_risks: formState.housingRisks || null,
        security_has_police_station: formState.securityHasPoliceStation,
        security_has_patrol: formState.securityHasPatrol,
        security_has_guard: formState.securityHasGuard,
        security_occurrences: formState.securityOccurrences || null,
        security_notes: formState.securityNotes || null,
        race_identity: formState.raceIdentity || null,
        territory_narrative: formState.territoryNarrative || null,
        territory_memories: formState.territoryMemories || null,
        territory_conflicts: formState.territoryConflicts || null,
        territory_culture: formState.territoryCulture || null,
        energy_access: formState.energyAccess || null,
        water_supply: formState.waterSupply || null,
        water_treatment: formState.waterTreatment || null,
        sewage_type: formState.sewageType || null,
        garbage_collection: formState.garbageCollection || null,
        internet_access: formState.internetAccess,
        transport_access: formState.transportAccess,
        participation_types: formState.participationTypes || null,
        participation_events: formState.participationEvents || null,
        participation_engagement: formState.participationEngagement || null,
        demand_priorities: formState.demandPriorities || null,
        vulnerability_level: formState.vulnerabilityLevel || null,
        technical_issues: formState.technicalIssues || null,
        referrals: formState.referrals || null,
        agencies_contacted: formState.agenciesContacted || null,
        consent_accepted: formState.consentAccepted,
      },
      point: {
        lat: resolvedLocation.lat,
        lng: resolvedLocation.lng,
        precision: formState.precision,
        status: formState.status,
        category: formState.category,
        public_note: formState.publicNote.trim() || null,
        area_type: formState.areaType || null,
        reference_point: formState.referencePoint.trim() || null,
        city: formState.city.trim(),
        state: formState.state.trim(),
        community_name: formState.communityName.trim(),
        location_text: formState.locationText.trim() || null,
      },
    };

    setSaving(true);
    try {
      await submitAccessCodeRegistration(payload);
      setFeedback({
        type: "success",
        message:
          "Cadastro enviado. O responsavel pelo codigo fara a aprovacao.",
      });
      setCode("");
      setFormState(initialFormState);
      setSelectedLocation(null);
      setCodeValidated(false);
      setCodeError(null);
      setResetKey((current) => current + 1);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao enviar cadastro.";
      setFeedback({ type: "error", message });
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="page">
      <section className="form-section">
        <div className="form-header">
          <div>
            <span className="eyebrow">Cadastro com codigo</span>
            <h1>Registrar pessoa com acesso unico</h1>
            <p className="muted">
              Insira o codigo fornecido e preencha todos os dados para enviar o
              registro. O responsavel pelo codigo aprovara o cadastro.
            </p>
          </div>
        </div>
        {feedback && (
          <div className={`alert ${feedback.type}`}>{feedback.message}</div>
        )}
        <div className="form-card">
          <div className="form-grid">
            <label className="full">
              Codigo de acesso
              <input
                type="text"
                value={code}
                onChange={(event) => {
                  setCode(event.target.value);
                  setCodeError(null);
                  if (codeValidated) setCodeValidated(false);
                }}
                placeholder="Ex: A1B2C3D4"
                disabled={codeValidated}
              />
            </label>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void handleValidateCode()}
              disabled={codeLoading || codeValidated}
            >
              {codeValidated
                ? "Codigo validado"
                : codeLoading
                ? "Validando..."
                : "Validar codigo"}
            </button>
            {codeValidated && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => {
                  setCodeValidated(false);
                  setCode("");
                }}
              >
                Trocar codigo
              </button>
            )}
          </div>
          {codeError && <div className="alert error">{codeError}</div>}
        </div>

        {!codeValidated ? (
          <div className="empty-state">
            Informe o codigo para liberar o formulario completo.
          </div>
        ) : (
          <div className="form-card">
            <div className="form-grid">
              <label>
                Nome completo
                <input
                  type="text"
                  value={formState.fullName}
                  onChange={(event) =>
                    handleFieldChange("fullName", event.target.value)
                  }
                />
              </label>
              <label>
                CPF / Documento
                <input
                  type="text"
                  value={formState.docId}
                  onChange={(event) =>
                    handleFieldChange("docId", event.target.value)
                  }
                />
              </label>
              <label>
                Data de nascimento
                <input
                  type="date"
                  value={formState.birthDate}
                  onChange={(event) =>
                    handleFieldChange("birthDate", event.target.value)
                  }
                />
              </label>
              <label>
                Sexo
                <select
                  className="select"
                  value={formState.sex}
                  onChange={(event) =>
                    handleFieldChange("sex", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="feminino">Feminino</option>
                  <option value="masculino">Masculino</option>
                  <option value="outro">Outro</option>
                </select>
              </label>
              <label>
                Telefone
                <input
                  type="text"
                  value={formState.phone}
                  onChange={(event) =>
                    handleFieldChange("phone", event.target.value)
                  }
                />
              </label>
              <label>
                Email
                <input
                  type="email"
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
                  value={formState.address}
                  onChange={(event) =>
                    handleFieldChange("address", event.target.value)
                  }
                />
              </label>
              <label>
                Bairro ou zona rural
                <input
                  type="text"
                  value={formState.neighborhood}
                  onChange={(event) =>
                    handleFieldChange("neighborhood", event.target.value)
                  }
                />
              </label>
              <label>
                Ponto de referencia
                <input
                  type="text"
                  value={formState.referencePoint}
                  onChange={(event) =>
                    handleFieldChange("referencePoint", event.target.value)
                  }
                />
              </label>
              <label>
                Comunidade
                <input
                  type="text"
                  value={formState.communityName}
                  onChange={(event) =>
                    handleFieldChange("communityName", event.target.value)
                  }
                />
              </label>
              <label>
                Estado
                <select
                  className="select"
                  value={formState.state}
                  onChange={(event) => {
                    handleFieldChange("state", event.target.value);
                    handleFieldChange("city", "");
                  }}
                >
                  <option value="">Selecione</option>
                  {BRAZIL_STATES.map((item) => (
                    <option key={item.code} value={item.code}>
                      {item.code} - {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cidade
                <select
                  className="select"
                  value={formState.city}
                  onChange={(event) =>
                    handleFieldChange("city", event.target.value)
                  }
                  disabled={!formState.state}
                >
                  <option value="">
                    {formState.state
                      ? "Selecione"
                      : "Selecione o estado primeiro"}
                  </option>
                  {availableCities.map((item) => (
                    <option key={`${item.state}-${item.name}`} value={item.name}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Moradores no domicilio
                <input
                  type="number"
                  min="0"
                  value={formState.householdSize}
                  onChange={(event) =>
                    handleFieldChange("householdSize", event.target.value)
                  }
                />
              </label>
              <label>
                Quantas criancas
                <input
                  type="number"
                  min="0"
                  value={formState.childrenCount}
                  onChange={(event) =>
                    handleFieldChange("childrenCount", event.target.value)
                  }
                />
              </label>
              <label>
                Quantos idosos
                <input
                  type="number"
                  min="0"
                  value={formState.elderlyCount}
                  onChange={(event) =>
                    handleFieldChange("elderlyCount", event.target.value)
                  }
                />
              </label>
              <label>
                Pessoas com deficiencia
                <input
                  type="number"
                  min="0"
                  value={formState.pcdCount}
                  onChange={(event) =>
                    handleFieldChange("pcdCount", event.target.value)
                  }
                />
              </label>
              <label>
                Status
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
              <label className="full">
                Observacoes publicas
                <textarea
                  rows={2}
                  value={formState.publicNote}
                  onChange={(event) =>
                    handleFieldChange("publicNote", event.target.value)
                  }
                />
              </label>
              <label className="full">
                Observacoes do agente
                <textarea
                  rows={2}
                  value={formState.notes}
                  onChange={(event) =>
                    handleFieldChange("notes", event.target.value)
                  }
                />
              </label>
            </div>

            <div className="form-note">
              <strong>Localizacao</strong>
            </div>
            <div className="form-row">
              <label>
                Tipo de area
                <select
                  className="select"
                  value={formState.areaType}
                  onChange={(event) =>
                    handleFieldChange("areaType", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="urbana">Urbana</option>
                  <option value="rural">Rural</option>
                  <option value="periurbana">Periurbana</option>
                </select>
              </label>
              <label>
                Precisao da localizacao
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
                  <option value="approx">Aproximada</option>
                  <option value="exact">Exata</option>
                </select>
              </label>
            </div>
            <label>
              Coordenada (WhatsApp)
              <input
                type="text"
                placeholder="-12.3456, -38.1234"
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
                  value={resolvedLocation ? resolvedLocation.lat.toFixed(5) : ""}
                  readOnly
                />
              </label>
              <label>
                Longitude
                <input
                  type="text"
                  value={resolvedLocation ? resolvedLocation.lng.toFixed(5) : ""}
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
            </div>
            <div className="form-note">
              <strong>Infraestrutura basica</strong>
            </div>
            <div className="form-row">
              <label>
                Energia eletrica
                <select
                  className="select"
                  value={formState.energyAccess}
                  onChange={(event) =>
                    handleFieldChange("energyAccess", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="regular">Regular</option>
                  <option value="irregular">Irregular</option>
                  <option value="inexistente">Inexistente</option>
                </select>
              </label>
              <label>
                Abastecimento de agua
                <select
                  className="select"
                  value={formState.waterSupply}
                  onChange={(event) =>
                    handleFieldChange("waterSupply", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="rede_publica">Rede publica</option>
                  <option value="poco">Poco</option>
                  <option value="rio">Rio</option>
                  <option value="carro_pipa">Carro-pipa</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Tratamento da agua
                <select
                  className="select"
                  value={formState.waterTreatment}
                  onChange={(event) =>
                    handleFieldChange("waterTreatment", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Nao</option>
                </select>
              </label>
              <label>
                Esgotamento sanitario
                <select
                  className="select"
                  value={formState.sewageType}
                  onChange={(event) =>
                    handleFieldChange("sewageType", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="rede">Rede</option>
                  <option value="fossa">Fossa</option>
                  <option value="inexistente">Inexistente</option>
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Coleta de lixo
                <select
                  className="select"
                  value={formState.garbageCollection}
                  onChange={(event) =>
                    handleFieldChange("garbageCollection", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="regular">Regular</option>
                  <option value="irregular">Irregular</option>
                  <option value="nao_existe">Nao existe</option>
                </select>
              </label>
              <label>
                Acesso a internet
                <select
                  className="select"
                  value={
                    formState.internetAccess
                      ? "sim"
                      : formState.internetAccess === false
                      ? "nao"
                      : ""
                  }
                  onChange={(event) =>
                    handleFieldChange(
                      "internetAccess",
                      event.target.value === "sim"
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Nao</option>
                </select>
              </label>
              <label>
                Transporte publico
                <select
                  className="select"
                  value={
                    formState.transportAccess
                      ? "sim"
                      : formState.transportAccess === false
                      ? "nao"
                      : ""
                  }
                  onChange={(event) =>
                    handleFieldChange(
                      "transportAccess",
                      event.target.value === "sim"
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option value="sim">Sim</option>
                  <option value="nao">Nao</option>
                </select>
              </label>
            </div>

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
                <span className="muted">
                  Criterios: {indicators.health.note}
                </span>
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
                <span className="muted">
                  Criterios: {indicators.housing.note}
                </span>
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
                    handleFieldChange("healthHasEmergency", event.target.checked)
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
              <label>
                <input
                  type="checkbox"
                  checked={formState.healthHasRegularService}
                  onChange={(event) =>
                    handleFieldChange(
                      "healthHasRegularService",
                      event.target.checked
                    )
                  }
                />
                Possui atendimento regular?
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formState.healthHasAmbulance}
                  onChange={(event) =>
                    handleFieldChange(
                      "healthHasAmbulance",
                      event.target.checked
                    )
                  }
                />
                Possui ambulancia?
              </label>
            </div>
            <div className="form-row">
              <label>
                Unidade de saude mais proxima (km)
                <input
                  type="number"
                  placeholder="0"
                  value={formState.healthUnitDistanceKm}
                  onChange={(event) =>
                    handleFieldChange(
                      "healthUnitDistanceKm",
                      event.target.value
                    )
                  }
                />
              </label>
              <label>
                Tempo medio de deslocamento
                <input
                  type="text"
                  placeholder="Ex: 30 min"
                  value={formState.healthTravelTime}
                  onChange={(event) =>
                    handleFieldChange("healthTravelTime", event.target.value)
                  }
                />
              </label>
            </div>
            <label>
              Principais dificuldades
              <input
                type="text"
                placeholder="Transporte, profissionais, medicamentos..."
                value={formState.healthDifficulties}
                onChange={(event) =>
                  handleFieldChange("healthDifficulties", event.target.value)
                }
              />
            </label>
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
              <label>
                <input
                  type="checkbox"
                  checked={formState.educationHasInternet}
                  onChange={(event) =>
                    handleFieldChange(
                      "educationHasInternet",
                      event.target.checked
                    )
                  }
                />
                Acesso a internet para estudo?
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
            <div className="form-row">
              <label>
                Pessoas que contribuem com renda
                <input
                  type="number"
                  placeholder="0"
                  value={formState.incomeContributors}
                  onChange={(event) =>
                    handleFieldChange("incomeContributors", event.target.value)
                  }
                />
              </label>
              <label>
                Tipo de ocupacao
                <select
                  className="select"
                  value={formState.incomeOccupationType}
                  onChange={(event) =>
                    handleFieldChange(
                      "incomeOccupationType",
                      event.target.value
                    )
                  }
                >
                  <option value="">Selecione</option>
                  <option value="formal">Formal</option>
                  <option value="informal">Informal</option>
                  <option value="autonomo">Autonomo</option>
                  <option value="rural">Rural</option>
                </select>
              </label>
            </div>
            <div className="checkbox-list">
              <label>
                <input
                  type="checkbox"
                  checked={formState.incomeHasSocialProgram}
                  onChange={(event) =>
                    handleFieldChange(
                      "incomeHasSocialProgram",
                      event.target.checked
                    )
                  }
                />
                Participa de programas sociais?
              </label>
            </div>
            <label>
              Qual programa social
              <input
                type="text"
                placeholder="Bolsa familia, BPC, etc."
                value={formState.incomeSocialProgram}
                onChange={(event) =>
                  handleFieldChange("incomeSocialProgram", event.target.value)
                }
              />
            </label>
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
                placeholder="Aluguel ou casa propria"
                value={formState.housingType}
                onChange={(event) =>
                  handleFieldChange("housingType", event.target.value)
                }
              />
            </label>
            <div className="form-row">
              <label>
                Material predominante
                <select
                  className="select"
                  value={formState.housingMaterial}
                  onChange={(event) =>
                    handleFieldChange("housingMaterial", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="alvenaria">Alvenaria</option>
                  <option value="madeira">Madeira</option>
                  <option value="mista">Mista</option>
                </select>
              </label>
              <label>
                Condicao da moradia
                <select
                  className="select"
                  value={formState.housingCondition}
                  onChange={(event) =>
                    handleFieldChange("housingCondition", event.target.value)
                  }
                >
                  <option value="">Selecione</option>
                  <option value="boa">Boa</option>
                  <option value="regular">Regular</option>
                  <option value="precaria">Precaria</option>
                </select>
              </label>
            </div>
            <div className="checkbox-list">
              <label>
                <input
                  type="checkbox"
                  checked={formState.housingHasBathroom}
                  onChange={(event) =>
                    handleFieldChange(
                      "housingHasBathroom",
                      event.target.checked
                    )
                  }
                />
                Possui banheiro interno?
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formState.housingHasWaterTreated}
                  onChange={(event) =>
                    handleFieldChange(
                      "housingHasWaterTreated",
                      event.target.checked
                    )
                  }
                />
                Possui agua tratada?
              </label>
            </div>
            <label>
              Riscos ambientais
              <input
                type="text"
                placeholder="Enchente, deslizamento, seca, nenhum"
                value={formState.housingRisks}
                onChange={(event) =>
                  handleFieldChange("housingRisks", event.target.value)
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
                    handleFieldChange("securityHasPatrol", event.target.checked)
                  }
                />
                Ha patrulhamento regular?
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={formState.securityHasGuard}
                  onChange={(event) =>
                    handleFieldChange("securityHasGuard", event.target.checked)
                  }
                />
                Ha guarda municipal?
              </label>
            </div>
            <label>
              Ocorrencias frequentes
              <input
                type="text"
                placeholder="Furto, violencia, conflitos..."
                value={formState.securityOccurrences}
                onChange={(event) =>
                  handleFieldChange("securityOccurrences", event.target.value)
                }
              />
            </label>
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
              Memorias e referencias
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
            <div className="form-note">
              <strong>Participacao social</strong>
            </div>
            <label>
              Participa de
              <input
                type="text"
                placeholder="Associacao, conselho, projetos sociais..."
                value={formState.participationTypes}
                onChange={(event) =>
                  handleFieldChange("participationTypes", event.target.value)
                }
              />
            </label>
            <label>
              Ja participou de
              <input
                type="text"
                placeholder="Audiencias, conferencias, capacitacoes..."
                value={formState.participationEvents}
                onChange={(event) =>
                  handleFieldChange("participationEvents", event.target.value)
                }
              />
            </label>
            <label>
              Grau de engajamento comunitario
              <select
                className="select"
                value={formState.participationEngagement}
                onChange={(event) =>
                  handleFieldChange(
                    "participationEngagement",
                    event.target.value
                  )
                }
              >
                <option value="">Selecione</option>
                <option value="alto">Alto</option>
                <option value="medio">Medio</option>
                <option value="baixo">Baixo</option>
              </select>
            </label>

            <div className="form-note">
              <strong>Demandas prioritarias</strong>
            </div>
            <label>
              Demandas
              <input
                type="text"
                placeholder="Infraestrutura, saude, educacao, emprego..."
                value={formState.demandPriorities}
                onChange={(event) =>
                  handleFieldChange("demandPriorities", event.target.value)
                }
              />
            </label>

            <div className="form-note">
              <strong>Avaliacao tecnica do agente</strong>
            </div>
            <label>
              Nivel de vulnerabilidade
              <select
                className="select"
                value={formState.vulnerabilityLevel}
                onChange={(event) =>
                  handleFieldChange("vulnerabilityLevel", event.target.value)
                }
              >
                <option value="">Selecione</option>
                <option value="baixo">Baixo</option>
                <option value="medio">Medio</option>
                <option value="alto">Alto</option>
              </select>
            </label>
            <label>
              Principais problemas identificados
              <textarea
                rows={3}
                value={formState.technicalIssues}
                onChange={(event) =>
                  handleFieldChange("technicalIssues", event.target.value)
                }
              />
            </label>
            <label>
              Encaminhamentos realizados
              <textarea
                rows={3}
                value={formState.referrals}
                onChange={(event) =>
                  handleFieldChange("referrals", event.target.value)
                }
              />
            </label>
            <label>
              Orgaos acionados
              <textarea
                rows={3}
                value={formState.agenciesContacted}
                onChange={(event) =>
                  handleFieldChange("agenciesContacted", event.target.value)
                }
              />
            </label>

            <div className="form-note">
              <strong>Consentimento institucional</strong>
            </div>
            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={formState.consentAccepted}
                onChange={(event) =>
                  handleFieldChange("consentAccepted", event.target.checked)
                }
              />
              Autorizo a utilizacao dos dados coletados exclusivamente para fins
              de diagnostico territorial, planejamento de politicas publicas e
              relatorios institucionais, conforme a LGPD.
            </label>

            <div className="form-note">
              <strong>Mapa</strong>
            </div>
            <div className="map-card">
              <MapEditor
                onLocationChange={setSelectedLocation}
                resetKey={resetKey}
              />
            </div>

            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => void handleSubmit()}
                disabled={saving}
              >
                {saving ? "Enviando..." : "Enviar cadastro"}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
