import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { registerUser, setAuthToken } from "../services/api";

export default function Register() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await registerUser({ email, password });
      setAuthToken(response.token);
      navigate("/painel");
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
        <h1>Criar acesso ao GTERF</h1>
        <p>
          Crie seu acesso para registrar cadastros territoriais e pontos no
          mapa.
        </p>
        <div className="auth-highlights">
          <div>
            <strong>Cadastro rapido</strong>
            <span>Use email e senha para acessar o painel.</span>
          </div>
          <div>
            <strong>Perfis dedicados</strong>
            <span>Permissoes por funcao e unidade.</span>
          </div>
        </div>
      </div>
      <div className="auth-card">
        <h2>Criar conta</h2>
        <p>Informe seu email e uma senha segura.</p>
        <form className="form" onSubmit={handleSubmit}>
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
            {loading ? "Criando..." : "Criar conta"}
          </button>
        </form>
        <div className="auth-footer">
          <span>Ja tem acesso?</span>
          <Link to="/login">Entrar</Link>
        </div>
      </div>
    </div>
  );
}
