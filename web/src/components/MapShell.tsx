import { useEffect, useRef, useState } from "react";
import { Loader, type Libraries } from "@googlemaps/js-api-loader";
import type { MapPoint } from "../types/models";

const defaultCenter = { lat: -14.235, lng: -51.925 };
const DEFAULT_LIBRARIES: Libraries = ["drawing"];
const PHOTO_PIN_COLOR = "#d9482b";

function buildPhotoPinIcon(
  googleMaps: typeof google,
  photoUrl: string
): google.maps.Icon {
  const width = 56;
  const height = 70;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 56 70">
      <path fill="${PHOTO_PIN_COLOR}" d="M28 0C17.2 0 8.4 8.8 8.4 19.6 8.4 35.6 28 70 28 70s19.6-34.4 19.6-50.4C47.6 8.8 38.8 0 28 0z"/>
      <circle cx="28" cy="19" r="17" fill="#ffffff"/>
      <clipPath id="clip">
        <circle cx="28" cy="19" r="14"/>
      </clipPath>
      <image href="${photoUrl}" x="14" y="5" width="28" height="28" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip)" />
    </svg>
  `;
  const url = `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  return {
    url,
    scaledSize: new googleMaps.maps.Size(width, height),
    anchor: new googleMaps.maps.Point(width / 2, height),
  };
}

type MapShellProps = {
  points: MapPoint[];
  center?: { lat: number; lng: number };
  zoom?: number;
  height?: string;
  libraries?: Libraries;
  onMapReady?: (map: google.maps.Map) => void;
};

export default function MapShell({
  points,
  center = defaultCenter,
  zoom = 4,
  height = "480px",
  libraries,
  onMapReady,
}: MapShellProps) {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const googleMapsRef = useRef<typeof google | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const resolvedLibraries = libraries
    ? Array.from(new Set([...DEFAULT_LIBRARIES, ...libraries]))
    : DEFAULT_LIBRARIES;
  const librariesKey = resolvedLibraries.join(",");

  useEffect(() => {
    if (!apiKey || !mapRef.current) {
      return;
    }

    let isCancelled = false;
    const loaderLibraries = librariesKey
      ? (librariesKey.split(",") as Libraries)
      : DEFAULT_LIBRARIES;
    const loader = new Loader({
      apiKey,
      version: "weekly",
      libraries: loaderLibraries,
    });

    loader
      .load()
      .then(() => {
        if (isCancelled || !mapRef.current) {
          return;
        }
        const googleMaps = (
          window as typeof window & { google?: typeof google }
        ).google;
        if (!googleMaps?.maps) {
          throw new Error("Google Maps indisponivel.");
        }
        googleMapsRef.current = googleMaps;

        if (!mapInstanceRef.current) {
          const mapOptions: google.maps.MapOptions = {
            center,
            zoom,
            fullscreenControl: false,
            streetViewControl: false,
            mapTypeControl: false,
          };
          if (mapId) {
            mapOptions.mapId = mapId;
          }
          mapInstanceRef.current = new googleMaps.maps.Map(
            mapRef.current,
            mapOptions
          );
        }

        onMapReady?.(mapInstanceRef.current);

        setLoadError(null);
        setIsLoaded(true);
      })
      .catch((error) => {
        if (isCancelled) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Falha ao carregar o Google Maps.";
        setLoadError(message);
        setIsLoaded(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [apiKey, librariesKey, mapId, onMapReady]);

  useEffect(() => {
    if (!mapInstanceRef.current) {
      return;
    }
    mapInstanceRef.current.setCenter(center);
    mapInstanceRef.current.setZoom(zoom);
  }, [center, zoom]);

  useEffect(() => {
    const mapInstance = mapInstanceRef.current;
    const googleMaps = googleMapsRef.current;
    if (!mapInstance || !googleMaps) {
      return;
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    if (!infoWindowRef.current) {
      infoWindowRef.current = new googleMaps.maps.InfoWindow();
    }

    markersRef.current = points.map((point) => {
      const hasPhoto = Boolean(point.photoUrl);
      const marker = new googleMaps.maps.Marker({
        position: { lat: point.publicLat, lng: point.publicLng },
        map: mapInstance,
        title: point.id,
        icon: hasPhoto
          ? buildPhotoPinIcon(googleMaps, point.photoUrl!)
          : undefined,
      });

      marker.addListener("click", () => {
        if (!infoWindowRef.current) {
          return;
        }
        const container = document.createElement("div");
        if (point.photoUrl) {
          const img = document.createElement("img");
          img.src = point.photoUrl;
          img.alt = "Foto do ponto";
          img.style.width = "140px";
          img.style.height = "92px";
          img.style.objectFit = "cover";
          img.style.display = "block";
          img.style.marginBottom = "0.5rem";
          container.appendChild(img);
        }
        const title = document.createElement("strong");
        title.textContent = point.publicNote
          ? point.publicNote
          : `Ponto ${point.id}`;
        const meta = document.createElement("div");
        meta.textContent = `Status: ${point.status}`;
        const region = document.createElement("div");
        region.textContent = `Regiao: ${point.region}`;
        const residents = document.createElement("div");
        residents.textContent = `Residentes: ${point.residents}`;
        container.appendChild(title);
        container.appendChild(meta);
        container.appendChild(region);
        container.appendChild(residents);
        infoWindowRef.current.setContent(container);
        infoWindowRef.current.open({
          anchor: marker,
          map: mapInstance,
        });
      });

      return marker;
    });
  }, [points, isLoaded]);

  return (
    <div className="map-shell" style={{ height }}>
      <div className="map-surface">
        <div className="map-canvas" ref={mapRef} />
        {!apiKey && (
          <div className="map-fallback">
            <div>
              <span className="eyebrow">Mapa indisponivel</span>
              <h3>Configure a chave da API Google Maps</h3>
              <p>
                Defina <code>VITE_GOOGLE_MAPS_API_KEY</code> para carregar o
                mapa.
              </p>
            </div>
          </div>
        )}
        {apiKey && loadError && (
          <div className="map-fallback">
            <div>
              <span className="eyebrow">Erro no mapa</span>
              <h3>Nao foi possivel carregar o Google Maps</h3>
              <p>{loadError}</p>
            </div>
          </div>
        )}
        {apiKey && !loadError && !isLoaded && (
          <div className="map-loading">
            <span className="spinner" />
            <span>Carregando mapa</span>
          </div>
        )}
      </div>
    </div>
  );
}
