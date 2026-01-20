import PublicMapSection from "../components/PublicMapSection";

export default function Reports() {
  return (
    <div className="page">
      <section className="public-hero">
        <div>
          <span className="eyebrow">Relatorios</span>
          <h1>Selecione areas e gere relatorios territoriais</h1>
          <p className="lead">
            Use o mapa interativo para recortar areas e exportar dados publicos
            em diferentes formatos.
          </p>
        </div>
      </section>
      <PublicMapSection />
    </div>
  );
}
