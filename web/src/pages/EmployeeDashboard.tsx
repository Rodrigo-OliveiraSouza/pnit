
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import MapEditor, { type SelectedLocation } from "../components/MapEditor";
import { AdminPanel } from "./Admin";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";
import {
  assignResidentPoint,
  approvePendingSubmission,
  createCommunity,
  createAccessCode,
  createPoint,
  createResident,
  createResidentProfile,
  fetchCommunities,
  fetchResidentDetail,
  getAuthRole,
  listAccessCodes,
  listPendingSubmissions,
  listResidents,
  rejectPendingSubmission,
  updatePoint,
  updateResident,
  uploadAttachment,
  type AccessCode,
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

type PendingSubmission = {
  id: string;
  full_name: string;
  city?: string | null;
  state?: string | null;
  community_name?: string | null;
  created_at: string;
  point_id?: string | null;
  public_lat?: number | null;
  public_lng?: number | null;
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
  photoTypes: "",
  vulnerabilityLevel: "",
  technicalIssues: "",
  referrals: "",
  agenciesContacted: "",
  consentAccepted: false,
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
  familiesCount: string;
  organizationType: string;
  leaderName: string;
  leaderContact: string;
  activities: string;
  meetingFrequency: string;
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
  const [accessCodes, setAccessCodes] = useState<AccessCode[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codesError, setCodesError] = useState<string | null>(null);
  const [pendingSubmissions, setPendingSubmissions] = useState<PendingSubmission[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const role = getAuthRole();
  const isAdmin = role === "admin";
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<
    "register" | "people" | "admin" | "pending"
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
    familiesCount: "",
    organizationType: "",
    leaderName: "",
    leaderContact: "",
    activities: "",
    meetingFrequency: "",
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
  const communitySelectValue = useMemo(() => {
    const name = formState.communityName.trim();
    if (!name) return "";
    return communityOptions.includes(name) ? name : "__custom__";
  }, [formState.communityName, communityOptions]);
  const editCommunitySelectValue = useMemo(() => {
    const name = editForm?.communityName?.trim();
    if (!name) return "";
    return communityOptions.includes(name) ? name : "__custom__";
  }, [editForm?.communityName, communityOptions]);

  const loadResidents = async () => {
    try {
      const response = await listResidents(isAdmin ? undefined : "me");
      setResidents(response.items);
    } catch {
      setResidents([]);
    }
  };

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (!tab) return;
    if (tab === "register" || tab === "people" || tab === "admin" || tab === "pending") {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const loadAccessCodes = async () => {
    setCodesError(null);
    setCodesLoading(true);
    try {
      const response = await listAccessCodes({ status: "active" });
      setAccessCodes(response.items);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao carregar codigos.";
      setCodesError(message);
    } finally {
      setCodesLoading(false);
    }
  };

  const handleCreateAccessCode = async () => {
    setCodesError(null);
    setCodesLoading(true);
    try {
      await createAccessCode();
      await loadAccessCodes();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao gerar codigo.";
      setCodesError(message);
    } finally {
      setCodesLoading(false);
    }
  };

  const loadPendingSubmissions = async () => {
    setPendingError(null);
    setPendingLoading(true);
    try {
      const response = await listPendingSubmissions();
      setPendingSubmissions(response.items);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Falha ao carregar pendencias.";
      setPendingError(message);
    } finally {
      setPendingLoading(false);
    }
  };

  const handleApprovePending = async (id: string) => {
    await approvePendingSubmission(id);
    await loadPendingSubmissions();
  };

  const handleRejectPending = async (id: string) => {
    await rejectPendingSubmission(id);
    await loadPendingSubmissions();
  };

  useEffect(() => {
    void loadResidents();
    if (!isAdmin) {
      void loadAccessCodes();
      void loadPendingSubmissions();
    }
  }, [isAdmin]);

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
          : "Falha ao carregar comunidades.";
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

  const handleCommunitySelect = (value: string) => {
    if (!value) {
      handleFieldChange("communityName", "");
      return;
    }
    if (value === "__custom__") {
      if (communityOptions.includes(formState.communityName.trim())) {
        handleFieldChange("communityName", "");
      }
      return;
    }
    handleFieldChange("communityName", value);
  };

  const handleEditCommunitySelect = (value: string) => {
    if (!editForm) return;
    if (!value) {
      handleEditFieldChange("communityName", "");
      return;
    }
    if (value === "__custom__") {
      if (communityOptions.includes(editForm.communityName.trim())) {
        handleEditFieldChange("communityName", "");
      }
      return;
    }
    handleEditFieldChange("communityName", value);
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
      familiesCount: selectedCommunity?.families_count
        ? String(selectedCommunity.families_count)
        : "",
      organizationType: selectedCommunity?.organization_type ?? "",
      leaderName: selectedCommunity?.leader_name ?? "",
      leaderContact: selectedCommunity?.leader_contact ?? "",
      activities: selectedCommunity?.activities ?? "",
      meetingFrequency: selectedCommunity?.meeting_frequency ?? "",
    });
    setShowCommunityForm(true);
  };

  const handleCommunitySave = async () => {
    const name = communityDraft.name.trim();
    if (!name) {
      setCommunityFeedback("Informe o nome da comunidade.");
      return;
    }
    const familiesCountValue = communityDraft.familiesCount.trim()
      ? Number(communityDraft.familiesCount)
      : null;
    if (
      communityDraft.familiesCount.trim() &&
      !Number.isFinite(familiesCountValue)
    ) {
      setCommunityFeedback("Informe a quantidade de familias.");
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
        families_count: familiesCountValue ?? undefined,
        organization_type: communityDraft.organizationType.trim() || undefined,
        leader_name: communityDraft.leaderName.trim() || undefined,
        leader_contact: communityDraft.leaderContact.trim() || undefined,
        activities: communityDraft.activities.trim() || undefined,
        meeting_frequency: communityDraft.meetingFrequency.trim() || undefined,
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
        familiesCount: "",
        organizationType: "",
        leaderName: "",
        leaderContact: "",
        activities: "",
        meetingFrequency: "",
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
      familiesCount: "",
      organizationType: "",
      leaderName: "",
      leaderContact: "",
      activities: "",
      meetingFrequency: "",
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
        message: "Informe a comunidade.",
      });
      return;
    }
    if (!formState.consentAccepted) {
      setSaveFeedback({
        type: "error",
        message: "Aceite o termo de consentimento para continuar.",
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
      const householdSize = parseNumber(formState.householdSize);
      const childrenCount = parseNumber(formState.childrenCount);
      const elderlyCount = parseNumber(formState.elderlyCount);
      const pcdCount = parseNumber(formState.pcdCount);
      const healthDistance = parseNumber(formState.healthUnitDistanceKm);
      const incomeContributors = parseNumber(formState.incomeContributors);
      const rooms = parseNumber(formState.housingRooms);
      const houseArea = parseNumber(formState.housingAreaM2);
      const landArea = parseNumber(formState.housingLandM2);
      const residentPayload: CreateResidentPayload = {
        full_name: formState.fullName,
        doc_id: formState.docId || undefined,
        birth_date: formState.birthDate || undefined,
        sex: formState.sex || undefined,
        phone: formState.phone || undefined,
        email: formState.email || undefined,
        address: formState.address || undefined,
        city: formState.city || undefined,
        state: formState.state || undefined,
        neighborhood: formState.neighborhood || undefined,
        community_name: formState.communityName || undefined,
        household_size: householdSize ?? undefined,
        children_count: childrenCount ?? undefined,
        elderly_count: elderlyCount ?? undefined,
        pcd_count: pcdCount ?? undefined,
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
        area_type: formState.areaType || undefined,
        reference_point: formState.referencePoint || undefined,
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
        health_unit_distance_km: healthDistance ?? null,
        health_travel_time: formState.healthTravelTime || null,
        health_has_regular_service: formState.healthHasRegularService,
        health_has_ambulance: formState.healthHasAmbulance,
        health_difficulties: formState.healthDifficulties || null,
        health_notes: formState.healthNotes || null,
        education_score: indicators.education.score,
        education_level: formState.educationLevel || null,
        education_has_school: formState.educationHasSchool,
        education_has_transport: formState.educationHasTransport,
        education_material_support: formState.educationMaterialSupport,
        education_has_internet: formState.educationHasInternet,
        education_notes: formState.educationNotes || null,
        income_score: indicators.income.score,
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
        housing_score: indicators.housing.score,
        housing_rooms: rooms ?? null,
        housing_area_m2: houseArea ?? null,
        housing_land_m2: landArea ?? null,
        housing_type: formState.housingType || null,
        housing_material: formState.housingMaterial || null,
        housing_has_bathroom: formState.housingHasBathroom,
        housing_has_water_treated: formState.housingHasWaterTreated,
        housing_condition: formState.housingCondition || null,
        housing_risks: formState.housingRisks || null,
        security_score: indicators.security.score,
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
        photo_types: formState.photoTypes || null,
        vulnerability_level: formState.vulnerabilityLevel || null,
        technical_issues: formState.technicalIssues || null,
        referrals: formState.referrals || null,
        agencies_contacted: formState.agenciesContacted || null,
        consent_accepted: formState.consentAccepted,
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

  const handleDownloadTemplate = () => {
    const html = `<!doctype html>
<html lang="pt-br">
  <head>
    <meta charset="utf-8" />
    <title>Modelo de cadastro - Painel territorial</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: "Times New Roman", serif; margin: 32px; color: #2c1a12; }
      h1 { font-size: 22px; margin: 0 0 12px; }
      h2 { font-size: 16px; margin: 20px 0 8px; }
      p { margin: 0 0 8px; font-size: 12px; }
      .section { border: 1px solid #d8c6b7; padding: 12px; border-radius: 8px; margin-bottom: 12px; }
      .field { margin-bottom: 6px; font-size: 12px; }
      .line { display: inline-block; border-bottom: 1px solid #a68e7b; min-width: 260px; height: 14px; vertical-align: middle; }
      .checkbox { display: inline-block; width: 10px; height: 10px; border: 1px solid #8f7763; margin-right: 6px; }
      .note { font-size: 11px; color: #6b5244; margin-top: 6px; }
    </style>
  </head>
  <body>
    <h1>Modelo de cadastro de pessoas (uso em campo)</h1>
    <p>Imprima este modelo e preencha no campo. Depois, transcreva no sistema.</p>

    <div class="section">
      <h2>1) Identificacao do cidadao</h2>
      <div class="field">Nome completo: <span class="line"></span></div>
      <div class="field">CPF / RG: <span class="line"></span></div>
      <div class="field">Data de nascimento: <span class="line"></span></div>
      <div class="field">Sexo (opcional): <span class="line"></span></div>
      <div class="field">Telefone: <span class="line"></span></div>
      <div class="field">Email: <span class="line"></span></div>
      <div class="field">Endereco completo: <span class="line"></span></div>
      <div class="field">Numero de moradores no domicilio: <span class="line"></span></div>
      <div class="field">Quantas criancas: <span class="line"></span></div>
      <div class="field">Quantos idosos: <span class="line"></span></div>
      <div class="field">Pessoas com deficiencia (PCD)? <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>2) Localizacao territorial</h2>
      <div class="field">Estado: <span class="line"></span></div>
      <div class="field">Municipio: <span class="line"></span></div>
      <div class="field">Bairro / Zona rural: <span class="line"></span></div>
      <div class="field">Ponto de referencia: <span class="line"></span></div>
      <div class="field">Latitude: <span class="line"></span></div>
      <div class="field">Longitude: <span class="line"></span></div>
      <div class="field">
        Tipo de area:
        <span class="checkbox"></span>Urbana
        <span class="checkbox"></span>Rural
        <span class="checkbox"></span>Periurbana
      </div>
      <div class="field">
        Precisao da localizacao:
        <span class="checkbox"></span>Exata
        <span class="checkbox"></span>Aproximada
      </div>
    </div>

    <div class="section">
      <h2>3) Caracterizacao da comunidade</h2>
      <div class="field">Nome da localidade/comunidade: <span class="line"></span></div>
      <div class="field">Quantidade aproximada de familias: <span class="line"></span></div>
      <div class="field">
        Tipo de organizacao social:
        <span class="checkbox"></span>Associacao
        <span class="checkbox"></span>Cooperativa
        <span class="checkbox"></span>Grupo comunitario
        <span class="checkbox"></span>Nenhuma
      </div>
      <div class="field">Possui lideranca comunitaria? Nome: <span class="line"></span></div>
      <div class="field">Contato: <span class="line"></span></div>
      <div class="field">Atividades coletivas existentes: <span class="line"></span></div>
      <div class="field">
        Frequencia de reunioes comunitarias:
        <span class="checkbox"></span>Semanal
        <span class="checkbox"></span>Mensal
        <span class="checkbox"></span>Eventual
        <span class="checkbox"></span>Inexistente
      </div>
    </div>

    <div class="section">
      <h2>4) Infraestrutura basica</h2>
      <div class="field">Energia eletrica: <span class="line"></span></div>
      <div class="field">Abastecimento de agua: <span class="line"></span></div>
      <div class="field">Tratamento da agua: <span class="line"></span></div>
      <div class="field">Esgotamento sanitario: <span class="line"></span></div>
      <div class="field">Coleta de lixo: <span class="line"></span></div>
      <div class="field">Acesso a internet: <span class="line"></span></div>
      <div class="field">Acesso a transporte publico: <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>5) Saude</h2>
      <div class="field">Unidade de saude mais proxima (km): <span class="line"></span></div>
      <div class="field">Tempo medio de deslocamento: <span class="line"></span></div>
      <div class="field">Possui atendimento regular? <span class="line"></span></div>
      <div class="field">Existe posto de saude? <span class="line"></span></div>
      <div class="field">Existe agente comunitario? <span class="line"></span></div>
      <div class="field">Existe ambulancia? <span class="line"></span></div>
      <div class="field">Principais dificuldades: <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>6) Educacao</h2>
      <div class="field">Nivel de escolaridade predominante: <span class="line"></span></div>
      <div class="field">Escola proxima? <span class="line"></span></div>
      <div class="field">Transporte escolar? <span class="line"></span></div>
      <div class="field">Acesso a material escolar? <span class="line"></span></div>
      <div class="field">Acesso a internet para estudo? <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>7) Trabalho e renda</h2>
      <div class="field">Renda familiar aproximada: <span class="line"></span></div>
      <div class="field">Quantas pessoas contribuem com renda: <span class="line"></span></div>
      <div class="field">Tipo de ocupacao: <span class="line"></span></div>
      <div class="field">Participa de programas sociais? Qual? <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>8) Habitacao</h2>
      <div class="field">Tipo de moradia: <span class="line"></span></div>
      <div class="field">Material predominante: <span class="line"></span></div>
      <div class="field">Possui banheiro interno? <span class="line"></span></div>
      <div class="field">Possui agua tratada? <span class="line"></span></div>
      <div class="field">Condicao da moradia: <span class="line"></span></div>
      <div class="field">Riscos ambientais: <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>9) Seguranca e servicos publicos</h2>
      <div class="field">Presenca de delegacia? <span class="line"></span></div>
      <div class="field">Patrulhamento? <span class="line"></span></div>
      <div class="field">Guarda municipal? <span class="line"></span></div>
      <div class="field">Ocorrencias frequentes: <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>10) Participacao social</h2>
      <div class="field">Participa de: <span class="line"></span></div>
      <div class="field">Ja participou de: <span class="line"></span></div>
      <div class="field">Grau de engajamento comunitario: <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>11) Demandas prioritarias</h2>
      <div class="field">Infraestrutura / Saude / Educacao / Emprego / Regularizacao / Assistencia: <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>12) Registros visuais</h2>
      <div class="field">Foto do local: <span class="line"></span></div>
      <div class="field">Foto da residencia: <span class="line"></span></div>
      <div class="field">Foto de equipamentos publicos: <span class="line"></span></div>
      <div class="field">Documentos (opcional): <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>13) Avaliacao tecnica do agente</h2>
      <div class="field">Nivel de vulnerabilidade: <span class="line"></span></div>
      <div class="field">Principais problemas identificados: <span class="line"></span></div>
      <div class="field">Encaminhamentos realizados: <span class="line"></span></div>
      <div class="field">Orgaos acionados: <span class="line"></span></div>
    </div>

    <div class="section">
      <h2>14) Termo de consentimento (institucional)</h2>
      <p>Autorizo a utilizacao dos dados coletados exclusivamente para fins de diagnostico territorial, planejamento de politicas publicas e relatorios institucionais, conforme a LGPD.</p>
      <div class="field">Assinatura: <span class="line"></span> Data: <span class="line"></span></div>
    </div>

    <p class="note">Dica: apos preencher no campo, transcreva no sistema para manter o cadastro atualizado.</p>
  </body>
</html>`;
    const printable = window.open("", "_blank", "width=900,height=700");
    if (!printable) return;
    printable.document.write(html);
    printable.document.close();
    printable.focus();
    printable.print();
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
    if (isAdmin && activeTab === "pending") {
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
      {!isAdmin && (
        <button
          className={`tab ${activeTab === "pending" ? "active" : ""}`}
          type="button"
          onClick={() => setActiveTab("pending")}
        >
          Cadastros pendentes
          {pendingSubmissions.length > 0
            ? ` (${pendingSubmissions.length})`
            : ""}
        </button>
      )}
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
          {!isAdmin && (
            <section className="module-section">
              <div className="card">
                <div className="card-header">
                  <div>
                    <span className="eyebrow">Codigo de acesso</span>
                    <h2>Gerar codigo unico para cadastro externo</h2>
                    <p>
                      Compartilhe um codigo unico para que uma pessoa sem login
                      registre um ponto. O cadastro entrara como pendente para
                      sua aprovacao.
                    </p>
                  </div>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void handleCreateAccessCode()}
                    disabled={codesLoading}
                  >
                    {codesLoading ? "Gerando..." : "Gerar codigo"}
                  </button>
                </div>
                {codesError && <div className="alert">{codesError}</div>}
                <div className="card-body">
                  {accessCodes.length === 0 ? (
                    <div className="empty-state">
                      Nenhum codigo ativo no momento.
                    </div>
                  ) : (
                    <div className="code-list">
                      {accessCodes.map((code) => (
                        <div key={code.id} className="code-item">
                          <strong>{code.code}</strong>
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() =>
                              void navigator.clipboard.writeText(code.code)
                            }
                          >
                            Copiar
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          )}

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
            <div className="form-card form-block">
              <div className="form-block-grid">
                <div className="form-block-section">
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
                  CPF
                  <input
                    type="text"
                    placeholder="CPF"
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
              <div className="form-row">
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
                  Sexo (opcional)
                  <select
                    className="select"
                    value={formState.sex}
                    onChange={(event) =>
                      handleFieldChange("sex", event.target.value)
                    }
                  >
                    <option value="">Nao informado</option>
                    <option value="masculino">Masculino</option>
                    <option value="feminino">Feminino</option>
                    <option value="outro">Outro</option>
                  </select>
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
                  Bairro ou zona rural
                  <input
                    type="text"
                    placeholder="Bairro ou zona rural"
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
                    placeholder="Referencia local"
                    value={formState.referencePoint}
                    onChange={(event) =>
                      handleFieldChange("referencePoint", event.target.value)
                    }
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Moradores no domicilio
                  <input
                    type="number"
                    placeholder="0"
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
                    placeholder="0"
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
                    placeholder="0"
                    value={formState.elderlyCount}
                    onChange={(event) =>
                      handleFieldChange("elderlyCount", event.target.value)
                    }
                  />
                </label>
                <label>
                  Pessoas com deficiencia (PCD)
                  <input
                    type="number"
                    placeholder="0"
                    value={formState.pcdCount}
                    onChange={(event) =>
                      handleFieldChange("pcdCount", event.target.value)
                    }
                  />
                </label>
              </div>
              <label>
                Comunidade
                <div className="community-input-row">
                  <select
                    className="select"
                    value={communitySelectValue}
                    onChange={(event) => handleCommunitySelect(event.target.value)}
                    required
                  >
                    <option value="">Selecione uma comunidade</option>
                    {communityOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value="__custom__">Outra (digitar manualmente)</option>
                  </select>
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
              {communitySelectValue === "__custom__" && (
                <label>
                  Nome da comunidade
                  <input
                    type="text"
                    placeholder="Informe a comunidade"
                    value={formState.communityName}
                    onChange={(event) =>
                      handleFieldChange("communityName", event.target.value)
                    }
                    required
                  />
                </label>
              )}
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
                    <div>
                      <span>Familias</span>
                      <strong>
                        {selectedCommunity?.families_count ?? "Nao informado"}
                      </strong>
                    </div>
                    <div>
                      <span>Organizacao</span>
                      <strong>
                        {selectedCommunity?.organization_type || "Nao informado"}
                      </strong>
                    </div>
                    <div>
                      <span>Lideranca</span>
                      <strong>
                        {selectedCommunity?.leader_name || "Nao informado"}
                      </strong>
                    </div>
                    <div>
                      <span>Contato lideranca</span>
                      <strong>
                        {selectedCommunity?.leader_contact || "Nao informado"}
                      </strong>
                    </div>
                    <div>
                      <span>Atividades coletivas</span>
                      <strong>
                        {selectedCommunity?.activities || "Nao informado"}
                      </strong>
                    </div>
                    <div>
                      <span>Reunioes</span>
                      <strong>
                        {selectedCommunity?.meeting_frequency || "Nao informado"}
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
                      Familias (aprox.)
                      <input
                        type="number"
                        value={communityDraft.familiesCount}
                        onChange={(event) =>
                          handleCommunityDraftChange(
                            "familiesCount",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      Organizacao social
                      <input
                        type="text"
                        placeholder="Associacao, cooperativa, grupo..."
                        value={communityDraft.organizationType}
                        onChange={(event) =>
                          handleCommunityDraftChange(
                            "organizationType",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      Lideranca (nome)
                      <input
                        type="text"
                        value={communityDraft.leaderName}
                        onChange={(event) =>
                          handleCommunityDraftChange(
                            "leaderName",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      Lideranca (contato)
                      <input
                        type="text"
                        value={communityDraft.leaderContact}
                        onChange={(event) =>
                          handleCommunityDraftChange(
                            "leaderContact",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      Atividades coletivas
                      <input
                        type="text"
                        placeholder="Agricultura, artesanato, projetos..."
                        value={communityDraft.activities}
                        onChange={(event) =>
                          handleCommunityDraftChange(
                            "activities",
                            event.target.value
                          )
                        }
                      />
                    </label>
                    <label>
                      Frequencia de reunioes
                      <select
                        className="select"
                        value={communityDraft.meetingFrequency}
                        onChange={(event) =>
                          handleCommunityDraftChange(
                            "meetingFrequency",
                            event.target.value
                          )
                        }
                      >
                        <option value="">Selecione</option>
                        <option value="semanal">Semanal</option>
                        <option value="mensal">Mensal</option>
                        <option value="eventual">Eventual</option>
                        <option value="inexistente">Inexistente</option>
                      </select>
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
                    value={formState.internetAccess ? "sim" : formState.internetAccess === false ? "nao" : ""}
                    onChange={(event) =>
                      handleFieldChange("internetAccess", event.target.value === "sim")
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
                    value={formState.transportAccess ? "sim" : formState.transportAccess === false ? "nao" : ""}
                    onChange={(event) =>
                      handleFieldChange("transportAccess", event.target.value === "sim")
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
                  placeholder="Alvenaria, madeira, aluguel, etc."
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
                      handleFieldChange(
                        "securityHasPatrol",
                        event.target.checked
                      )
                    }
                  />
                  Ha patrulhamento regular?
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={formState.securityHasGuard}
                    onChange={(event) =>
                      handleFieldChange(
                        "securityHasGuard",
                        event.target.checked
                      )
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
                <strong>Registros visuais</strong>
              </div>
              <label>
                Tipos de foto
                <input
                  type="text"
                  placeholder="Local, residencia, equipamentos, documentos"
                  value={formState.photoTypes}
                  onChange={(event) =>
                    handleFieldChange("photoTypes", event.target.value)
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
                <div className="form-block-section form-block-map">
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
            </div>
          </section>
          <section className="dashboard-hero">
            <div className="dashboard-actions">
              <button
                className="btn btn-outline"
                type="button"
                onClick={handleDownloadTemplate}
              >
                Baixar modelo (PDF)
              </button>
            </div>
          </section>
        </>
      )}

      {activeTab === "pending" && (
        <section className="module-section">
          <div className="card">
            <div className="card-header">
              <div>
                <span className="eyebrow">Cadastros pendentes</span>
                <h2>Registros enviados por codigo de acesso</h2>
                <p>
                  Verifique os dados enviados e aprove para liberar no mapa.
                </p>
              </div>
              <button
                className="btn btn-outline"
                type="button"
                onClick={() => void loadPendingSubmissions()}
                disabled={pendingLoading}
              >
                {pendingLoading ? "Atualizando..." : "Atualizar lista"}
              </button>
            </div>
            {pendingError && <div className="alert">{pendingError}</div>}
            <div className="card-body">
              {pendingSubmissions.length === 0 ? (
                <div className="empty-state">
                  Nenhum cadastro pendente no momento.
                </div>
              ) : (
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Cidade</th>
                        <th>Estado</th>
                        <th>Comunidade</th>
                        <th>Enviado em</th>
                        <th>Acoes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingSubmissions.map((item) => (
                        <tr key={item.id}>
                          <td>{item.full_name}</td>
                          <td>{item.city ?? "-"}</td>
                          <td>{item.state ?? "-"}</td>
                          <td>{item.community_name ?? "-"}</td>
                          <td>
                            {new Date(item.created_at).toLocaleDateString(
                              "pt-BR"
                            )}
                          </td>
                          <td>
                            <div className="table-actions">
                              <button
                                className="btn btn-primary"
                                type="button"
                                onClick={() => void handleApprovePending(item.id)}
                              >
                                Aprovar
                              </button>
                              <button
                                className="btn btn-ghost"
                                type="button"
                                onClick={() => void handleRejectPending(item.id)}
                              >
                                Rejeitar
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </section>
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
                    CPF
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
                  Comunidade
                  <select
                    className="select"
                    value={editCommunitySelectValue}
                    onChange={(event) =>
                      handleEditCommunitySelect(event.target.value)
                    }
                  >
                    <option value="">Selecione uma comunidade</option>
                    {communityOptions.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value="__custom__">Outra (digitar manualmente)</option>
                  </select>
                </label>
                {editCommunitySelectValue === "__custom__" && (
                  <label>
                    Nome da comunidade
                    <input
                      type="text"
                      value={editForm.communityName}
                      onChange={(event) =>
                        handleEditFieldChange(
                          "communityName",
                          event.target.value
                        )
                      }
                    />
                  </label>
                )}
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
