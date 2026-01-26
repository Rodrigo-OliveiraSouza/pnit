import { useMemo, useState } from "react";
import MapEditor, { type SelectedLocation } from "../components/MapEditor";
import {
  submitAccessCodeRegistration,
  type AccessCodeSubmissionPayload,
} from "../services/api";
import { BRAZIL_STATES } from "../data/brazil-states";

function parseLatLng(input: string) {
  const matches = input.match(/(-?\d{1,3}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/i);
  if (!matches) return null;
  const lat = Number(matches[1]);
  const lng = Number(matches[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export default function AccessCodeRegister() {
  const [code, setCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [communityName, setCommunityName] = useState("");
  const [publicNote, setPublicNote] = useState("");
  const [precision, setPrecision] = useState<"approx" | "exact">("approx");
  const [locationText, setLocationText] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [selectedLocation, setSelectedLocation] =
    useState<SelectedLocation | null>(null);
  const [scores, setScores] = useState({
    health: "5",
    education: "5",
    income: "5",
    housing: "5",
    security: "5",
  });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<
    { type: "success" | "error"; message: string } | null
  >(null);

  const resolvedLocation = useMemo(() => {
    if (selectedLocation) return selectedLocation;
    if (!locationText) return null;
    return parseLatLng(locationText);
  }, [locationText, selectedLocation]);

  const handleScoreChange = (field: keyof typeof scores, value: string) => {
    setScores((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async () => {
    setFeedback(null);
    if (!code.trim()) {
      setFeedback({ type: "error", message: "Informe o codigo de acesso." });
      return;
    }
    if (!fullName.trim()) {
      setFeedback({ type: "error", message: "Informe o nome completo." });
      return;
    }
    if (!communityName.trim()) {
      setFeedback({ type: "error", message: "Informe a comunidade." });
      return;
    }
    if (!city.trim() || !state.trim()) {
      setFeedback({ type: "error", message: "Informe cidade e estado." });
      return;
    }
    if (!resolvedLocation) {
      setFeedback({
        type: "error",
        message: "Informe a localizacao no mapa ou cole a coordenada.",
      });
      return;
    }
    const payload: AccessCodeSubmissionPayload = {
      code: code.trim().toUpperCase(),
      resident: {
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        email: email.trim() || null,
        address: address.trim() || null,
        city: city.trim(),
        state: state.trim(),
        community_name: communityName.trim(),
        status: "active",
      },
      profile: {
        health_score: Number(scores.health),
        education_score: Number(scores.education),
        income_score: Number(scores.income),
        housing_score: Number(scores.housing),
        security_score: Number(scores.security),
      },
      point: {
        lat: resolvedLocation.lat,
        lng: resolvedLocation.lng,
        precision,
        status: "active",
        city: city.trim(),
        state: state.trim(),
        community_name: communityName.trim(),
        public_note: publicNote.trim() || null,
        location_text: locationText.trim() || null,
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
      setFullName("");
      setPhone("");
      setEmail("");
      setAddress("");
      setCity("");
      setState("");
      setCommunityName("");
      setPublicNote("");
      setLocationText("");
      setSelectedLocation(null);
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
              Insira o codigo fornecido e preencha os dados essenciais para
              enviar o registro. O responsavel aprovara o cadastro.
            </p>
          </div>
        </div>
        {feedback && (
          <div className={`alert ${feedback.type}`}>{feedback.message}</div>
        )}
        <div className="form-card">
          <div className="form-grid">
            <label>
              Codigo de acesso
              <input
                type="text"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                placeholder="Ex: A1B2C3D4"
              />
            </label>
            <label>
              Nome completo
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </label>
            <label>
              Telefone
              <input
                type="text"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label>
              Endereco
              <input
                type="text"
                value={address}
                onChange={(event) => setAddress(event.target.value)}
              />
            </label>
            <label>
              Comunidade
              <input
                type="text"
                value={communityName}
                onChange={(event) => setCommunityName(event.target.value)}
              />
            </label>
            <label>
              Estado
              <select
                className="select"
                value={state}
                onChange={(event) => setState(event.target.value)}
              >
                <option value="">Selecione</option>
                {BRAZIL_STATES.map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Cidade
              <input
                type="text"
                value={city}
                onChange={(event) => setCity(event.target.value)}
              />
            </label>
            <label className="full">
              Observacoes publicas
              <textarea
                rows={2}
                value={publicNote}
                onChange={(event) => setPublicNote(event.target.value)}
              />
            </label>
          </div>

          <div className="form-note">
            <strong>Notas sociais (1-10)</strong>
          </div>
          <div className="form-row">
            <label>
              Saude
              <input
                type="number"
                min="1"
                max="10"
                value={scores.health}
                onChange={(event) => handleScoreChange("health", event.target.value)}
              />
            </label>
            <label>
              Educacao
              <input
                type="number"
                min="1"
                max="10"
                value={scores.education}
                onChange={(event) =>
                  handleScoreChange("education", event.target.value)
                }
              />
            </label>
            <label>
              Renda
              <input
                type="number"
                min="1"
                max="10"
                value={scores.income}
                onChange={(event) => handleScoreChange("income", event.target.value)}
              />
            </label>
            <label>
              Moradia
              <input
                type="number"
                min="1"
                max="10"
                value={scores.housing}
                onChange={(event) =>
                  handleScoreChange("housing", event.target.value)
                }
              />
            </label>
            <label>
              Seguranca
              <input
                type="number"
                min="1"
                max="10"
                value={scores.security}
                onChange={(event) =>
                  handleScoreChange("security", event.target.value)
                }
              />
            </label>
          </div>

          <div className="form-note">
            <strong>Localizacao</strong>
          </div>
          <div className="form-row">
            <label>
              Precisao da localizacao
              <select
                className="select"
                value={precision}
                onChange={(event) =>
                  setPrecision(event.target.value as "approx" | "exact")
                }
              >
                <option value="approx">Aproximada</option>
                <option value="exact">Exata</option>
              </select>
            </label>
            <label>
              Coordenada (WhatsApp)
              <input
                type="text"
                placeholder="-12.3456, -38.1234"
                value={locationText}
                onChange={(event) => setLocationText(event.target.value)}
              />
            </label>
          </div>
          <div className="map-card">
            <MapEditor onLocationChange={setSelectedLocation} resetKey={resetKey} />
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
      </section>
    </div>
  );
}
