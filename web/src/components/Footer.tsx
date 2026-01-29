import { useSiteCopy } from "../providers/SiteCopyProvider";

export default function Footer() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const { copy } = useSiteCopy();
  const { footer } = copy;
  const contactLinks: Record<number, string> = {
    0: "https://infinity.dev.br/",
    1: "mailto:territoriaisagentes@gmail.com",
    2: `${baseUrl}denuncias`,
  };
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <div className="footer-logos">
            <a href="https://www.gov.br/pt-br" target="_blank" rel="noreferrer">
              <img
                src={`${baseUrl}logos/governo-brasil.png`}
                alt="Governo do Brasil"
                className="logo logo-governo theme-ignore"
              />
            </a>
            <a
              href="https://plataformadiversifica.vercel.app/"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={`${baseUrl}logos/diversifica.png`}
                alt="Diversifica Inclus\u00e3o e Diversidade"
                className="logo logo-diversifica theme-ignore"
              />
            </a>
            <a
              href="https://www.gov.br/igualdaderacial/pt-br"
              target="_blank"
              rel="noreferrer"
            >
              <img
                src={`${baseUrl}logos/mir.png`}
                alt="MIR - Minist\u00e9rio da Igualdade Racial"
                className="logo logo-mir theme-ignore"
              />
            </a>
          </div>
          <p>{footer.description}</p>
        </div>
        <div className="footer-contact">
          <h4>{footer.contactTitle}</h4>
          <ul>
            {footer.contactItems.map((item, index) => {
              const link = contactLinks[index];
              if (!link) {
                return <li key={`contact-${index}`}>{item}</li>;
              }
              const isExternal = link.startsWith("http");
              return (
                <li key={`contact-${index}`}>
                  <a
                    href={link}
                    {...(isExternal
                      ? { target: "_blank", rel: "noreferrer" }
                      : {})}
                  >
                    {item}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>{footer.version}</span>
      </div>
    </footer>
  );
}
