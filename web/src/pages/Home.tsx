import PublicMapSection from "../components/PublicMapSection";
import NewsCarousel from "../components/NewsCarousel";

export default function Home() {
  return (
    <div className="page home-page">
      <section className="home-hero home-hero--carousel-only">
        <div className="home-hero-media">
          <div className="home-hero-frame">
            <NewsCarousel
              className="news-carousel-media home-hero-carousel"
              showDots={false}
              imageOnly
              collection="news-posts"
            />
          </div>
        </div>
      </section>

      <div className="home-map-anchor">
        <PublicMapSection mode="public" />
      </div>
    </div>
  );
}
