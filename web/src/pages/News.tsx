import { useEffect, useMemo, useRef, useState } from "react";
import { listNewsPosts, type NewsPost } from "../services/api";

const formatPublishedAt = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
};

const toParagraphs = (value?: string | null) =>
  (value ?? "")
    .split(/\n+/)
    .map((part) => part.trim())
    .filter(Boolean);

export default function News() {
  const [posts, setPosts] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [scrollToArticle, setScrollToArticle] = useState(false);
  const articleRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await listNewsPosts();
        if (!active) return;
        setPosts(response.items);
        setSelectedId(response.items[0]?.id ?? null);
      } catch (loadError) {
        if (!active) return;
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar noticias.";
        setError(message);
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const selectedPost = useMemo(() => {
    if (posts.length === 0) return null;
    return posts.find((item) => item.id === selectedId) ?? posts[0];
  }, [posts, selectedId]);

  useEffect(() => {
    if (!scrollToArticle || !selectedPost || !articleRef.current) return;
    const articleTop =
      articleRef.current.getBoundingClientRect().top + window.scrollY;
    const header = document.querySelector(".site-header");
    const headerRect = header?.getBoundingClientRect();
    const headerOffset = headerRect
      ? Math.max(0, Math.min(headerRect.height, headerRect.bottom))
      : 0;
    const spacing = 16;
    window.scrollTo({
      top: Math.max(0, articleTop - headerOffset - spacing),
      behavior: "smooth",
    });
    setScrollToArticle(false);
  }, [scrollToArticle, selectedPost]);

  return (
    <div className="page news-index-page">
      <section className="module-section news-index-header">
        <span className="eyebrow">Noticias da plataforma</span>
        <h1>Acompanhe as publicacoes mais recentes</h1>
        <p className="muted">
          As noticias sao exibidas em ordem cronologica da mais recente para a
          mais antiga.
        </p>
      </section>

      <section className="news-strip">
        {loading ? (
          <div className="empty-card">Carregando noticias...</div>
        ) : error ? (
          <div className="alert">{error}</div>
        ) : posts.length === 0 ? (
          <div className="empty-card">Nenhuma noticia publicada ainda.</div>
        ) : (
          <div className="news-strip-track">
            {posts.map((post) => (
              <button
                key={post.id}
                type="button"
                className={`news-strip-card${
                  selectedPost?.id === post.id ? " active" : ""
                }`}
                onClick={() => {
                  setSelectedId(post.id);
                  setScrollToArticle(true);
                }}
              >
                <img
                  src={post.cover_url}
                  alt={post.title}
                  className="news-strip-thumb"
                />
                <div className="news-strip-body">
                  <h3>{post.title}</h3>
                  <span>{formatPublishedAt(post.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {selectedPost && (
        <section ref={articleRef} className="news-article-panel">
          <img
            src={selectedPost.cover_url}
            alt={selectedPost.title}
            className="news-article-cover"
          />
          <div className="news-article-content">
            <span className="eyebrow">
              Publicado em {formatPublishedAt(selectedPost.created_at)}
            </span>
            <h2 className="news-article-title">{selectedPost.title}</h2>
            {selectedPost.subtitle && (
              <h3 className="news-article-subtitle">{selectedPost.subtitle}</h3>
            )}
            <div className="news-article-text">
              {toParagraphs(selectedPost.body).map((paragraph, index) => (
                <p key={`body-${index}`}>{paragraph}</p>
              ))}
            </div>

            {selectedPost.support_subtitle && (
              <h4 className="news-article-support-title">
                {selectedPost.support_subtitle}
              </h4>
            )}
            {selectedPost.support_text && (
              <div className="news-article-text">
                {toParagraphs(selectedPost.support_text).map((paragraph, index) => (
                  <p key={`support-${index}`}>{paragraph}</p>
                ))}
              </div>
            )}

            {selectedPost.support_url && (
              <figure className="news-article-support">
                <img
                  src={selectedPost.support_url}
                  alt={
                    selectedPost.support_image_description ||
                    "Imagem de apoio da noticia"
                  }
                />
                <figcaption>
                  {selectedPost.support_image_description && (
                    <span>{selectedPost.support_image_description}</span>
                  )}
                  {selectedPost.support_image_source && (
                    <span>Fonte: {selectedPost.support_image_source}</span>
                  )}
                </figcaption>
              </figure>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
