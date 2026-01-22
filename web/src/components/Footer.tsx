export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="footer-grid">
        <div>
          <div className="footer-logos">
            <img
              src="/logos/mir.png"
              alt="MIR - Ministerio da Igualdade Racial"
              className="logo logo-mir"
            />
            <img
              src="/logos/diversifica.png"
              alt="Diversifica Inclusao e Diversidade"
              className="logo logo-diversifica"
            />
          </div>
          <p>
            Plataforma nacional para visibilidade e gestao de pontos de residentes.
          </p>
        </div>
        <div>
          <h4>Transparencia</h4>
          <ul>
            <li>Dados publicos limitados e anonimizados</li>
            <li>Politica de privacidade e seguranca</li>
            <li>Atualizacao continua via auditoria</li>
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
            src="/logos/governo-brasil.png"
            alt="Governo do Brasil"
            className="logo logo-governo"
          />
        </div>
        <span>Versao MVP</span>
      </div>
    </footer>
  );
}
