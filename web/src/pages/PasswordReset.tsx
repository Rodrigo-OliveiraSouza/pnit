import { useState } from "react";
import { Link } from "react-router-dom";
import NewsCarousel from "../components/NewsCarousel";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../services/api";

type Step = "request" | "confirm" | "done";

export default function PasswordReset() {
  const [step, setStep] = useState<Step>("request");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const normalizedEmail = email.trim().toLowerCase();

  const handleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      await requestPasswordReset(normalizedEmail);
      setStep("confirm");
      setNotice(
        "Se o email estiver cadastrado, enviamos um codigo para voce."
      );
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao solicitar o codigo.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (password !== passwordConfirm) {
      setError("As senhas nao conferem.");
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset({
        email: normalizedEmail,
        code: code.trim(),
        password,
      });
      setStep("done");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao atualizar a senha.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleBackToRequest = () => {
    if (loading) return;
    setStep("request");
    setError(null);
    setNotice(null);
  };

  return (
    <div className="page auth-page">
      <div className="auth-visual">
        <div className="auth-carousel">
          <NewsCarousel
            className="news-carousel-media"
            imageOnly
            showDots={false}
            collection="reports"
          />
        </div>
      </div>
      <div className="auth-card">
        <h2>Recuperar senha</h2>
        <p>Informe seu email para receber o codigo de verificacao.</p>
        <div className="tabs">
          <button
            type="button"
            className={`tab ${step === "request" ? "active" : ""}`}
            onClick={handleBackToRequest}
            disabled={loading}
          >
            1. Email
          </button>
          <button
            type="button"
            className={`tab ${step !== "request" ? "active" : ""}`}
            disabled
          >
            2. Nova senha
          </button>
        </div>
        {step === "request" && (
          <form className="form" onSubmit={handleRequest}>
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
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar codigo"}
            </button>
          </form>
        )}
        {step === "confirm" && (
          <form className="form" onSubmit={handleConfirm}>
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
              Codigo recebido
              <input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                maxLength={6}
                required
              />
            </label>
            <label>
              Nova senha
              <input
                type="password"
                placeholder="Nova senha"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <label>
              Confirmar nova senha
              <input
                type="password"
                placeholder="Repita a nova senha"
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                required
              />
            </label>
            <div className="form-actions">
              <button className="btn btn-primary" type="submit" disabled={loading}>
                {loading ? "Atualizando..." : "Atualizar senha"}
              </button>
              <button
                className="btn btn-outline"
                type="button"
                onClick={handleBackToRequest}
                disabled={loading}
              >
                Reenviar codigo
              </button>
            </div>
          </form>
        )}
        {step === "done" && (
          <div className="form">
            <div className="alert alert-success">
              Senha atualizada. Voce ja pode entrar no painel.
            </div>
            <Link className="btn btn-primary" to="/login">
              Voltar ao login
            </Link>
          </div>
        )}
        {error && <div className="alert">{error}</div>}
        {notice && <div className="alert alert-success">{notice}</div>}
        <div className="auth-footer">
          <Link to="/login">Voltar para entrar</Link>
          <Link to="/cadastro">Criar conta</Link>
        </div>
      </div>
    </div>
  );
}
