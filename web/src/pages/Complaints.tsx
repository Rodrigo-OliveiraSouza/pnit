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
      setStatus({ type: "error", message: "Descreva a denúncia." });
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
        message: "Denúncia registrada. Obrigado por contribuir.",
      });
      setDescription("");
      setLocationText("");
      setCity("");
      setState("");
      setFile(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Falha ao enviar denúncia.";
      setStatus({ type: "error", message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page">
      <section className="public-hero">
        <div>
          <span className="eyebrow">Canal de denúncias</span>
          <h1>Envie um relato público com segurança</h1>
          <p className="lead">
            Este canal é aberto para qualquer pessoa. Dados sensíveis ficam
            protegidos.
          </p>
        </div>
      </section>

      <section className="module-section complaints-layout">
        <div className="dashboard-card complaints-form-card">
          <h2>Registrar denúncia</h2>
          <form className="form" onSubmit={handleSubmit}>
            <label>
              Tipo
              <select
                className="select"
                value={type}
                onChange={(event) => setType(event.target.value)}
              >
                <option value="Infraestrutura">Infraestrutura</option>
                <option value="Violencia">Violência</option>
                <option value="Saude">Saúde</option>
                <option value="Educacao">Educação</option>
                <option value="Moradia">Moradia</option>
                <option value="Seguranca">Segurança</option>
                <option value="Outros">Outros</option>
              </select>
            </label>
            <label>
              Descrição
              <textarea
                rows={4}
                placeholder="Descreva o ocorrido com detalhes."
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                required
              />
            </label>
            <label>
              Localização (link ou coordenada)
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
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
              />
            </label>
            {status && (
              <div className={status.type === "success" ? "alert alert-success" : "alert"}>
                {status.message}
              </div>
            )}
            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? "Enviando..." : "Enviar denúncia"}
            </button>
          </form>
        </div>

        <div className="dashboard-card complaints-support-card">
          <h2>Canais oficiais para denúncia e orientação</h2>
          <p className="muted complaints-support-intro">
            Se você precisar de ajuda imediata, use os telefones destacados abaixo.
            Para orientação, acompanhe também os canais oficiais.
          </p>

          <article className="complaints-support-group">
            <h3>Racismo e LGBTfobia - Denúncia / orientação (Disque 100)</h3>
            <p>
              <strong>Responsável:</strong> Ouvidoria Nacional dos Direitos Humanos /
              Ministério dos Direitos Humanos e da Cidadania.
            </p>
            <p className="complaints-hotline">
              <strong>Telefone (24h):</strong>
              <span className="complaints-hotline-number">Disque 100</span>
            </p>
            <ul className="complaints-support-list">
              <li>
                <a
                  className="complaints-support-link"
                  href="https://api.whatsapp.com/send?phone=5561996110100"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp: +55 (61) 99611-0100
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.gov.br/pt-br/servicos/denunciar-violacao-de-direitos-humanos"
                  target="_blank"
                  rel="noreferrer"
                >
                  Site (serviço oficial): denunciar violação de direitos humanos
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.gov.br/mdh/pt-br/ondh"
                  target="_blank"
                  rel="noreferrer"
                >
                  Site/portal ONDH (informações e acesso)
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://atendelibras.mdh.gov.br/acesso"
                  target="_blank"
                  rel="noreferrer"
                >
                  Atendimento em Libras (vídeo)
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="mailto:ouvidoria@mdh.gov.br"
                >
                  E-mail: ouvidoria@mdh.gov.br
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://t.me/Direitoshumanosbrasilbot"
                  target="_blank"
                  rel="noreferrer"
                >
                  Telegram (bot/canal)
                </a>
              </li>
            </ul>
            <p>
              App: "Sabe - Conhecer, Aprender e Proteger" (para acesso, apoio e
              denúncias).
            </p>
            <ul className="complaints-support-list">
              <li>
                <a
                  className="complaints-support-link"
                  href="https://play.google.com/store/search?q=Sabe%20Conhecer%20Aprender%20e%20Proteger&c=apps"
                  target="_blank"
                  rel="noreferrer"
                >
                  Busca Play Store
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://apps.apple.com/br/search?term=Sabe%20Conhecer%20Aprender%20e%20Proteger"
                  target="_blank"
                  rel="noreferrer"
                >
                  Busca App Store
                </a>
              </li>
            </ul>
            <p>
              <strong>Redes sociais</strong> (não é o canal mais rápido para denúncia,
              mas serve para informações):
            </p>
            <ul className="complaints-support-list">
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.instagram.com/mdhcbrasil/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Instagram (MDHC)
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.facebook.com/mindireitoshumanos/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Facebook (MDHC)
                </a>
              </li>
            </ul>
          </article>

          <article className="complaints-support-group">
            <h3>
              Racismo - Contato institucional e políticas públicas (Ministério da
              Igualdade Racial)
            </h3>
            <p>
              <strong>Responsável:</strong> Ministério da Igualdade Racial.
            </p>
            <ul className="complaints-support-list">
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.gov.br/igualdaderacial/pt-br"
                  target="_blank"
                  rel="noreferrer"
                >
                  Site oficial
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.gov.br/igualdaderacial/pt-br/canais_atendimento/fale-conosco"
                  target="_blank"
                  rel="noreferrer"
                >
                  Fale Conosco (e-mails/telefones)
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.instagram.com/ministerioigualdaderacial/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Instagram
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.facebook.com/minigualdaderacial/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Facebook
                </a>
              </li>
            </ul>
          </article>

          <article className="complaints-support-group">
            <h3>Violência contra a mulher (Ligue 180)</h3>
            <p>
              <strong>Responsável:</strong> Ministério das Mulheres.
            </p>
            <p className="complaints-hotline">
              <strong>Telefone (24h):</strong>
              <span className="complaints-hotline-number">180</span>
            </p>
            <ul className="complaints-support-list">
              <li>
                <a
                  className="complaints-support-link"
                  href="https://wa.me/556196100180"
                  target="_blank"
                  rel="noreferrer"
                >
                  WhatsApp: +55 (61) 9610-0180
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="mailto:central180@mulheres.gov.br"
                >
                  E-mail: central180@mulheres.gov.br
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.gov.br/pt-br/servicos/denunciar-e-buscar-ajuda-a-vitimas-de-violencia-contra-mulheres"
                  target="_blank"
                  rel="noreferrer"
                >
                  Serviço no gov.br (oficial)
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.gov.br/mulheres/pt-br/ligue180"
                  target="_blank"
                  rel="noreferrer"
                >
                  Página oficial do Ligue 180
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.gov.br/mulheres/pt-br/ligue180/libras"
                  target="_blank"
                  rel="noreferrer"
                >
                  Atendimento em Libras
                </a>
              </li>
              <li>
                <a
                  className="complaints-support-link"
                  href="https://www.facebook.com/min.dasmulheres/"
                  target="_blank"
                  rel="noreferrer"
                >
                  Facebook (Ministério das Mulheres)
                </a>
              </li>
            </ul>
          </article>

          <article className="complaints-support-group complaints-emergency-group">
            <h3>Se for situação de perigo imediato</h3>
            <p className="complaints-hotline">
              <strong>Polícia Militar (emergência):</strong>
              <span className="complaints-hotline-number">190</span>
            </p>
          </article>
        </div>
      </section>
    </div>
  );
}
