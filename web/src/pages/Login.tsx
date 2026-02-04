import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import NewsCarousel from "../components/NewsCarousel";
import { useSiteCopy } from "../providers/SiteCopyProvider";
import { loginUser, setAuthRole, setAuthToken, setAuthUserId } from "../services/api";

export default function Login() {
  const { copy } = useSiteCopy();
  const loginCopy = copy.login;
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
      setAuthRole(response.user.role);
      setAuthUserId(response.user.id);
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
        <div className="auth-carousel auth-carousel-focus">
          <NewsCarousel
            className="news-carousel-media"
            imageOnly
            showDots={false}
            collection="reports"
          />
        </div>
      </div>
      <div className="auth-card">
        <h2>{loginCopy.title}</h2>
        <p>{loginCopy.description}</p>
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
            {loading ? "Entrando..." : loginCopy.buttonLabel}
          </button>
        </form>
        <div className="auth-footer">
          <Link to="/recuperar-senha">Esqueci minha senha</Link>
          <Link to="/cadastro">{loginCopy.createAccountLabel}</Link>
        </div>
      </div>
    </div>
  );
}
