import { useEffect, useMemo, useState } from "react";
import NewsCarousel from "../components/NewsCarousel";
import {
  deleteNewsImage,
  fetchNewsImages,
  getAuthRole,
  uploadNewsImage,
  type NewsImage,
} from "../services/api";

export default function NewsImages() {
  const [images, setImages] = useState<NewsImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadFeedback, setUploadFeedback] = useState<string | null>(null);
  const role = getAuthRole();
  const isAdmin = role === "admin";

  const loadImages = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchNewsImages();
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
    void loadImages();
  }, []);

  const carouselItems = useMemo(
    () =>
      images.map((item, index) => ({
        id: item.id,
        src: item.url,
        title: item.name ?? `Imagem ${index + 1}`,
      })),
    [images]
  );

  const handleUpload = async () => {
    if (!uploadFile) {
      setUploadFeedback("Selecione uma imagem para enviar.");
      return;
    }
    setUploading(true);
    setUploadFeedback(null);
    try {
      await uploadNewsImage(uploadFile);
      setUploadFile(null);
      await loadImages();
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
      await deleteNewsImage(id);
      setImages((current) => current.filter((item) => item.id !== id));
    } catch (deleteError) {
      const message =
        deleteError instanceof Error
          ? deleteError.message
          : "Falha ao remover imagem.";
      setError(message);
    }
  };

  return (
    <div className="page news-page">
      <section className="news-hero news-hero-media">
        <NewsCarousel
          showDots={false}
          imageOnly
          splitView
          items={carouselItems.length > 0 ? carouselItems : undefined}
        />
      </section>
      {isAdmin && (
        <section className="dashboard-card">
          <div className="form-header">
            <div>
              <span className="eyebrow">Catálogo</span>
              <h2>Gerenciar imagens do carrossel</h2>
              <p className="muted">
                Adicione ou remova imagens que aparecem no carrossel público.
              </p>
            </div>
          </div>
          <div className="form-row">
            <label>
              Nova imagem
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setUploadFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            <div className="form-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={handleUpload}
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
                  />
                  <figcaption>{item.name ?? `Imagem ${index + 1}`}</figcaption>
                  <div className="gallery-card-actions">
                    <button
                      className="btn btn-outline btn-sm"
                      type="button"
                      onClick={() => handleDelete(item.id)}
                    >
                      Remover
                    </button>
                  </div>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
