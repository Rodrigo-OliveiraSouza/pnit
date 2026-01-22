import { useEffect, useMemo, useState } from "react";

const imageModules = import.meta.glob("../assets/news/*.{png,jpg,jpeg,webp,avif,svg}", {
  eager: true,
  as: "url",
});

const fallbackItems = Array.from({ length: 4 }, (_, index) => ({
  id: `placeholder-${index + 1}`,
  src: "",
  title: `Imagem ${index + 1}`,
}));

const buildItems = () =>
  Object.entries(imageModules)
    .map(([path, src]) => {
      const rawName = path.split("/").pop() ?? "";
      const title = rawName
        .replace(/\.[^.]+$/, "")
        .replace(/[-_]+/g, " ")
        .trim();
      return {
        id: rawName || path,
        src: src as string,
        title: title || "Imagem",
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title));

type NewsCarouselProps = {
  className?: string;
  intervalMs?: number;
  showDots?: boolean;
  showArrows?: boolean;
};

export default function NewsCarousel({
  className,
  intervalMs = 5200,
  showDots = true,
  showArrows = true,
}: NewsCarouselProps) {
  const items = useMemo(() => {
    const list = buildItems();
    return list.length > 0 ? list : fallbackItems;
  }, []);

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
      <article key={active.id} className="news-card">
        <div className={`news-media${active.src ? "" : " is-placeholder"}`}>
          {active.src ? (
            <img src={active.src} alt={active.title} />
          ) : (
            <div className="news-media-placeholder" aria-hidden="true" />
          )}
        </div>
        <div className="news-body">
          <h2>{active.title}</h2>
          <p>Registro visual com rotacao automatica de imagens.</p>
        </div>
        {(showDots || showArrows) && (
          <div className="news-controls">
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
