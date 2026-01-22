import { useEffect, useMemo, useState } from "react";
import { fetchNewsImages } from "../services/api";

const fallbackItems = Array.from({ length: 4 }, (_, index) => ({
  id: `placeholder-${index + 1}`,
  src: "",
  title: `Imagem ${index + 1}`,
}));

type NewsCarouselProps = {
  className?: string;
  intervalMs?: number;
  showDots?: boolean;
  showArrows?: boolean;
  imageOnly?: boolean;
  items?: Array<{
    id: string;
    src: string;
    title?: string;
  }>;
};

export default function NewsCarousel({
  className,
  intervalMs = 5200,
  showDots = true,
  showArrows = true,
  imageOnly = false,
  items: itemsProp,
}: NewsCarouselProps) {
  const [remoteItems, setRemoteItems] = useState<typeof fallbackItems>([]);
  const [remoteLoaded, setRemoteLoaded] = useState(false);

  useEffect(() => {
    if (itemsProp) {
      return undefined;
    }
    let active = true;
    const load = async () => {
      try {
        const response = await fetchNewsImages();
        if (!active) return;
        const mapped = response.items.map((item, index) => ({
          id: item.id,
          src: item.url,
          title: item.name ?? `Imagem ${index + 1}`,
        }));
        setRemoteItems(mapped);
      } catch {
        if (active) {
          setRemoteItems([]);
        }
      } finally {
        if (active) {
          setRemoteLoaded(true);
        }
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [itemsProp]);

  const items = useMemo(() => {
    if (itemsProp && itemsProp.length > 0) {
      return itemsProp.map((item, index) => ({
        id: item.id,
        src: item.src,
        title: item.title ?? `Imagem ${index + 1}`,
      }));
    }
    if (remoteLoaded && remoteItems.length > 0) {
      return remoteItems;
    }
    return fallbackItems;
  }, [itemsProp, remoteItems, remoteLoaded]);

  const [activeIndex, setActiveIndex] = useState(0);
  const active = items[activeIndex];

  useEffect(() => {
    if (items.length <= 1) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setActiveIndex((previous) => (previous + 1) % items.length);
    }, intervalMs);

    return () => window.clearInterval(timer);
  }, [items.length, intervalMs]);

  const handlePrev = () => {
    setActiveIndex((previous) => (previous - 1 + items.length) % items.length);
  };

  const handleNext = () => {
    setActiveIndex((previous) => (previous + 1) % items.length);
  };

  return (
    <div className={`news-carousel${className ? ` ${className}` : ""}`}>
      <article
        key={active.id}
        className={`news-card${imageOnly ? " news-card-media" : ""}`}
      >
        <div className={`news-media${active.src ? "" : " is-placeholder"}`}>
          {active.src ? (
            <img src={active.src} alt={active.title} />
          ) : (
            <div className="news-media-placeholder" aria-hidden="true" />
          )}
        </div>
        {!imageOnly && (
          <div className="news-body">
            <h2>{active.title}</h2>
            <p>Registro visual com rotacao automatica de imagens.</p>
          </div>
        )}
        {(showDots || showArrows) && (
          <div className={`news-controls${imageOnly ? " news-controls-overlay" : ""}`}>
            {showArrows && (
              <div className="news-arrows">
                <button
                  type="button"
                  className="news-arrow"
                  onClick={handlePrev}
                  aria-label="Imagem anterior"
                >
                  {"<"}
                </button>
                <button
                  type="button"
                  className="news-arrow"
                  onClick={handleNext}
                  aria-label="Proxima imagem"
                >
                  {">"}
                </button>
              </div>
            )}
            {showDots && (
              <div className="news-dots">
                {items.map((item, index) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`news-dot${index === activeIndex ? " active" : ""}`}
                    onClick={() => setActiveIndex(index)}
                    aria-label={`Mostrar ${item.title}`}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </article>
    </div>
  );
}
