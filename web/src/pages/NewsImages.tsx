import NewsCarousel from "../components/NewsCarousel";

export default function NewsImages() {
  return (
    <div className="page news-page">
      <section className="news-hero">
        <div className="news-intro">
          <span className="eyebrow">Imagens noticias</span>
          <h1>Sequencia visual de registros territoriais</h1>
          <p className="lead">
            As imagens enviadas pela equipe aparecem neste formato e percorrem a
            sequencia automaticamente. Quando voce inserir novas imagens, elas
            entram no giro sem alterar o layout.
          </p>
        </div>
        <NewsCarousel />
      </section>
    </div>
  );
}
