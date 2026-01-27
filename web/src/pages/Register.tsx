import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { registerUser, setAuthToken } from "../services/api";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";

type BrazilCity = { name: string; state: string };
const BRAZIL_CITIES = citiesData as BrazilCity[];

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"registrar" | "manager">("registrar");
  const [linkCode, setLinkCode] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [organization, setOrganization] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [territory, setTerritory] = useState("");
  const [accessReason, setAccessReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const availableCities = useMemo(() => {
    if (!state) return BRAZIL_CITIES;
    return BRAZIL_CITIES.filter((city) => city.state === state);
  }, [state]);
  const selectedCityValue = city && state ? `${city}__${state}` : "";

  const handleStateChange = (value: string) => {
    setState(value);
    setCity("");
  };

  const handleCityChange = (value: string) => {
    if (!value) {
      setCity("");
      return;
    }
    const [cityName, stateCode] = value.split("__");
    setCity(cityName);
    setState(stateCode);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await registerUser({
        email,
        password,
        role,
        link_code: linkCode.trim() ? linkCode.trim().toUpperCase() : undefined,
        full_name: fullName,
        phone,
        organization,
        city,
        state,
        territory,
        access_reason: accessReason,
      });
      setAuthToken(null);
      setSubmitted(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao cadastrar.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="auth-visual">
        <span className="eyebrow">Cadastro</span>
        <h1>Criar acesso ao painel</h1>
        <p>
          Crie seu acesso para registrar cadastros territoriais e pontos no
          mapa.
        </p>
        <div className="auth-highlights">
          <div>
            <strong>Cadastro rápido</strong>
            <span>Use email e senha para acessar o painel.</span>
          </div>
          <div>
            <strong>Perfis dedicados</strong>
            <span>Permissões por função e unidade.</span>
          </div>
        </div>
      </div>
      <div className="auth-card">
        <h2>Criar conta</h2>
        {submitted ? (
          <>
            <p>
              Solicitação enviada com sucesso. Aguarde a aprovação para acessar
              o painel.
            </p>
            <Link className="btn btn-primary" to="/login">
              Voltar ao login
            </Link>
          </>
        ) : (
          <>
            <p>Informe seus dados para solicitar acesso.</p>
            <form className="form" onSubmit={handleSubmit}>
              <label>
                Nome completo
                <input
                  type="text"
                  placeholder="Nome completo"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  required
                />
              </label>
              <label>
                Email institucional
                <input
                  type="email"
                  placeholder="Email institucional"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label>
                Telefone
                <input
                  type="tel"
                  placeholder="(11) 99999-0000"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  required
                />
              </label>
              <label>
                Organização
                <input
                  type="text"
                  placeholder="Órgão, ONG, coletivo"
                  value={organization}
                  onChange={(event) => setOrganization(event.target.value)}
                  required
                />
              </label>
              <div className="form-row">
                <label>
                  Perfil
                  <select
                    className="select"
                    value={role}
                    onChange={(event) =>
                      setRole(event.target.value as "registrar" | "manager")
                    }
                    required
                  >
                    <option value="registrar">Cadastrante</option>
                    <option value="manager">Gerente</option>
                  </select>
                </label>
                <label>
                  Código de vinculação (opcional)
                  <input
                    type="text"
                    placeholder="Código gerado por gerente ou professor"
                    value={linkCode}
                    onChange={(event) => setLinkCode(event.target.value)}
                  />
                </label>
              </div>
              <div className="form-row">
                <label>
                  Cidade
                  <select
                    className="select"
                    value={selectedCityValue}
                    onChange={(event) => handleCityChange(event.target.value)}
                    required
                  >
                    <option value="">Selecione uma cidade</option>
                    {availableCities.map((cityOption) => (
                      <option
                        key={`${cityOption.name}-${cityOption.state}`}
                        value={`${cityOption.name}__${cityOption.state}`}
                      >
                        {cityOption.name} ({cityOption.state})
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Estado
                  <select
                    className="select"
                    value={state}
                    onChange={(event) => handleStateChange(event.target.value)}
                    required
                  >
                    <option value="">Selecione um estado</option>
                    {BRAZIL_STATES.map((stateOption) => (
                      <option key={stateOption.code} value={stateOption.code}>
                        {stateOption.code} - {stateOption.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label>
                Território de atuação
                <input
                  type="text"
                  placeholder="Território ou comunidade"
                  value={territory}
                  onChange={(event) => setTerritory(event.target.value)}
                  required
                />
              </label>
              <label>
                Motivo do acesso
                <textarea
                  rows={3}
                  placeholder="Explique a finalidade do acesso"
                  value={accessReason}
                  onChange={(event) => setAccessReason(event.target.value)}
                  required
                />
              </label>
              <label>
                Senha
                <input
                  type="password"
                  placeholder="Crie uma senha"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </label>
              {error && <div className="alert">{error}</div>}
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? "Enviando..." : "Enviar solicitação"}
              </button>
            </form>
            <div className="auth-footer">
              <Link to="/login">Entrar</Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
