import { useEffect, useRef, useState } from "react";
import { Loader, type Libraries } from "@googlemaps/js-api-loader";
import type { MapPoint } from "../types/models";

const defaultCenter = { lat: -14.235, lng: -51.925 };

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
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const librariesKey = libraries ? libraries.join(",") : "";

  useEffect(() => {
    if (!apiKey || !mapRef.current) {
      return;
    }

    let isCancelled = false;
    const loader = new Loader({ apiKey, version: "weekly", libraries });

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
        } else {
          mapInstanceRef.current.setCenter(center);
          mapInstanceRef.current.setZoom(zoom);
        }

        onMapReady?.(mapInstanceRef.current);

        markersRef.current.forEach((marker) => marker.setMap(null));
        if (!infoWindowRef.current) {
          infoWindowRef.current = new googleMaps.maps.InfoWindow();
        }

        markersRef.current = points.map((point) => {
          const marker = new googleMaps.maps.Marker({
            position: { lat: point.publicLat, lng: point.publicLng },
            map: mapInstanceRef.current!,
            title: point.id,
          });

          marker.addListener("click", () => {
            if (!infoWindowRef.current || !mapInstanceRef.current) {
              return;
            }
            const container = document.createElement("div");
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
              map: mapInstanceRef.current,
            });
          });

          return marker;
        });

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
  }, [apiKey, center, librariesKey, mapId, onMapReady, points, zoom]);

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
