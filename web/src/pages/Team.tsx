import { useEffect, useState } from "react";
import { listTeamMembers, type TeamMember } from "../services/api";

export default function Team() {
  const [items, setItems] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await listTeamMembers();
        if (!active) return;
        setItems(response.items);
      } catch (loadError) {
        if (!active) return;
        const message =
          loadError instanceof Error
            ? loadError.message
            : "Falha ao carregar equipe.";
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

  return (
    <div className="page team-page">
      <section className="module-section team-header">
        <span className="eyebrow">Equipe</span>
        <h1>Responsaveis, coordenacao e equipe tecnica</h1>
        <p className="muted">
          Conheca as pessoas que organizam e acompanham a plataforma.
        </p>
      </section>

      <section className="module-section">
        {loading ? (
          <div className="empty-card">Carregando equipe...</div>
        ) : error ? (
          <div className="alert">{error}</div>
        ) : items.length === 0 ? (
          <div className="empty-card">Nenhuma pessoa cadastrada ainda.</div>
        ) : (
          <div className="team-list">
            {items.map((member) => (
              <article key={member.id} className="team-card">
                {member.photo_url ? (
                  <img
                    src={member.photo_url}
                    alt={`${member.name} - ${member.occupation}`}
                    className="team-card-photo"
                  />
                ) : (
                  <div className="team-card-photo team-card-photo-placeholder">
                    Sem imagem
                  </div>
                )}
                <div className="team-card-body">
                  <h2>{member.occupation}</h2>
                  <h3>{member.name}</h3>
                  {member.resume && <p>{member.resume}</p>}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
