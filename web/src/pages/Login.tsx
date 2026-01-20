import { Link } from "react-router-dom";

export default function Login() {
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
        <form className="form">
          <label>
            Email
            <input type="email" placeholder="Email institucional" />
          </label>
          <label>
            Senha
            <input type="password" placeholder="Senha" />
          </label>
          <button className="btn btn-primary" type="submit">
            Entrar
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
