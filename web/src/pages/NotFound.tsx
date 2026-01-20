import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="page">
      <section className="empty-state">
        <span className="eyebrow">404</span>
        <h1>Pagina nao encontrada</h1>
        <p>O endereco que voce tentou acessar nao existe.</p>
        <Link className="btn btn-primary" to="/">
          Voltar ao inicio
        </Link>
      </section>
    </div>
  );
}
