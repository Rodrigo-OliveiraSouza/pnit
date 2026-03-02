import { useEffect, useMemo, useState } from "react";
import {
  deleteNewsImage,
  deleteReportsImage,
  fetchNewsImages,
  fetchReportsImages,
  getAuthRole,
  uploadNewsImage,
  uploadReportsImage,
  type NewsImage,
} from "../services/api";

type MediaCollection = "news" | "reports";

export default function AdminMediaManager() {
  const [images, setImages] = useState<NewsImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const [collection, setCollection] = useState<MediaCollection>("news");
  const role = getAuthRole();
  const canManageSiteContent = role === "admin" || role === "content";

  const loadImages = async (targetCollection: MediaCollection = collection) => {
    setLoading(true);
    setError(null);
    try {
      const response =
        targetCollection === "reports"
          ? await fetchReportsImages()
          : await fetchNewsImages();
      setImages(response.items);
    } catch (loadError) {
      const message =
        loadError instanceof Error
          ? loadError.message
          : "Falha ao carregar imagens.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canManageSiteContent) return;
    void loadImages(collection);
  }, [canManageSiteContent, collection]);

  const collectionLabel = useMemo(
    () =>
      collection === "reports" ? "Carrossel de conta" : "Carrossel público",
    [collection]
  );

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadFeedback("Selecione uma imagem para enviar.");
      return;
    }
    setUploading(true);
    setUploadFeedback(null);
    try {
      if (collection === "reports") {
        await uploadReportsImage(uploadFile);
      } else {
        await uploadNewsImage(uploadFile);
      }
      setUploadFile(null);
      await loadImages(collection);
      setUploadFeedback("Imagem adicionada com sucesso.");
    } catch (uploadError) {
      const message =
        uploadError instanceof Error
          ? uploadError.message
          : "Falha ao enviar imagem.";
      setUploadFeedback(message);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Remover esta imagem do catálogo?")) {
      return;
    }
    try {
      if (collection === "reports") {
        await deleteReportsImage(id);
      } else {
        await deleteNewsImage(id);
      }
      setImages((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao remover imagem.";
      setError(message);
    }
  };

  if (!canManageSiteContent) {
    return (
      <div className="dashboard-card">
        <div className="alert">Acesso restrito ao gerenciamento de carrosséis.</div>
      </div>
    );
  }

  return (
    <div className="dashboard-card">
      <div className="tabs" role="tablist" aria-label="Coleções de carrossel">
        <button
          type="button"
          role="tab"
          aria-selected={collection === "news"}
          className={`tab${collection === "news" ? " active" : ""}`}
          onClick={() => {
            setCollection("news");
            setUploadFeedback(null);
            setError(null);
          }}
        >
          Carrossel público
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={collection === "reports"}
          className={`tab${collection === "reports" ? " active" : ""}`}
          onClick={() => {
            setCollection("reports");
            setUploadFeedback(null);
            setError(null);
          }}
        >
          Carrossel de conta
        </button>
      </div>
      <div className="form-header">
        <div>
          <span className="eyebrow">Catálogo</span>
          <h2>Gerenciar imagens do carrossel</h2>
          <p className="muted">
            {collection === "reports"
              ? "Atualize as imagens exibidas na criação de conta e nas áreas internas."
              : "Atualize as imagens exibidas no carrossel público do site."}
          </p>
        </div>
        <span className="status">{collectionLabel}</span>
      </div>
      <div className="form-row">
        <label>
          Nova imagem
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
          />
        </label>
        <div className="form-actions">
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void handleUpload()}
            disabled={uploading}
          >
            {uploading ? "Enviando..." : "Adicionar ao catálogo"}
          </button>
        </div>
      </div>
      {uploadFeedback && <div className="alert">{uploadFeedback}</div>}
      {error && <div className="alert">{error}</div>}
      {loading ? (
        <p className="muted">Carregando imagens...</p>
      ) : images.length === 0 ? (
        <div className="empty-card">Nenhuma imagem cadastrada.</div>
      ) : (
        <div className="gallery-grid">
          {images.map((item, index) => (
            <figure key={item.id} className="gallery-card">
              <img
                src={item.url}
                alt={item.name ?? `Imagem ${index + 1}`}
                className="theme-media-img"
              />
              <figcaption>{item.name ?? `Imagem ${index + 1}`}</figcaption>
              <div className="gallery-card-actions">
                <button
                  className="btn btn-outline btn-sm"
                  type="button"
                  onClick={() => void handleDelete(item.id)}
                >
                  Remover
                </button>
              </div>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
