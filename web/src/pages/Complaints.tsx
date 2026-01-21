import { useState } from "react";
import { submitComplaint } from "../services/api";

export default function Complaints() {
  const [type, setType] = useState("Infraestrutura");
  const [description, setDescription] = useState("");
  const [locationText, setLocationText] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);
    if (!description.trim()) {
      setStatus({ type: "error", message: "Descreva a denuncia." });
      return;
    }
    setLoading(true);
    try {
      await submitComplaint({
        type,
        description,
        location_text: locationText,
        city,
        state,
        file,
      });
      setStatus({
        type: "success",
        message: "Denuncia registrada. Obrigado por contribuir.",
      });
      setDescription("");
      setLocationText("");
      setCity("");
      setState("");
      setFile(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao enviar denuncia.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <section className="public-hero">
        <div>
          <span className="eyebrow">Canal de denuncias</span>
          <h1>Envie um relato publico com seguranca</h1>
          <p className="lead">
            Este canal e aberto para qualquer pessoa. Dados sensiveis ficam
            protegidos.
          </p>
        </div>
      </section>

      <section className="module-section">
        <div className="dashboard-card">
          <h2>Registrar denuncia</h2>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Tipo
              <select
                className="select"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="Infraestrutura">Infraestrutura</option>
                <option value="Violencia">Violencia</option>
                <option value="Saude">Saude</option>
                <option value="Educacao">Educacao</option>
                <option value="Moradia">Moradia</option>
                <option value="Seguranca">Seguranca</option>
                <option value="Outros">Outros</option>
              </select>
            </label>
            <label>
              Descricao
              <textarea
                rows={4}
                placeholder="Descreva o ocorrido com detalhes."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </label>
            <label>
              Localizacao (link ou coordenada)
              <input
                type="text"
                placeholder="Cole o link do WhatsApp ou lat,lng"
                value={locationText}
                onChange={(event) => setLocationText(event.target.value)}
              />
            </label>
            <div className="form-row">
              <label>
                Cidade
                <input
                  type="text"
                  placeholder="Cidade"
                  value={city}
                  onChange={(event) => setCity(event.target.value)}
                />
              </label>
              <label>
                Estado
                <input
                  type="text"
                  placeholder="UF"
                  value={state}
                  onChange={(event) => setState(event.target.value)}
                />
              </label>
            </div>
            <label>
              Foto (opcional)
              <input
                type="file"
                accept="image/*"
                onChange={(event) =>
                  setFile(event.target.files?.[0] ?? null)
                }
              />
            </label>
            {status && (
              <div className={status.type === "success" ? "alert alert-success" : "alert"}>
                {status.message}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar denuncia"}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
