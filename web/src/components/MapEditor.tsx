import { useCallback, useEffect, useRef, useState } from "react";
import MapShell from "./MapShell";
import type { MapPoint } from "../types/models";

const emptyPoints: MapPoint[] = [];

export type SelectedLocation = {
  lat: number;
  lng: number;
};

type MapEditorProps = {
  onLocationChange?: (location: SelectedLocation | null) => void;
  resetKey?: number;
};

export default function MapEditor({ onLocationChange, resetKey }: MapEditorProps) {
  const [selectedLocation, setSelectedLocation] = useState<SelectedLocation | null>(
    null
  );
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const listenerRef = useRef<google.maps.MapsEventListener | null>(null);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    if (listenerRef.current) {
      listenerRef.current.remove();
    }
    listenerRef.current = map.addListener("click", (event: google.maps.MapMouseEvent) => {
      if (!event.latLng) {
        return;
      }
      const lat = event.latLng.lat();
      const lng = event.latLng.lng();
      const position = { lat, lng };
      setSelectedLocation(position);
      if (!markerRef.current) {
        markerRef.current = new google.maps.Marker({
          position,
          map,
        });
      } else {
        markerRef.current.setPosition(position);
        markerRef.current.setMap(map);
      }
    });
  }, []);

  useEffect(() => {
    onLocationChange?.(selectedLocation);
  }, [onLocationChange, selectedLocation]);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        listenerRef.current.remove();
      }
    };
  }, []);

  useEffect(() => {
    if (resetKey !== undefined) {
      clearLocation();
    }
  }, [resetKey]);

  const clearLocation = () => {
    setSelectedLocation(null);
    if (markerRef.current) {
      markerRef.current.setMap(null);
    }
  };

  return (
    <div className="map-editor">
      <MapShell points={emptyPoints} height="360px" onMapReady={handleMapReady} />
      <div className="map-editor-info">
        <div>
          <span className="eyebrow">Localizacao</span>
          <h4>Informacoes do ponto</h4>
          {selectedLocation ? (
            <p>
              Latitude {selectedLocation.lat.toFixed(5)} | Longitude{" "}
              {selectedLocation.lng.toFixed(5)}
            </p>
          ) : (
            <p className="muted">Clique no mapa para definir o ponto.</p>
          )}
        </div>
        <button className="btn btn-outline" type="button" onClick={clearLocation}>
          Limpar local
        </button>
      </div>
    </div>
  );
}
