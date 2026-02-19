import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  createNewsPost,
  listNewsPosts,
  updateNewsPost,
  type NewsPost,
} from "../services/api";

type NewsDraft = {
  title: string;
  subtitle: string;
  body: string;
  support_subtitle: string;
  support_text: string;
  support_image_description: string;
  support_image_source: string;
};

const INITIAL_DRAFT: NewsDraft = {
  title: "",
  subtitle: "",
  body: "",
  support_subtitle: "",
  support_text: "",
  support_image_description: "",
  support_image_source: "",
};

const formatPublishedAt = (value?: string) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("pt-BR");
};

export default function AdminNewsManager() {
  const [draft, setDraft] = useState<NewsDraft>(INITIAL_DRAFT);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [supportFile, setSupportFile] = useState<File | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<NewsPost[]>([]);
  const [loading, setLoading] = useState(false);
  const formCardRef = useRef<HTMLDivElement | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const supportInputRef = useRef<HTMLInputElement | null>(null);

  const loadNews = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await listNewsPosts();
      setItems(response.items);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar noticias publicadas.";
      setError(message);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadNews();
  }, []);

  const handleDraftChange =
    (field: keyof NewsDraft) =>
    (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setDraft((current) => ({ ...current, [field]: value }));
    };

  const clearFileInputs = () => {
    if (coverInputRef.current) {
      coverInputRef.current.value = "";
    }
    if (supportInputRef.current) {
      supportInputRef.current.value = "";
    }
  };

  const resetDraft = () => {
    setDraft(INITIAL_DRAFT);
    setCoverFile(null);
    setSupportFile(null);
    setEditingId(null);
    clearFileInputs();
  };

  const handleEdit = (item: NewsPost) => {
    setEditingId(item.id);
    setFeedback(null);
    setError(null);
    setDraft({
      title: item.title,
      subtitle: item.subtitle ?? "",
      body: item.body,
      support_subtitle: item.support_subtitle ?? "",
      support_text: item.support_text ?? "",
      support_image_description: item.support_image_description ?? "",
      support_image_source: item.support_image_source ?? "",
    });
    setCoverFile(null);
    setSupportFile(null);
    clearFileInputs();
    formCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const isEditing = Boolean(editingId);

  const handlePublish = async () => {
    if (!draft.title.trim()) {
      setFeedback("Titulo da noticia e obrigatorio.");
      return;
    }
    if (!draft.body.trim()) {
      setFeedback("Texto principal da noticia e obrigatorio.");
      return;
    }
    if (!isEditing && !coverFile) {
      setFeedback("A imagem de apresentacao e obrigatoria.");
      return;
    }
    if (!isEditing && !supportFile) {
      setFeedback("A imagem de apoio e obrigatoria.");
      return;
    }

    setPublishing(true);
    setFeedback(null);
    setError(null);
    try {
      if (isEditing && editingId) {
        await updateNewsPost({
          id: editingId,
          ...draft,
          title: draft.title.trim(),
          body: draft.body.trim(),
          cover_file: coverFile,
          support_file: supportFile,
        });
        setFeedback("Noticia atualizada com sucesso.");
      } else {
        await createNewsPost({
          ...draft,
          title: draft.title.trim(),
          body: draft.body.trim(),
          cover_file: coverFile as File,
          support_file: supportFile as File,
        });
        setFeedback("Noticia publicada com sucesso.");
      }
      resetDraft();
      await loadNews();
    } catch (publishError) {
      const message =
        publishError instanceof Error
          ? publishError.message
          : isEditing
            ? "Falha ao atualizar noticia."
            : "Falha ao publicar noticia.";
      setError(message);
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="admin-news-layout">
      <div ref={formCardRef} className="dashboard-card admin-news-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">Noticias</span>
            <h3>{isEditing ? "Editar noticia publicada" : "Publicar nova noticia"}</h3>
            <p className="muted">
              {isEditing
                ? "Atualize os campos e salve as alteracoes. As imagens so mudam se voce selecionar novos arquivos."
                : "Preencha os campos abaixo para publicar no mural oficial."}
            </p>
          </div>
        </div>

        <div className="admin-news-grid">
          <label>
            Titulo da noticia
            <input
              className="admin-news-title-input"
              type="text"
              placeholder="Digite o titulo principal"
              value={draft.title}
              onChange={handleDraftChange("title")}
            />
          </label>
          <label>
            Subtitulo
            <input
              type="text"
              placeholder="Digite um subtitulo"
              value={draft.subtitle}
              onChange={handleDraftChange("subtitle")}
            />
          </label>
        </div>

        <label>
          Texto principal
          <textarea
            rows={6}
            placeholder="Conteudo principal da noticia"
            value={draft.body}
            onChange={handleDraftChange("body")}
          />
        </label>

        <div className="admin-news-grid">
          <label>
            Subtitulo de apoio
            <input
              type="text"
              placeholder="Subtitulo para bloco complementar"
              value={draft.support_subtitle}
              onChange={handleDraftChange("support_subtitle")}
            />
          </label>
          <label>
            Fonte da imagem de apoio
            <input
              type="text"
              placeholder="Ex: Ministerio da Igualdade Racial"
              value={draft.support_image_source}
              onChange={handleDraftChange("support_image_source")}
            />
          </label>
        </div>

        <label>
          Texto complementar
          <textarea
            rows={4}
            placeholder="Informacoes complementares"
            value={draft.support_text}
            onChange={handleDraftChange("support_text")}
          />
        </label>

        <label>
          Descricao da imagem de apoio
          <input
            type="text"
            placeholder="Descreva a imagem de apoio"
            value={draft.support_image_description}
            onChange={handleDraftChange("support_image_description")}
          />
        </label>

        <div className="admin-news-grid">
          <label>
            Foto de apresentacao da noticia
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              onChange={(event) =>
                setCoverFile(event.target.files?.[0] ?? null)
              }
            />
          </label>
          <label>
            Imagem de apoio da noticia
            <input
              ref={supportInputRef}
              type="file"
              accept="image/*"
              onChange={(event) =>
                setSupportFile(event.target.files?.[0] ?? null)
              }
            />
          </label>
        </div>

        <div className="form-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void handlePublish()}
            disabled={publishing}
          >
            {publishing
              ? isEditing
                ? "Salvando..."
                : "Publicando..."
              : isEditing
                ? "Salvar alteracoes"
                : "Publicar noticia"}
          </button>
          {isEditing && (
            <button
              className="btn btn-outline"
              type="button"
              onClick={resetDraft}
              disabled={publishing}
            >
              Cancelar edicao
            </button>
          )}
        </div>
        {feedback && <div className="report-ready">{feedback}</div>}
        {error && <div className="alert">{error}</div>}
      </div>

      <div className="dashboard-card admin-news-list-card">
        <div className="form-header">
          <div>
            <span className="eyebrow">Cronologia</span>
            <h3>Noticias publicadas</h3>
          </div>
        </div>
        {loading ? (
          <p className="muted">Carregando noticias...</p>
        ) : items.length === 0 ? (
          <div className="empty-card">Nenhuma noticia publicada.</div>
        ) : (
          <div className="admin-news-list">
            {items.map((item) => (
              <article key={item.id} className="admin-news-item">
                <img src={item.cover_url} alt={item.title} />
                <div className="admin-news-item-content">
                  <div className="admin-news-item-meta">
                    <h4>{item.title}</h4>
                    <p className="muted">
                      Publicado em {formatPublishedAt(item.created_at)}
                    </p>
                    {item.updated_at && item.updated_at !== item.created_at && (
                      <p className="muted">
                        Atualizado em {formatPublishedAt(item.updated_at)}
                      </p>
                    )}
                  </div>
                  <button
                    className="btn btn-outline btn-sm"
                    type="button"
                    onClick={() => handleEdit(item)}
                  >
                    Editar noticia
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
