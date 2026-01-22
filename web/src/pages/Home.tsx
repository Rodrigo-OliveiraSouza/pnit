import PublicMapSection from "../components/PublicMapSection";
import NewsCarousel from "../components/NewsCarousel";

export default function Home() {
  return (
    <div className="page">
      <section className="landing-hero landing-hero-media">
        <NewsCarousel
          className="news-carousel-hero news-carousel-media"
          showDots={false}
          imageOnly
        />
      </section>

      <PublicMapSection mode="public" />
    </div>
  );
}
