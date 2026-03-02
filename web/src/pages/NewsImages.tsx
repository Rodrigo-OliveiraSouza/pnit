import NewsCarousel from "../components/NewsCarousel";
import AdminMediaManager from "../components/AdminMediaManager";
import { getAuthRole } from "../services/api";

export default function NewsImages() {
  const role = getAuthRole();
  const canManageSiteContent = role === "admin" || role === "content";

  return (
    <div className="page news-page">
      <section className="news-hero news-hero-media">
        <NewsCarousel showDots={false} imageOnly collection="news" />
      </section>
      {canManageSiteContent && <AdminMediaManager />}
    </div>
  );
}
