import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { loginUser, setAuthToken } from "../services/api";

export default function Login() {
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
      const response = await loginUser({ email, password });
      setAuthToken(response.token);
      navigate("/painel");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao entrar.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page auth-page">
      <div className="auth-visual">
        <span className="eyebrow">Acesso restrito</span>
        <h1>Entrar no painel GTERF</h1>
        <p>
          Credenciais de funcionario garantem acesso completo a cadastro,
          edicao, associacoes e auditoria.
        </p>
        <div className="auth-highlights">
          <div>
            <strong>JWT + Cognito</strong>
            <span>Autenticacao segura e grupos de permissao.</span>
          </div>
          <div>
            <strong>Auditoria automatica</strong>
            <span>Todos os acessos ficam registrados.</span>
          </div>
        </div>
      </div>
      <div className="auth-card">
        <h2>Entrar</h2>
        <p>Use seu email institucional para continuar.</p>
        <form className="form" onSubmit={handleSubmit}>
          <label>
            Email
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
              placeholder="Senha"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          {error && <div className="alert">{error}</div>}
          <button className="btn btn-primary" type="submit" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>
        <div className="auth-footer">
          <span>Primeiro acesso?</span>
          <Link to="/cadastro">Criar conta</Link>
        </div>
      </div>
    </div>
  );
}
