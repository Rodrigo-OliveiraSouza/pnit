import { useEffect, useRef, useState } from "react";
import { Loader, type Libraries } from "@googlemaps/js-api-loader";
import type { MapPoint } from "../types/models";

const defaultCenter = { lat: -14.235, lng: -51.925 };
const DEFAULT_LIBRARIES: Libraries = ["drawing"];
const PHOTO_PIN_COLOR = "#d9482b";
let sharedLoaderPromise: Promise<typeof google> | null = null;
let sharedLoaderKey: string | null = null;

function loadGoogleMaps(apiKey: string, libraries: Libraries) {
  const win = window as typeof window & { google?: typeof google };
  if (win.google?.maps) {
    return Promise.resolve(win.google);
  }
  const normalizedLibraries = Array.from(new Set(libraries));
  const key = `${apiKey}|${[...normalizedLibraries].sort().join(",")}`;
  if (!sharedLoaderPromise || sharedLoaderKey !== key) {
    sharedLoaderKey = key;
    sharedLoaderPromise = new Loader({
      apiKey,
      version: "weekly",
      libraries: normalizedLibraries,
    }).load();
  }
  return sharedLoaderPromise;
}

function buildPhotoPinIcon(
  googleMaps: typeof google,
  photoUrl?: string | null
): google.maps.Icon {
  const width = 56;
  const height = 70;
  const photoMarkup = photoUrl
    ? `<image href="${photoUrl}" x="14" y="5" width="28" height="28" preserveAspectRatio="xMidYMid slice" clip-path="url(#clip)" />`
    : `<circle cx="28" cy="19" r="14" fill="#f4eee8"/>`;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 56 70">
      <path fill="${PHOTO_PIN_COLOR}" d="M28 0C17.2 0 8.4 8.8 8.4 19.6 8.4 35.6 28 70 28 70s19.6-34.4 19.6-50.4C47.6 8.8 38.8 0 28 0z"/>
      <circle cx="28" cy="19" r="17" fill="#ffffff"/>
      <clipPath id="clip">
        <circle cx="28" cy="19" r="14"/>
      </clipPath>
      ${photoMarkup}
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
  const photoCacheRef = useRef<Map<string, string | null>>(new Map());
  const photoPromiseRef = useRef<Map<string, Promise<string | null>>>(new Map());
  const onMapReadyRef = useRef(onMapReady);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;
  const mapId = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string | undefined;
  const resolvedLibraries = libraries?.length
    ? Array.from(new Set([...DEFAULT_LIBRARIES, ...libraries]))
    : DEFAULT_LIBRARIES;
  const librariesKey = resolvedLibraries.slice().sort().join(",");

  useEffect(() => {
    onMapReadyRef.current = onMapReady;
  }, [onMapReady]);

  useEffect(() => {
    if (!apiKey || !mapRef.current) {
      return;
    }

    let isCancelled = false;
    const loaderLibraries = librariesKey
      ? (librariesKey.split(",") as Libraries)
      : DEFAULT_LIBRARIES;

    loadGoogleMaps(apiKey, loaderLibraries)
      .then((googleMaps) => {
        if (isCancelled || !mapRef.current) {
          return;
        }
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

        onMapReadyRef.current?.(mapInstanceRef.current);

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

    let isActive = true;

    const loadPhotoDataUrl = (photoUrl: string) => {
      const cached = photoCacheRef.current.get(photoUrl);
      if (cached !== undefined) {
        return Promise.resolve(cached);
      }
      const inflight = photoPromiseRef.current.get(photoUrl);
      if (inflight) {
        return inflight;
      }
      const promise = fetch(photoUrl)
        .then((response) => (response.ok ? response.blob() : null))
        .then(
          (blob) =>
            new Promise<string | null>((resolve) => {
              if (!blob) {
                resolve(null);
                return;
              }
              const reader = new FileReader();
              reader.onloadend = () =>
                resolve(typeof reader.result === "string" ? reader.result : null);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            })
        )
        .catch(() => null)
        .then((dataUrl) => {
          photoCacheRef.current.set(photoUrl, dataUrl);
          photoPromiseRef.current.delete(photoUrl);
          return dataUrl;
        });
      photoPromiseRef.current.set(photoUrl, promise);
      return promise;
    };

    markersRef.current = points.map((point) => {
      const hasPhoto = Boolean(point.photoUrl);
      const marker = new googleMaps.maps.Marker({
        position: { lat: point.publicLat, lng: point.publicLng },
        map: mapInstance,
        title: point.communityName ?? point.publicNote ?? point.id,
        icon: hasPhoto
          ? buildPhotoPinIcon(
              googleMaps,
              photoCacheRef.current.get(point.photoUrl!) ?? null
            )
          : undefined,
      });

      if (hasPhoto && point.photoUrl) {
        loadPhotoDataUrl(point.photoUrl).then((dataUrl) => {
          if (!isActive || !dataUrl) {
            return;
          }
          marker.setIcon(buildPhotoPinIcon(googleMaps, dataUrl));
        });
      }

      marker.addListener("click", () => {
        if (!infoWindowRef.current) {
          return;
        }
        const card = document.createElement("div");
        card.style.display = "flex";
        card.style.gap = "12px";
        card.style.alignItems = "center";
        card.style.padding = "8px";
        card.style.maxWidth = "280px";

        const media = document.createElement("div");
        media.style.width = "64px";
        media.style.height = "64px";
        media.style.borderRadius = "50%";
        media.style.overflow = "hidden";
        media.style.background = "#f1ece6";
        media.style.flexShrink = "0";
        if (point.photoUrl) {
          const img = document.createElement("img");
          img.src = point.photoUrl;
          img.alt = "Foto do ponto";
          img.style.width = "100%";
          img.style.height = "100%";
          img.style.objectFit = "cover";
          media.appendChild(img);
        }

        const content = document.createElement("div");
        content.style.display = "grid";
        content.style.gap = "4px";

        const header = document.createElement("div");
        header.style.display = "flex";
        header.style.alignItems = "center";
        header.style.justifyContent = "space-between";
        header.style.gap = "8px";

        const title = document.createElement("strong");
        title.textContent =
          point.communityName ?? point.publicNote ?? `Ponto ${point.id}`;
        title.style.fontSize = "14px";

        const statusDot = document.createElement("span");
        statusDot.style.width = "10px";
        statusDot.style.height = "10px";
        statusDot.style.borderRadius = "50%";
        statusDot.style.background = point.status === "active" ? "#e1552d" : "#9d8c82";

        header.appendChild(title);
        header.appendChild(statusDot);

        const description = document.createElement("div");
        description.textContent =
          point.publicNote ?? "Ponto cadastrado por agente de campo.";
        description.style.fontSize = "12px";
        description.style.color = "#5b4c44";

        const meta = document.createElement("div");
        meta.textContent = `Residentes: ${point.residents}`;
        meta.style.fontSize = "12px";
        meta.style.color = "#5b4c44";

        content.appendChild(header);
        content.appendChild(description);
        content.appendChild(meta);

        card.appendChild(media);
        card.appendChild(content);

        infoWindowRef.current.setContent(card);
        infoWindowRef.current.open({
          anchor: marker,
          map: mapInstance,
        });
      });

      return marker;
    });

    return () => {
      isActive = false;
    };
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
