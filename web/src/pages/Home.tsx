import { Link } from "react-router-dom";
import PublicMapSection from "../components/PublicMapSection";

export default function Home() {
  return (
    <div className="page">
      <section className="public-hero">
        <div>
          <span className="eyebrow">Painel publico</span>
          <h1>Mapa interativo para navegacao territorial e relatorios</h1>
          <p className="lead">
            Selecione areas, gere relatorios agregados e acompanhe informacoes
            publicas sem expor dados pessoais.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="btn btn-primary" to="/login">
            Entrar no painel
          </Link>
          <Link className="btn btn-outline" to="/cadastro">
            Solicitar acesso
          </Link>
        </div>
      </section>

      <PublicMapSection />
    </div>
  );
}
