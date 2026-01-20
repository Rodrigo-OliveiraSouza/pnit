import { Link } from "react-router-dom";

export default function Register() {
  return (
    <div className="page auth-page">
      <div className="auth-visual">
        <span className="eyebrow">Cadastro</span>
        <h1>Solicitar acesso ao GTERF</h1>
        <p>
          A equipe de administracao valida cada solicitacao antes de liberar o
          acesso ao painel interno.
        </p>
        <div className="auth-highlights">
          <div>
            <strong>Fluxo controlado</strong>
            <span>Aprovacao por responsavel regional.</span>
          </div>
          <div>
            <strong>Perfis dedicados</strong>
            <span>Permissoes por funcao e unidade.</span>
          </div>
        </div>
      </div>
      <div className="auth-card">
        <h2>Criar conta</h2>
        <p>Preencha seus dados para iniciar a solicitacao.</p>
        <form className="form">
          <label>
            Nome completo
            <input type="text" placeholder="Nome completo" />
          </label>
          <label>
            Email institucional
            <input type="email" placeholder="Email institucional" />
          </label>
          <label>
            Unidade
            <input type="text" placeholder="Regional" />
          </label>
          <label>
            Telefone
            <input type="tel" placeholder="(11) 99999-0000" />
          </label>
          <button className="btn btn-primary" type="submit">
            Enviar solicitacao
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
