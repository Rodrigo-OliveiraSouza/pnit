import { Link } from "react-router-dom";
import PublicMapSection from "../components/PublicMapSection";
import orgField from "../assets/org-field.svg";
import orgNetwork from "../assets/org-network.svg";
import orgCommunity from "../assets/org-community.svg";

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
          <div className="gallery-grid">
            <figure className="gallery-card">
              <img src={orgField} alt="Agentes de campo em atuacao" />
              <figcaption>Agentes de campo</figcaption>
              <p className="muted">Equipe local mapeia realidades e necessidades.</p>
            </figure>
            <figure className="gallery-card">
              <img src={orgNetwork} alt="Rede de integracao territorial" />
              <figcaption>Rede territorial</figcaption>
              <p className="muted">Dados conectados entre bairros e municipios.</p>
            </figure>
            <figure className="gallery-card">
              <img src={orgCommunity} alt="Comunidades monitoradas" />
              <figcaption>Comunidades</figcaption>
              <p className="muted">Visao humana para orientar decisoes publicas.</p>
            </figure>
          </div>
          <div className="hero-note">
            <p>
              O GTERF nasceu para apoiar a gestao territorial com dados confiaveis,
              respeitando a privacidade e valorizando a memoria das comunidades.
            </p>
          </div>
        </div>
      </section>

      <section className="landing-info">
        <div className="info-card landing-card">
          <span className="eyebrow">Objetivo</span>
          <h2>Transformar dados sociais em estrategia publica</h2>
          <p className="muted">
            Consolidamos indicadores de saude, educacao, renda, moradia e
            seguranca para oferecer um retrato atualizado das condicoes locais.
          </p>
        </div>
        <div className="info-card landing-card">
          <span className="eyebrow">Como funciona</span>
          <h2>Cadastro de pessoas vira ponto no mapa</h2>
          <p className="muted">
            Agentes registram informacoes em campo, adicionam evidencias e o
            sistema publica dados agregados com atualizacao diaria.
          </p>
        </div>
        <div className="info-card landing-card">
          <span className="eyebrow">Governanca</span>
          <h2>Auditoria e aprovacoes centralizadas</h2>
          <p className="muted">
            O painel do ADM valida cadastros, acompanha produtividade e garante
            a qualidade das informacoes divulgadas.
          </p>
        </div>
      </section>

      <PublicMapSection />
    </div>
  );
}
