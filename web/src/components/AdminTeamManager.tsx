import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import {
  createTeamMember,
  listTeamMembers,
  updateTeamMember,
  type TeamMember,
} from "../services/api";

type TeamDraft = {
  occupation: string;
  name: string;
  resume: string;
  position: number;
};

const INITIAL_DRAFT: TeamDraft = {
  occupation: "",
  name: "",
  resume: "",
  position: 1,
};

export default function AdminTeamManager() {
  const [draft, setDraft] = useState<TeamDraft>(INITIAL_DRAFT);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [items, setItems] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const formCardRef = useRef<HTMLDivElement | null>(null);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const isEditing = Boolean(editingId);

  const loadTeamMembers = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listTeamMembers();
      setItems(response.items);
      return response.items;
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar equipe.";
      setError(message);
      setItems([]);
      return [] as TeamMember[];
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTeamMembers();
  }, []);

  const positionOptions = useMemo(() => {
    const total = Math.max(1, items.length + (isEditing ? 0 : 1));
    return Array.from({ length: total }, (_, index) => index + 1);
  }, [items.length, isEditing]);

  useEffect(() => {
    const maxPosition = Math.max(1, items.length + (isEditing ? 0 : 1));
    setDraft((current) => {
      const nextPosition = Math.min(Math.max(current.position, 1), maxPosition);
      if (nextPosition === current.position) return current;
      return { ...current, position: nextPosition };
    });
  }, [items.length, isEditing]);

  const handleDraftChange =
    (field: "occupation" | "name" | "resume") =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft((current) => ({ ...current, [field]: value }));
    };

  const handlePositionChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = Number(event.target.value);
    if (!Number.isInteger(value) || value <= 0) return;
    setDraft((current) => ({ ...current, position: value }));
  };

  const clearPhotoInput = () => {
    if (photoInputRef.current) {
      photoInputRef.current.value = "";
    }
  };

  const resetDraft = (nextPosition?: number) => {
    setDraft({
      ...INITIAL_DRAFT,
      position: nextPosition ?? Math.max(1, items.length + 1),
    });
    setPhotoFile(null);
    setEditingId(null);
    clearPhotoInput();
  };

  const handleEdit = (item: TeamMember) => {
    setEditingId(item.id);
    setFeedback(null);
    setError(null);
    setDraft({
      occupation: item.occupation,
      name: item.name,
      resume: item.resume ?? "",
      position: Math.min(Math.max(item.position, 1), Math.max(1, items.length)),
    });
    setPhotoFile(null);
    clearPhotoInput();
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleSubmit = async () => {
    if (!draft.occupation.trim()) {
      setFeedback("O campo ocupacao e obrigatorio.");
      return;
    }
    if (!draft.name.trim()) {
      setFeedback("O campo nome e obrigatorio.");
      return;
    }

    setSaving(true);
    setFeedback(null);
    setError(null);
    try {
      if (isEditing && editingId) {
        await updateTeamMember({
          id: editingId,
          occupation: draft.occupation.trim(),
          name: draft.name.trim(),
          resume: draft.resume,
          position: draft.position,
          photo_file: photoFile,
        });
      } else {
        await createTeamMember({
          occupation: draft.occupation.trim(),
          name: draft.name.trim(),
          resume: draft.resume,
          position: draft.position,
          photo_file: photoFile,
        });
      }
      const loadedItems = await loadTeamMembers();
      const nextPosition = Math.max(1, loadedItems.length + 1);
      resetDraft(nextPosition);
      setFeedback(
        isEditing
          ? "Pessoa da equipe atualizada com sucesso."
          : "Pessoa adicionada na equipe com sucesso."
      );
    } catch (saveError) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : isEditing
            ? "Falha ao atualizar pessoa da equipe."
            : "Falha ao adicionar pessoa na equipe.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="admin-team-layout">
      <div ref={formCardRef} className="dashboard-card admin-team-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">Equipe</span>
            <h3>{isEditing ? "Editar pessoa da equipe" : "Adicionar pessoa na equipe"}</h3>
            <p className="muted">
              {isEditing
                ? "Atualize os campos e salve as alteracoes. A imagem so muda se voce selecionar um novo arquivo."
                : "Defina a posicao da lista. Ao inserir em uma posicao existente, as demais pessoas descem automaticamente."}
            </p>
          </div>
        </div>

        <div className="admin-news-grid">
          <label>
            Ocupacao
            <input
              type="text"
              placeholder="Ex: Coordenador geral"
              value={draft.occupation}
              onChange={handleDraftChange("occupation")}
            />
          </label>
          <label>
            Nome
            <input
              type="text"
              placeholder="Nome completo"
              value={draft.name}
              onChange={handleDraftChange("name")}
            />
          </label>
        </div>

        <label>
          Curriculo (opcional)
          <textarea
            rows={4}
            placeholder="Breve curriculo"
            value={draft.resume}
            onChange={handleDraftChange("resume")}
          />
        </label>

        <div className="admin-news-grid">
          <label>
            Posicao
            <select value={draft.position} onChange={handlePositionChange}>
              {positionOptions.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label>
            Imagem (opcional)
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              onChange={(event) => setPhotoFile(event.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void handleSubmit()}
            disabled={saving}
          >
            {saving
              ? "Salvando..."
              : isEditing
                ? "Salvar alteracoes"
                : "Adicionar pessoa"}
          </button>
          {isEditing && (
            <button
              className="btn btn-outline"
              type="button"
              onClick={() => resetDraft(Math.max(1, items.length + 1))}
              disabled={saving}
            >
              Cancelar edicao
            </button>
          )}
        </div>

        {feedback && <div className="report-ready">{feedback}</div>}
        {error && <div className="alert">{error}</div>}
      </div>

      <div className="dashboard-card admin-team-list-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">Ordem atual</span>
            <h3>Equipe cadastrada</h3>
          </div>
        </div>
        {loading ? (
          <p className="muted">Carregando equipe...</p>
        ) : items.length === 0 ? (
          <div className="empty-card">Nenhuma pessoa cadastrada.</div>
        ) : (
          <div className="admin-team-list">
            {items.map((item) => (
              <article key={item.id} className="admin-team-item">
                {item.photo_url ? (
                  <img src={item.photo_url} alt={`${item.name} - ${item.occupation}`} />
                ) : (
                  <div className="admin-team-photo-placeholder">Sem imagem</div>
                )}
                <div className="admin-team-item-body">
                  <span className="admin-team-position">Posicao {item.position}</span>
                  <h4>{item.occupation}</h4>
                  <p>{item.name}</p>
                  {item.resume && <p className="muted">{item.resume}</p>}
                  <div>
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => handleEdit(item)}
                    >
                      Editar pessoa
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
