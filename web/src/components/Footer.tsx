import { useSiteCopy } from "../providers/SiteCopyProvider";

export default function Footer() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const { copy } = useSiteCopy();
  const { footer } = copy;
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <div className="footer-logos">
            <img
              src={`${baseUrl}logos/governo-brasil.png`}
              alt="Governo do Brasil"
              className="logo logo-governo theme-ignore"
            />
            <img
              src={`${baseUrl}logos/diversifica.png`}
              alt="Diversifica Inclus\u00e3o e Diversidade"
              className="logo logo-diversifica theme-ignore"
            />
            <img
              src={`${baseUrl}logos/mir.png`}
              alt="MIR - Minist\u00e9rio da Igualdade Racial"
              className="logo logo-mir theme-ignore"
            />
          </div>
          <p>{footer.description}</p>
        </div>
        <div>
          <h4>{footer.transparencyTitle}</h4>
          <ul>
            {footer.transparencyItems.map((item, index) => (
              <li key={`transparency-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h4>{footer.contactTitle}</h4>
          <ul>
            {footer.contactItems.map((item, index) => (
              <li key={`contact-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <span>{footer.version}</span>
      </div>
    </footer>
  );
}
