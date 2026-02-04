import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="page">
      <section className="empty-state">
        <span className="eyebrow">404</span>
        <h1>Página não encontrada</h1>
        <p>O endereço que você tentou acessar não existe.</p>
        <Link className="btn btn-primary" to="/">
          Voltar ao início
        </Link>
      </section>
    </div>
  );
}
