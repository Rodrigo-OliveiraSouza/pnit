export default function Footer() {
  const baseUrl = import.meta.env.BASE_URL || "/";
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <div className="footer-logos">
            <img
              src={`${baseUrl}logos/mir.png`}
              alt="MIR - Ministério da Igualdade Racial"
              className="logo logo-mir theme-ignore"
            />
            <img
              src={`${baseUrl}logos/diversifica.png`}
              alt="Diversifica Inclusão e Diversidade"
              className="logo logo-diversifica theme-ignore"
            />
          </div>
          <p>
            Plataforma nacional para visibilidade e gestão de pontos de residentes.
          </p>
        </div>
        <div>
          <h4>Transparência</h4>
          <ul>
            <li>Dados públicos limitados e anonimizados</li>
            <li>Política de privacidade e segurança</li>
            <li>Atualização contínua via auditoria</li>
          </ul>
        </div>
        <div>
          <h4>Contato</h4>
          <ul>
            <li>Canal institucional de suporte</li>
            <li>Ouvidoria</li>
            <li>Centro de ajuda</li>
          </ul>
        </div>
      </div>
      <div className="footer-bottom">
        <div className="footer-logos">
          <img
            src={`${baseUrl}logos/governo-brasil.png`}
            alt="Governo do Brasil"
            className="logo logo-governo theme-ignore"
          />
        </div>
        <span>Versão MVP</span>
      </div>
    </footer>
  );
}
