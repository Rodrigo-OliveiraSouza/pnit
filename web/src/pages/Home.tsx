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
    eyebrow: "Mapa público",
    title: "Estados, cidades e comunidades em leitura aberta",
    description:
      "Acesse o recorte territorial com filtros claros, linguagem editorial e navegação visual.",
    href: "#relatorios",
    isAnchor: true,
  },
  {
    eyebrow: "Publicações",
    title: "Notícias, registros visuais e atualizações institucionais",
    description:
      "Organize o acompanhamento da plataforma em um bloco com leitura semelhante ao portal de referência.",
    href: "/noticias",
    isAnchor: false,
  },
  {
    eyebrow: "Canal seguro",
    title: "Encaminhamento de denúncias e demandas com acesso rápido",
    description:
      "Mantenha destaque para o serviço mais sensível com contraste forte e botões claros.",
    href: "/denuncias",
    isAnchor: false,
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
            A home agora assume uma linguagem mais próxima do portal de
            referência: hero editorial, blocos de consulta, contrastes fortes e
            uma navegação organizada por serviços.
          </p>

          <div className="home-search-card">
            <div className="home-search-header">
              <strong>Explorar por recorte inicial</strong>
              <span>Escolha um estado e uma cidade para abrir o mapa público.</span>
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
              Ver mapa público
            </button>
            <Link to="/noticias" className="btn btn-ghost">
              Acompanhar notícias
            </Link>
            <Link to="/denuncias" className="btn btn-ghost">
              Canal de denúncias
            </Link>
          </div>
        </div>

        <div className="home-hero-media">
          <div className="home-hero-frame">
            <div className="home-hero-badge">
              Curadoria visual e navegação institucional
            </div>
            <NewsCarousel
              className="news-carousel-hero news-carousel-media home-hero-carousel"
              showDots={false}
              imageOnly
            />
            <div className="home-hero-overlay-card">
              <span className="eyebrow">Leitura pública</span>
              <strong>Superfícies claras, cabeçalho forte e blocos de serviço</strong>
              <p>
                O novo layout aproxima o portal de uma experiência editorial e
                institucional, mantendo o mapa como peça central.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="home-quick-access">
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

      <div ref={mapSectionRef} className="home-map-anchor">
        <PublicMapSection
          mode="public"
          publicFilterOverride={mapPreset}
        />
      </div>
    </div>
  );
}
