import { useState } from "react";
import { Link } from "react-router-dom";
import NewsCarousel from "../components/NewsCarousel";
import {
  confirmPasswordReset,
  requestPasswordReset,
} from "../services/api";

export default function RecuperarSenha() {
  const [step, setStep] = useState<1 | 2>(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRequest = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      await requestPasswordReset({ email });
      setStep(2);
      setInfo(
        "Se o email estiver cadastrado, enviamos um codigo valido por alguns minutos."
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao enviar.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (password !== confirmPassword) {
      setError("As senhas nao conferem.");
      return;
    }
    setLoading(true);
    try {
      await confirmPasswordReset({ email, code, password });
      setSuccess(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao atualizar.";
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
        <h2>Recuperar senha</h2>
        {success ? (
          <>
            <p>Senha atualizada com sucesso.</p>
            <Link className="btn btn-primary" to="/login">
              Voltar ao login
            </Link>
          </>
        ) : (
          <>
            {step === 1 ? (
              <>
                <p>Informe seu email para receber o codigo de recuperacao.</p>
                <form className="form" onSubmit={handleRequest}>
                  <label>
                    Email
                    <input
                      type="email"
                      placeholder="Email cadastrado"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      required
                    />
                  </label>
                  {error && <div className="alert">{error}</div>}
                  {info && <div className="alert alert-success">{info}</div>}
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? "Enviando..." : "Enviar codigo"}
                  </button>
                </form>
              </>
            ) : (
              <>
                <p>Digite o codigo recebido e escolha uma nova senha.</p>
                <form className="form" onSubmit={handleConfirm}>
                  <label>
                    Codigo
                    <input
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      value={code}
                      onChange={(event) => setCode(event.target.value)}
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
                    Confirmar senha
                    <input
                      type="password"
                      placeholder="Confirmar senha"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      required
                    />
                  </label>
                  {error && <div className="alert">{error}</div>}
                  {info && <div className="alert alert-success">{info}</div>}
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={loading}
                  >
                    {loading ? "Atualizando..." : "Atualizar senha"}
                  </button>
                </form>
                <div className="auth-footer">
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => {
                      setStep(1);
                      setError(null);
                      setInfo(null);
                    }}
                    disabled={loading}
                  >
                    Alterar email
                  </button>
                  <Link to="/login">Voltar ao login</Link>
                </div>
              </>
            )}
            {step === 1 && (
              <div className="auth-footer">
                <Link to="/login">Voltar ao login</Link>
                <Link to="/cadastro">Criar conta</Link>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
