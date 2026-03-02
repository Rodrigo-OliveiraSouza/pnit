import { useSiteCopy } from "../providers/SiteCopyProvider";

export default function Footer() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const { copy } = useSiteCopy();
  const { footer } = copy;
  const helpEmail = "agentesterritoriais2@gmail.com";
  const pageLinks = [
    { label: "Página inicial", href: baseUrl },
    { label: "Cadastro com código", href: `${baseUrl}acesso` },
    { label: "Notícias", href: `${baseUrl}noticias` },
    { label: "Denúncias", href: `${baseUrl}denuncias` },
    { label: "Entrar no painel", href: `${baseUrl}login` },
  ];
  const infoLinks = [
    {
      label: "Site do Ministério da Igualdade Racial",
      href: "https://www.gov.br/igualdaderacial/pt-br",
    },
    { label: "Portal Gov.br", href: "https://www.gov.br/pt-br" },
    { label: "Canal de denúncias", href: `${baseUrl}denuncias` },
  ];
  const socialLinks = [
    { label: "Instagram gov.br", href: "https://www.instagram.com/govbr/" },
    {
      label: "Instagram MIR",
      href: "https://www.instagram.com/ministerioigualdaderacial/",
    },
    {
      label: "Site Diversifica",
      href: "https://www.avadiversifica.com.br/",
    },
  ];
  const supportLines = footer.contactItems.filter(Boolean);
  const versionText = footer.version.trim();

  const handleScrollTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <footer className="site-footer">
      <div className="footer-scene" aria-hidden="true">
        <div className="footer-scene-side footer-scene-left">
          <span className="footer-scene-orb footer-scene-orb-gold" />
          <span className="footer-scene-hill footer-scene-hill-blue" />
          <span className="footer-scene-hill footer-scene-hill-cream" />
        </div>
        <div className="footer-scene-side footer-scene-right">
          <span className="footer-scene-orb footer-scene-orb-blue" />
          <span className="footer-scene-hill footer-scene-hill-red" />
          <span className="footer-scene-hill footer-scene-hill-sand" />
        </div>
      </div>

      <div className="footer-support">
        <span className="footer-support-icon" aria-hidden="true">
          ?
        </span>
        <span className="footer-support-label">{footer.contactTitle}</span>
        <h2>Precisa de ajuda com a plataforma?</h2>
        <p>
          Consulte nossos canais institucionais e entre em contato com a equipe
          de suporte do projeto para orientações de acesso e uso da plataforma.
        </p>
        <a className="footer-support-email" href={`mailto:${helpEmail}`}>
          {helpEmail}
        </a>
        {supportLines.length > 0 && (
          <div className="footer-support-lines">
            {supportLines.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        )}
        <a className="btn footer-support-button" href={`mailto:${helpEmail}`}>
          Falar com suporte
        </a>
      </div>

      <div className="footer-panel">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="footer-logos">
              <a href="https://www.gov.br/pt-br" target="_blank" rel="noreferrer">
                <img
                  src={`${baseUrl}logos/governo-brasil.png`}
                  alt="Governo do Brasil"
                  className="logo logo-governo theme-ignore"
                />
              </a>
              <a
                href="https://www.gov.br/igualdaderacial/pt-br"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`${baseUrl}logos/mir2.jpeg`}
                  alt="MIR - Ministério da Igualdade Racial"
                  className="logo logo-mir theme-ignore"
                />
              </a>
              <a href="https://ufrb.edu.br/" target="_blank" rel="noreferrer">
                <img
                  src={`${baseUrl}logos/ufrb.jpg`}
                  alt="UFRB - Universidade Federal do Reconcavo da Bahia"
                  className="logo logo-ufrb theme-ignore"
                />
              </a>
              <a
                href="https://www.avadiversifica.com.br/"
                target="_blank"
                rel="noreferrer"
              >
                <img
                  src={`${baseUrl}logos/diversifica.png`}
                  alt="Diversifica Inclusão e Diversidade"
                  className="logo logo-diversifica theme-ignore"
                />
              </a>
            </div>
            <p className="footer-brand-copy">{footer.description}</p>
          </div>

          <div className="footer-column">
            <h4>Páginas</h4>
            <ul className="footer-link-list">
              {pageLinks.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-column">
            <h4>{footer.transparencyTitle || "Acesso à informação"}</h4>
            <ul className="footer-link-list">
              {infoLinks.map((item) => {
                const isExternal = item.href.startsWith("http");
                return (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      {...(isExternal
                        ? { target: "_blank", rel: "noreferrer" }
                        : {})}
                    >
                      {item.label}
                    </a>
                  </li>
                );
              })}
              {footer.transparencyItems.map((item) => (
                <li key={item} className="footer-copy-item">
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-column">
            <h4>Redes sociais</h4>
            <ul className="footer-link-list">
              {socialLinks.map((item) => (
                <li key={item.href}>
                  <a href={item.href} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <span>{versionText || "\u00A0"}</span>
          <button
            type="button"
            className="footer-scroll-top"
            onClick={handleScrollTop}
            aria-label="Voltar ao topo"
          >
            ↑
          </button>
        </div>
      </div>
    </footer>
  );
}
