import { Link } from "react-router-dom";
import PublicMapSection from "../components/PublicMapSection";
import NewsCarousel from "../components/NewsCarousel";

export default function Home() {
  return (
    <div className="page">
      <section className="landing-hero">
        <div className="hero-content">
          <span className="eyebrow">Apresentacao</span>
          <h1>GTERF: inteligencia territorial para proteger pessoas e territórios</h1>
          <p className="lead">
            A plataforma organiza dados sociais coletados por agentes de campo e
            transforma essas informacoes em mapas, relatorios e indicadores para
            apoiar politicas publicas com transparencia.
          </p>
          <div className="landing-badges">
            <span className="badge">Coleta em campo</span>
            <span className="badge">Relatorios auditaveis</span>
            <span className="badge">Mapa atualizado diariamente</span>
          </div>
          <div className="hero-actions">
            <Link className="btn btn-primary" to="/login">
              Entrar no painel
            </Link>
            <Link className="btn btn-outline" to="/cadastro">
              Solicitar acesso
            </Link>
            <a className="btn btn-ghost" href="#relatorios">
              Explorar mapa
            </a>
          </div>
        </div>
        <div className="hero-gallery">
          <NewsCarousel className="news-carousel-hero" showDots={false} />
          <div className="hero-note">
            <p>
              O GTERF nasceu para apoiar a gestao territorial com dados confiaveis,
              respeitando a privacidade e valorizando a memoria das comunidades.
            </p>
          </div>
        </div>
      </section>

      <PublicMapSection mode="public" />
    </div>
  );
}
