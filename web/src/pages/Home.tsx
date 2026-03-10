import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PublicMapSection from "../components/PublicMapSection";
import NewsCarousel from "../components/NewsCarousel";
import citiesData from "../data/brazil-cities.json";
import { BRAZIL_STATES } from "../data/brazil-states";

type BrazilCity = { name: string; state: string };
type MapPreset = {
  state?: string;
  city?: string;
  community?: string;
};

const BRAZIL_CITIES = citiesData as BrazilCity[];

const quickAccessCards = [
  {
    eyebrow: "Mapa p\u00fablico",
    title: "Estados, cidades e comunidades em leitura aberta",
    description:
      "Acesse o recorte territorial com filtros claros, linguagem editorial e navega\u00e7\u00e3o visual.",
    href: "#relatorios",
    isAnchor: true,
  },
  {
    eyebrow: "Publica\u00e7\u00f5es",
    title: "Not\u00edcias, registros visuais e atualiza\u00e7\u00f5es institucionais",
    description:
      "Organize o acompanhamento da plataforma em um bloco com leitura semelhante ao portal de refer\u00eancia.",
    href: "/noticias",
    isAnchor: false,
  },
  {
    eyebrow: "Canal seguro",
    title: "Encaminhamento de den\u00fancias e demandas com acesso r\u00e1pido",
    description:
      "Mantenha destaque para o servi\u00e7o mais sens\u00edvel com contraste forte e bot\u00f5es claros.",
    href: "/denuncias",
    isAnchor: false,
  },
];

const workflowCards = [
  {
    step: "01",
    title: "Consulta p\u00fablica",
    description:
      "O visitante entra por um hero institucional, entende o prop\u00f3sito e escolhe o recorte inicial.",
  },
  {
    step: "02",
    title: "Leitura territorial",
    description:
      "O mapa revela recortes p\u00fablicos com superf\u00edcies leves, divis\u00f5es org\u00e2nicas e foco na navega\u00e7\u00e3o.",
  },
  {
    step: "03",
    title: "A\u00e7\u00e3o guiada",
    description:
      "Not\u00edcias, relat\u00f3rios e den\u00fancias ficam acess\u00edveis em cart\u00f5es institucionais e contrastantes.",
  },
];

export default function Home() {
  const [heroState, setHeroState] = useState("");
  const [heroCity, setHeroCity] = useState("");
  const [mapPreset, setMapPreset] = useState<MapPreset | null>(null);
  const mapSectionRef = useRef<HTMLDivElement | null>(null);

  const filteredCities = useMemo(() => {
    if (!heroState) {
      return BRAZIL_CITIES;
    }
    return BRAZIL_CITIES.filter((city) => city.state === heroState);
  }, [heroState]);

  const selectedCityValue =
    heroCity && heroState ? `${heroCity}__${heroState}` : "";

  const handleStateChange = (value: string) => {
    setHeroState(value);
    setHeroCity("");
  };

  const handleCityChange = (value: string) => {
    if (!value) {
      setHeroCity("");
      return;
    }
    const [city, state] = value.split("__");
    setHeroState(state);
    setHeroCity(city);
  };

  const handleExploreMap = () => {
    setMapPreset({
      state: heroState,
      city: heroCity,
      community: "",
    });
    mapSectionRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="page home-page">
      <section className="home-hero">
        <div className="home-hero-copy">
          <span className="eyebrow">Plataforma territorial</span>
          <h1>Design institucional com base clara, azul profundo e acentos terrosos</h1>
          <p className="home-hero-text">
            A home agora assume uma linguagem mais pr\u00f3xima do portal de
            refer\u00eancia: hero editorial, blocos de consulta, contrastes fortes e
            uma navega\u00e7\u00e3o organizada por servi\u00e7os.
          </p>

          <div className="home-search-card">
            <div className="home-search-header">
              <strong>Explorar por recorte inicial</strong>
              <span>Escolha um estado e uma cidade para abrir o mapa p\u00fablico.</span>
            </div>
            <div className="home-search-grid">
              <label>
                Estado
                <select
                  className="select"
                  value={heroState}
                  onChange={(event) => handleStateChange(event.target.value)}
                >
                  <option value="">Todos os estados</option>
                  {BRAZIL_STATES.map((state) => (
                    <option key={state.code} value={state.code}>
                      {state.code} - {state.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Cidade
                <select
                  className="select"
                  value={selectedCityValue}
                  onChange={(event) => handleCityChange(event.target.value)}
                >
                  <option value="">
                    {heroState ? "Selecione uma cidade" : "Escolha um estado primeiro"}
                  </option>
                  {filteredCities.map((city) => (
                    <option
                      key={`${city.name}-${city.state}`}
                      value={`${city.name}__${city.state}`}
                    >
                      {city.name} ({city.state})
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn btn-primary home-search-button" type="button" onClick={handleExploreMap}>
                Abrir mapa
              </button>
            </div>
          </div>

          <div className="home-hero-actions">
            <button className="btn btn-outline" type="button" onClick={handleExploreMap}>
              Ver mapa p\u00fablico
            </button>
            <Link to="/noticias" className="btn btn-ghost">
              Acompanhar not\u00edcias
            </Link>
            <Link to="/denuncias" className="btn btn-ghost">
              Canal de den\u00fancias
            </Link>
          </div>
        </div>

        <div className="home-hero-media">
          <div className="home-hero-frame">
            <div className="home-hero-badge">
              Curadoria visual e navega\u00e7\u00e3o institucional
            </div>
            <NewsCarousel
              className="news-carousel-hero news-carousel-media home-hero-carousel"
              showDots={false}
              imageOnly
            />
            <div className="home-hero-overlay-card">
              <span className="eyebrow">Leitura p\u00fablica</span>
              <strong>Superf\u00edcies claras, cabe\u00e7alho forte e blocos de servi\u00e7o</strong>
              <p>
                O novo layout aproxima o portal de uma experi\u00eancia editorial
                e institucional, mantendo o mapa como pe\u00e7a central.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-quick-access">
        <div className="home-section-heading">
          <span className="eyebrow">Acessos principais</span>
          <h2>Entradas r\u00e1pidas organizadas como trilhas de servi\u00e7o</h2>
        </div>
        <div className="home-card-grid">
          {quickAccessCards.map((item) =>
            item.isAnchor ? (
              <button
                key={item.title}
                type="button"
                className="home-info-card"
                onClick={handleExploreMap}
              >
                <span>{item.eyebrow}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </button>
            ) : (
              <Link key={item.title} to={item.href} className="home-info-card">
                <span>{item.eyebrow}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </Link>
            )
          )}
        </div>
      </section>

      <section className="home-workflow-band">
        <div className="home-workflow-copy">
          <span className="eyebrow">Formato inspirado na refer\u00eancia</span>
          <h2>Uma p\u00e1gina de entrada mais editorial, com divis\u00f5es fluidas e foco em orienta\u00e7\u00e3o</h2>
          <p>
            O cabe\u00e7alho institucional, os cart\u00f5es em grade e a faixa em azul
            profundo estruturam o percurso entre consulta, leitura territorial e
            servi\u00e7os sens\u00edveis.
          </p>
        </div>
        <div className="home-workflow-grid">
          {workflowCards.map((item) => (
            <article key={item.step} className="home-workflow-card">
              <span className="home-workflow-step">{item.step}</span>
              <h3>{item.title}</h3>
              <p>{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      <div ref={mapSectionRef} className="home-map-anchor">
        <PublicMapSection
          mode="public"
          publicFilterOverride={mapPreset}
        />
      </div>
    </div>
  );
}
