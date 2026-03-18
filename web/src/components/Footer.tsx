import { useSiteCopy } from "../providers/SiteCopyProvider";

export default function Footer() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const { copy } = useSiteCopy();
  const { footer } = copy;
  const helpEmail = "agentesterritoriais2@gmail.com";
  const pageLinks = [
    { label: "Pagina inicial", href: baseUrl },
    { label: "Cadastro com codigo", href: `${baseUrl}acesso` },
    { label: "Noticias", href: `${baseUrl}noticias` },
    { label: "Denuncias", href: `${baseUrl}denuncias` },
    { label: "Entrar no painel", href: `${baseUrl}login` },
  ];
  const institutionalLinks = [
    {
      label: "Portal Gov.br",
      href: "https://www.gov.br/pt-br",
    },
    {
      label: "Ministerio da Igualdade Racial",
      href: "https://www.gov.br/igualdaderacial/pt-br",
    },
    {
      label: "Canal Fala.BR",
      href: "https://falabr.cgu.gov.br/web/home",
    },
  ];
  const socialLinks = [
    { label: "Gov.br", href: "https://www.instagram.com/govbr/" },
    {
      label: "MIR",
      href: "https://www.instagram.com/ministerioigualdaderacial/",
    },
    {
      label: "Diversifica",
      href: "https://www.avadiversifica.com.br/",
    },
  ];
  const supportLines = footer.contactItems.filter(Boolean);
  const licenseText =
    "© 2026 PNIT. Ambiente publico com leitura territorial e suporte institucional.";

  const supportLinks = supportLines.map((item, index) => {
    if (index === 1) {
      return {
        label: item,
        href: "https://falabr.cgu.gov.br/web/home",
        external: true,
      };
    }

    return {
      label: item,
      href: `mailto:${helpEmail}?subject=${encodeURIComponent(item)}`,
      external: false,
    };
  });

  const supportColumnLinks = [
    {
      label: helpEmail,
      href: `mailto:${helpEmail}`,
      external: false,
    },
    ...supportLinks,
    {
      label: "Denuncias",
      href: `${baseUrl}denuncias`,
      external: false,
    },
  ];

  return (
    <footer className="site-footer">
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
                  alt="Ministerio da Igualdade Racial"
                  className="logo logo-mir theme-ignore"
                />
              </a>
              <a href="https://ufrb.edu.br/" target="_blank" rel="noreferrer">
                <img
                  src={`${baseUrl}logos/ufrb.jpg`}
                  alt="Universidade Federal do Reconcavo da Bahia"
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
                  alt="Diversifica Inclusao e Diversidade"
                  className="logo logo-diversifica theme-ignore"
                />
              </a>
            </div>
            <p className="footer-brand-copy">{footer.description}</p>
          </div>

          <div className="footer-column">
            <h4>Paginas</h4>
            <ul className="footer-link-list">
              {pageLinks.map((item) => (
                <li key={item.href}>
                  <a href={item.href}>{item.label}</a>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-column">
            <h4>Institucional</h4>
            <ul className="footer-link-list">
              {institutionalLinks.map((item) => (
                <li key={item.href}>
                  <a href={item.href} target="_blank" rel="noreferrer">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="footer-column">
            <h4>Redes e parceiros</h4>
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

          <div className="footer-column">
            <h4>Atendimento direto</h4>
            <ul className="footer-link-list">
              {supportColumnLinks.map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    {...(item.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer-license-note">{licenseText}</div>
      </div>
    </footer>
  );
}
