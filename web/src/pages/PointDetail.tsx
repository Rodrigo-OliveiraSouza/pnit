import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import MapShell from "../components/MapShell";
import type { MapPoint } from "../types/models";
import { fetchPublicPointById, type PublicPointDto } from "../services/api";
import { formatPrecision, formatStatus } from "../utils/format";

export default function PointDetail() {
  const { id } = useParams();
  const [point, setPoint] = useState<PublicPointDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("Ponto nao encontrado.");
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchPublicPointById(id)
      .then((response) => {
        setPoint(response);
        setError(null);
      })
      .catch((err) => {
        const message =
          err instanceof Error ? err.message : "Falha ao carregar ponto.";
        setError(message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const mapPoint = useMemo<MapPoint | null>(() => {
    if (!point) {
      return null;
    }
    return {
      id: point.id,
      publicLat: point.public_lat,
      publicLng: point.public_lng,
      status: point.status,
      precision: point.precision,
      updatedAt: point.updated_at,
      region: point.region ?? "-",
      residents: point.residents ?? 0,
      publicNote: point.public_note,
    };
  }, [point]);

  if (loading) {
    return (
      <div className="page">
        <section className="empty-state">
          <h1>Carregando ponto</h1>
          <p>Buscando informacoes publicas do ponto selecionado.</p>
        </section>
      </div>
    );
  }

  if (error || !mapPoint) {
    return (
      <div className="page">
        <section className="empty-state">
          <h1>Ponto nao encontrado</h1>
          <p>{error ?? "O ponto solicitado nao existe ou foi removido."}</p>
          <Link className="btn btn-primary" to="/">
            Voltar ao mapa
          </Link>
        </section>
      </div>
    );
  }

  return (
    <div className="page">
      <section className="detail-hero">
        <div>
          <span className="eyebrow">Detalhe publico</span>
          <h1>{mapPoint.id}</h1>
          <p>
            Este ponto exibe apenas dados publicos e coordenadas aproximadas.
          </p>
        </div>
        <div className="detail-actions">
          <Link className="btn btn-outline" to="/">
            Ver mapa completo
          </Link>
          <Link className="btn btn-primary" to="/login">
            Entrar para dados completos
          </Link>
        </div>
      </section>

      <section className="detail-grid">
        <div className="detail-card">
          <h3>Informacoes publicas</h3>
          <div className="detail-list">
            <div>
              <span>Regiao</span>
              <strong>{mapPoint.region}</strong>
            </div>
            {mapPoint.publicNote && (
              <div>
                <span>Descricao publica</span>
                <strong>{mapPoint.publicNote}</strong>
              </div>
            )}
            <div>
              <span>Status</span>
              <strong>{formatStatus(mapPoint.status)}</strong>
            </div>
            <div>
              <span>Precisao</span>
              <strong>{formatPrecision(mapPoint.precision)}</strong>
            </div>
            <div>
              <span>Atualizado</span>
              <strong>{mapPoint.updatedAt}</strong>
            </div>
          </div>
        </div>
        <div className="detail-card">
          <h3>Mapa aproximado</h3>
          <MapShell
            points={[mapPoint]}
            center={{ lat: mapPoint.publicLat, lng: mapPoint.publicLng }}
            zoom={10}
            height="320px"
          />
        </div>
      </section>
    </div>
  );
}
