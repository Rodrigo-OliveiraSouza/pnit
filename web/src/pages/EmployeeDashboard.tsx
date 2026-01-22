
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import MapEditor, { type SelectedLocation } from "../components/MapEditor";
import { AdminPanel } from "./Admin";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";
import {
  assignResidentPoint,
  createCommunity,
  createPoint,
  createResident,
  createResidentProfile,
  fetchCommunities,
  fetchResidentDetail,
  getAuthRole,
  listResidents,
  updatePoint,
  updateResident,
  uploadAttachment,
  type CreatePointPayload,
  type CreateResidentPayload,
  type CommunityInfo,
} from "../services/api";
import { formatStatus } from "../utils/format";

type DashboardResident = {
  id: string;
  full_name: string;
  city?: string | null;
  state?: string | null;
  community_name?: string | null;
  status: string;
  created_at: string;
};

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

const normalizeCommunityName = (value: string) => value.trim().toLowerCase();

const initialFormState = {
  fullName: "",
  docId: "",
  phone: "",
  email: "",
  address: "",
  city: "",
  state: "",
  communityName: "",
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

type EditResidentForm = {
  id: string;
  pointId?: string | null;
  fullName: string;
  docId: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  communityName: string;
  status: "active" | "inactive";
  notes: string;
};

type CommunityDraft = {
  name: string;
  activity: string;
  focusSocial: string;
  notes: string;
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
  const role = getAuthRole();
  const isAdmin = role === "admin";
  const [activeTab, setActiveTab] = useState<
    "register" | "people" | "admin"
  >("register");
  const [formState, setFormState] = useState(initialFormState);
  const [communityCatalog, setCommunityCatalog] = useState<CommunityInfo[]>([]);
  const [communityOptions, setCommunityOptions] = useState<string[]>([]);
  const [communityOptionsError, setCommunityOptionsError] = useState<string | null>(
    null
  );
  const [showCommunityForm, setShowCommunityForm] = useState(false);
  const [communityDraft, setCommunityDraft] = useState<CommunityDraft>({
    name: "",
    activity: "",
    focusSocial: "",
    notes: "",
  });
  const [communitySaving, setCommunitySaving] = useState(false);
  const [communityFeedback, setCommunityFeedback] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const availableCities = useMemo(() => {
    if (!formState.state) return BRAZIL_CITIES;
    return BRAZIL_CITIES.filter((city) => city.state === formState.state);
  }, [formState.state]);
  const selectedCityValue =
    formState.city && formState.state ? `${formState.city}__${formState.state}` : "";
  const [editForm, setEditForm] = useState<EditResidentForm | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editFeedback, setEditFeedback] = useState<string | null>(null);
  const editAvailableCities = useMemo(() => {
    if (!editForm?.state) return BRAZIL_CITIES;
    return BRAZIL_CITIES.filter((city) => city.state === editForm.state);
  }, [editForm?.state]);
  const editSelectedCityValue =
    editForm?.city && editForm.state ? `${editForm.city}__${editForm.state}` : "";
  const selectedCommunity = useMemo(() => {
    const key = normalizeCommunityName(formState.communityName);
    if (!key) {
      return null;
    }
    return (
      communityCatalog.find(
        (item) => normalizeCommunityName(item.name) === key
      ) ?? null
    );
  }, [formState.communityName, communityCatalog]);

  const loadResidents = async () => {
    try {
      const response = await listResidents("me");
      setResidents(response.items);
    } catch {
      setResidents([]);
    }
  };

  useEffect(() => {
    void loadResidents();
  }, []);

  const loadCommunityOptions = async () => {
    setCommunityOptionsError(null);
    try {
      const response = await fetchCommunities();
      setCommunityCatalog(response.items);
      const names = response.items
        .map((item) => item.name)
        .filter(Boolean);
      const unique = Array.from(new Set(names)).sort((a, b) =>
        a.localeCompare(b)
      );
      setCommunityOptions(unique);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao carregar quilombos.";
      setCommunityOptionsError(message);
    }
  };

  useEffect(() => {
    void loadCommunityOptions();
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

  const handleStateSelect = (value: string) => {
    setFormState((current) => ({
      ...current,
      state: value,
      city: "",
    }));
  };

  const handleCitySelect = (value: string) => {
    if (!value) {
      setFormState((current) => ({ ...current, city: "" }));
      return;
    }
    const [cityName, stateCode] = value.split("__");
    setFormState((current) => ({
      ...current,
      city: cityName,
      state: stateCode,
    }));
  };

  const handleCommunityDraftChange = (
    field: keyof CommunityDraft,
    value: string
  ) => {
    setCommunityDraft((current) => ({
      ...current,
      [field]: value,
    }));
  };

  const openCommunityForm = () => {
    setCommunityFeedback(null);
    setCommunityDraft({
      name: formState.communityName,
      activity: selectedCommunity?.activity ?? "",
      focusSocial: selectedCommunity?.focus_social ?? "",
      notes: selectedCommunity?.notes ?? "",
    });
    setShowCommunityForm(true);
  };

  const handleCommunitySave = async () => {
    const name = communityDraft.name.trim();
    if (!name) {
      setCommunityFeedback("Informe o nome da comunidade.");
      return;
    }
    setCommunitySaving(true);
    setCommunityFeedback(null);
    try {
      const response = await createCommunity({
        name,
        activity: communityDraft.activity.trim() || undefined,
        focus_social: communityDraft.focusSocial.trim() || undefined,
        notes: communityDraft.notes.trim() || undefined,
        city: formState.city || undefined,
        state: formState.state || undefined,
      });
      const item = response.item;
      setCommunityCatalog((current) => {
        const key = normalizeCommunityName(item.name);
        const next = current.filter(
          (entry) => normalizeCommunityName(entry.name) !== key
        );
        return [...next, item].sort((a, b) => a.name.localeCompare(b.name));
      });
      setCommunityOptions((current) =>
        Array.from(new Set([...current, item.name])).sort((a, b) =>
          a.localeCompare(b)
        )
      );
      setFormState((current) => ({
        ...current,
        communityName: item.name,
      }));
      setShowCommunityForm(false);
      setCommunityDraft({
        name: "",
        activity: "",
        focusSocial: "",
        notes: "",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao salvar comunidade.";
      setCommunityFeedback(message);
    } finally {
      setCommunitySaving(false);
    }
  };

  const handleEditFieldChange = (
    field: keyof EditResidentForm,
    value: string
  ) => {
    setEditForm((current) =>
      current
        ? {
            ...current,
            [field]: value,
          }
        : current
    );
  };

  const handleEditStateSelect = (value: string) => {
    setEditForm((current) =>
      current
        ? {
            ...current,
            state: value,
            city: "",
          }
        : current
    );
  };

  const handleEditCitySelect = (value: string) => {
    if (!value) {
      setEditForm((current) =>
        current
          ? {
              ...current,
              city: "",
            }
          : current
      );
      return;
    }
    const [cityName, stateCode] = value.split("__");
    setEditForm((current) =>
      current
        ? {
            ...current,
            city: cityName,
            state: stateCode,
          }
        : current
    );
  };

  const resetForm = () => {
    setFormState(initialFormState);
    setPhotoFile(null);
    setSelectedLocation(null);
    setResetKey((current) => current + 1);
    setShowCommunityForm(false);
    setCommunityDraft({
      name: "",
      activity: "",
      focusSocial: "",
      notes: "",
    });
    setCommunityFeedback(null);
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
    if (!formState.communityName.trim()) {
      setSaveFeedback({
        type: "error",
        message: "Informe a comunidade quilombola.",
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
        community_name: formState.communityName || undefined,
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
        community_name: formState.communityName || undefined,
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
      const normalizedCommunity = formState.communityName.trim();
      if (
        normalizedCommunity &&
        !communityOptions.includes(normalizedCommunity)
      ) {
        setCommunityOptions((current) =>
          [...current, normalizedCommunity].sort((a, b) =>
            a.localeCompare(b)
          )
        );
      }
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

  const handleStartEdit = async (residentId: string) => {
    setEditLoading(true);
    setEditFeedback(null);
    try {
      const detail = await fetchResidentDetail(residentId);
      const resident = detail.resident;
      setEditForm({
        id: resident.id,
        pointId: detail.point?.id ?? null,
        fullName: resident.full_name ?? "",
        docId: resident.doc_id ?? "",
        phone: resident.phone ?? "",
        email: resident.email ?? "",
        address: resident.address ?? "",
        city: resident.city ?? "",
        state: resident.state ?? "",
        communityName: resident.community_name ?? detail.point?.community_name ?? "",
        status: resident.status ?? "active",
        notes: resident.notes ?? "",
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao carregar cadastro.";
      setEditFeedback(message);
    } finally {
      setEditLoading(false);
    }
  };

  const handleEditCancel = () => {
    setEditForm(null);
    setEditFeedback(null);
  };

  const handleEditSave = async () => {
    if (!editForm) {
      return;
    }
    setEditSaving(true);
    setEditFeedback(null);
    try {
      await updateResident(editForm.id, {
        full_name: editForm.fullName,
        doc_id: editForm.docId || undefined,
        phone: editForm.phone || undefined,
        email: editForm.email || undefined,
        address: editForm.address || undefined,
        city: editForm.city || undefined,
        state: editForm.state || undefined,
        community_name: editForm.communityName || undefined,
        status: editForm.status,
        notes: editForm.notes || undefined,
      });
      if (editForm.pointId) {
        await updatePoint(editForm.pointId, {
          city: editForm.city || undefined,
          state: editForm.state || undefined,
          status: editForm.status,
          community_name: editForm.communityName || undefined,
        });
      }
      const normalizedCommunity = editForm.communityName.trim();
      if (
        normalizedCommunity &&
        !communityOptions.includes(normalizedCommunity)
      ) {
        setCommunityOptions((current) =>
          [...current, normalizedCommunity].sort((a, b) =>
            a.localeCompare(b)
          )
        );
      }
      await loadResidents();
      setEditFeedback("Cadastro atualizado.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao atualizar cadastro.";
      setEditFeedback(message);
    } finally {
      setEditSaving(false);
    }
  };

  useEffect(() => {
    if (!isAdmin && activeTab === "admin") {
      setActiveTab("register");
    }
  }, [activeTab, isAdmin]);

  const panelTabs = (
    <div className="tabs" style={{ marginBottom: "1.5rem" }}>
      <button
        className={`tab ${activeTab === "register" ? "active" : ""}`}
        type="button"
        onClick={() => setActiveTab("register")}
      >
        Cadastro
      </button>
      <button
        className={`tab ${activeTab === "people" ? "active" : ""}`}
        type="button"
        onClick={() => setActiveTab("people")}
      >
        Minhas pessoas
      </button>
      {isAdmin && (
        <button
          className={`tab ${activeTab === "admin" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("admin")}
        >
          Painel ADM
        </button>
      )}
    </div>
  );

  if (isAdmin && activeTab === "admin") {
    return (
      <div className="page">
        {panelTabs}
        <AdminPanel />
      </div>
    );
  }

  return (
    <div className="page">
      {panelTabs}
      {activeTab === "register" && (
        <>
          <section className="dashboard-hero">
            <div>
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
              <label>
                Comunidade quilombola
                <div className="community-input-row">
                  <input
                    type="text"
                    list="quilombo-options"
                    placeholder="Selecione ou informe o quilombo"
                    value={formState.communityName}
                    onChange={(event) =>
                      handleFieldChange("communityName", event.target.value)
                    }
                    required
                  />
                  <button
                    type="button"
                    className="btn btn-outline btn-icon"
                    onClick={openCommunityForm}
                    aria-label="Adicionar comunidade"
                  >
                    +
                  </button>
                </div>
              </label>
              <datalist id="quilombo-options">
                {communityOptions.map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
              {communityOptionsError && (
                <div className="alert">{communityOptionsError}</div>
              )}
              {formState.communityName.trim() && (
                <div className="community-panel">
                  <div className="community-panel-header">
                    <strong>Detalhes da comunidade</strong>
                    <span className={`status ${selectedCommunity ? "active" : "pending"}`}>
                      {selectedCommunity ? "Cadastrada" : "Sem cadastro"}
                    </span>
                  </div>
                  <div className="community-panel-grid">
                    <div>
                      <span>Nome</span>
                      <strong>
                        {selectedCommunity?.name ?? formState.communityName}
                      </strong>
                    </div>
                    <div>
                      <span>Atividade</span>
                      <strong>{selectedCommunity?.activity || "Nao informado"}</strong>
                    </div>
                    <div>
                      <span>Foco social</span>
                      <strong>
                        {selectedCommunity?.focus_social || "Nao informado"}
                      </strong>
                    </div>
                    <div>
                      <span>Cidade/UF</span>
                      <strong>
                        {(selectedCommunity?.city || formState.city || "-")}{" "}
                        {(selectedCommunity?.state || formState.state || "")}
                      </strong>
                    </div>
                  </div>
                  {selectedCommunity?.notes && (
                    <p className="muted">{selectedCommunity.notes}</p>
                  )}
                </div>
              )}
              {showCommunityForm && (
                <div className="community-panel">
                  <div className="community-panel-header">
                    <strong>Cadastro da comunidade</strong>
                    <span className="status">Novo registro</span>
                  </div>
                  <div className="form-grid">
                    <label>
                      Nome
                      <input
                        type="text"
                        value={communityDraft.name}
                        onChange={(event) =>
                          handleCommunityDraftChange("name", event.target.value)
                        }
                        required
                      />
                    </label>
                    <label>
                      Atividade
                      <input
                        type="text"
                        value={communityDraft.activity}
                        onChange={(event) =>
                          handleCommunityDraftChange("activity", event.target.value)
                        }
                      />
                    </label>
                    <label>
                      Foco social
                      <input
                        type="text"
                        value={communityDraft.focusSocial}
                        onChange={(event) =>
                          handleCommunityDraftChange(
                            "focusSocial",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      Observacoes
                      <textarea
                        rows={3}
                        value={communityDraft.notes}
                        onChange={(event) =>
                          handleCommunityDraftChange("notes", event.target.value)
                        }
                      />
                    </label>
                  </div>
                  {communityFeedback && (
                    <div className="alert">{communityFeedback}</div>
                  )}
                  <div className="form-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={handleCommunitySave}
                      disabled={communitySaving}
                    >
                      {communitySaving ? "Salvando..." : "Salvar comunidade"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline"
                      onClick={() => setShowCommunityForm(false)}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
              <div className="form-row">
                <label>
                  Cidade
                  <select
                    className="select"
                    value={selectedCityValue}
                    onChange={(event) => handleCitySelect(event.target.value)}
                    required
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
                  Estado
                  <select
                    className="select"
                    value={formState.state}
                    onChange={(event) => handleStateSelect(event.target.value)}
                    required
                  >
                    <option value="">Selecione um estado</option>
                    {BRAZIL_STATES.map((state) => (
                      <option key={state.code} value={state.code}>
                        {state.code} - {state.name}
                      </option>
                    ))}
                  </select>
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
        </>
      )}

      {activeTab === "people" && (
        <section className="table-section">
          <div className="table-header">
            <div>
              <span className="eyebrow">Pessoas</span>
              <h2>Cadastros realizados por voce</h2>
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
                  <th>Comunidade</th>
                  <th>Cidade</th>
                  <th>Estado</th>
                  <th>Status</th>
                  <th>Criado em</th>
                  <th>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {residents.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
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
                      <td>{resident.community_name ?? "-"}</td>
                      <td>{resident.city ?? "-"}</td>
                      <td>{resident.state ?? "-"}</td>
                      <td>
                        <span className={`status ${resident.status}`}>
                          {formatStatus(resident.status as "active" | "inactive")}
                        </span>
                      </td>
                      <td>{new Date(resident.created_at).toLocaleDateString()}</td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => void handleStartEdit(resident.id)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {editLoading && (
            <div className="table-card">
              <p className="muted">Carregando dados do cadastro...</p>
            </div>
          )}
          {editForm && (
            <div className="table-card">
              <div className="form-header">
                <div>
                  <span className="eyebrow">Edicao</span>
                  <h3>Atualizar cadastro</h3>
                </div>
              </div>
              <form className="form">
                <label>
                  Nome completo
                  <input
                    type="text"
                    value={editForm.fullName}
                    onChange={(event) =>
                      handleEditFieldChange("fullName", event.target.value)
                    }
                  />
                </label>
                <div className="form-row">
                  <label>
                    Documento
                    <input
                      type="text"
                      value={editForm.docId}
                      onChange={(event) =>
                        handleEditFieldChange("docId", event.target.value)
                      }
                    />
                  </label>
                  <label>
                    Telefone
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(event) =>
                        handleEditFieldChange("phone", event.target.value)
                      }
                    />
                  </label>
                </div>
                <label>
                  Email
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(event) =>
                      handleEditFieldChange("email", event.target.value)
                    }
                  />
                </label>
                <label>
                  Endereco
                  <input
                    type="text"
                    value={editForm.address}
                    onChange={(event) =>
                      handleEditFieldChange("address", event.target.value)
                    }
                  />
                </label>
                <label>
                  Comunidade quilombola
                  <input
                    type="text"
                    list="quilombo-options-edit"
                    value={editForm.communityName}
                    onChange={(event) =>
                      handleEditFieldChange("communityName", event.target.value)
                    }
                  />
                </label>
                <datalist id="quilombo-options-edit">
                  {communityOptions.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <div className="form-row">
                  <label>
                    Cidade
                    <select
                      className="select"
                      value={editSelectedCityValue}
                      onChange={(event) => handleEditCitySelect(event.target.value)}
                    >
                      <option value="">Selecione uma cidade</option>
                      {editAvailableCities.map((city) => (
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
                    Estado
                    <select
                      className="select"
                      value={editForm.state}
                      onChange={(event) => handleEditStateSelect(event.target.value)}
                    >
                      <option value="">Selecione um estado</option>
                      {BRAZIL_STATES.map((state) => (
                        <option key={state.code} value={state.code}>
                          {state.code} - {state.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Status
                  <select
                    className="select"
                    value={editForm.status}
                    onChange={(event) =>
                      handleEditFieldChange(
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
                  Observacoes
                  <textarea
                    rows={3}
                    value={editForm.notes}
                    onChange={(event) =>
                      handleEditFieldChange("notes", event.target.value)
                    }
                  />
                </label>
                {editFeedback && <div className="alert">{editFeedback}</div>}
                <div className="form-actions">
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={handleEditSave}
                    disabled={editSaving}
                  >
                    {editSaving ? "Salvando..." : "Salvar alteracoes"}
                  </button>
                  <button
                    className="btn btn-outline"
                    type="button"
                    onClick={handleEditCancel}
                    disabled={editSaving}
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
