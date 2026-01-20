import { Link } from "react-router-dom";

export default function Modules() {
  return (
    <div className="page">
      <section className="module-hero">
        <div>
          <span className="eyebrow">Modulos operacionais</span>
          <h1>Registro completo de territorio, redes e formacao</h1>
          <p className="lead">
            Use os modulos abaixo para registrar informacoes territoriais,
            acompanhar acoes e gerar evidencias para o painel publico.
          </p>
        </div>
        <div className="hero-actions">
          <Link className="btn btn-outline" to="/painel">
            Voltar ao painel
          </Link>
          <Link className="btn btn-primary" to="/">
            Ver painel publico
          </Link>
        </div>
      </section>

      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Modulo 1</span>
          <h2>Cadastro e perfil do agente</h2>
          <p>
            Dados de identificacao territorial, trajetoria social e redes
            comunitarias.
          </p>
        </div>
        <form className="module-grid">
          <label>
            Dados de identificacao territorial
            <input type="text" placeholder="Territorio, bairro, zona" />
          </label>
          <label>
            Trajetoria social e comunitaria
            <textarea placeholder="Resumo da trajetoria" rows={4} />
          </label>
          <label>
            Formacao e areas de atuacao
            <input type="text" placeholder="Formacao, temas, areas" />
          </label>
          <label>
            Redes e coletivos vinculados
            <textarea placeholder="Redes, coletivos, articulacoes" rows={4} />
          </label>
          <div className="module-actions">
            <button className="btn btn-primary" type="button">
              Salvar modulo
            </button>
            <button className="btn btn-outline" type="button">
              Salvar rascunho
            </button>
          </div>
        </form>
      </section>

      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Modulo 2</span>
          <h2>(Re)Conhecimento do territorio</h2>
          <p>
            Registre condicoes de vida, narrativas territoriais e manifestacoes
            culturais.
          </p>
        </div>
        <form className="module-grid">
          <label>
            Georreferenciamento do territorio
            <input type="text" placeholder="Descricao das fronteiras" />
          </label>
          <label>
            Condicoes de vida (saude, educacao, renda, moradia)
            <textarea placeholder="Registro das condicoes" rows={4} />
          </label>
          <label>
            Identificacao de expressoes do racismo
            <textarea placeholder="Relatos e observacoes" rows={4} />
          </label>
          <label>
            Narrativas territoriais, memorias e conflitos
            <textarea placeholder="Narrativas e conflitos" rows={4} />
          </label>
          <label>
            Manifestacoes culturais do territorio
            <textarea placeholder="Festas, ritos, iniciativas" rows={4} />
          </label>
          <div className="module-actions">
            <button className="btn btn-primary" type="button">
              Salvar modulo
            </button>
            <button className="btn btn-outline" type="button">
              Salvar rascunho
            </button>
          </div>
        </form>
      </section>

      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Modulo 3</span>
          <h2>Mapeamento de redes e instituicoes</h2>
          <p>
            Registre quilombos, terreiros, organizacoes e servicos publicos.
          </p>
        </div>
        <form className="module-grid">
          <label>
            Quilombos
            <textarea placeholder="Nome, localizacao, contato" rows={3} />
          </label>
          <label>
            Terreiros e comunidades tradicionais
            <textarea placeholder="Nome, liderancas, endereco" rows={3} />
          </label>
          <label>
            Organizacoes do movimento negro
            <textarea placeholder="Organizacoes e frentes" rows={3} />
          </label>
          <label>
            Conselhos de promocao da igualdade racial
            <textarea placeholder="Conselhos e articulacoes" rows={3} />
          </label>
          <label>
            Orgaos governamentais e servicos publicos
            <textarea placeholder="Unidades e servicos" rows={3} />
          </label>
          <div className="module-actions">
            <button className="btn btn-primary" type="button">
              Salvar modulo
            </button>
            <button className="btn btn-outline" type="button">
              Salvar rascunho
            </button>
          </div>
        </form>
      </section>

      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Modulo 4</span>
          <h2>Planejamento e acao territorial</h2>
          <p>Elabore planos, registre acoes e acompanhe resultados.</p>
        </div>
        <form className="module-grid">
          <label>
            Plano de acao participativo
            <textarea placeholder="Etapas, metas, responsaveis" rows={4} />
          </label>
          <label>
            Registro de acoes realizadas
            <textarea placeholder="Acoes, datas, impactos" rows={4} />
          </label>
          <label>
            Acompanhamento processual e qualitativo
            <textarea placeholder="Indicadores e relatos" rows={4} />
          </label>
          <div className="module-actions">
            <button className="btn btn-primary" type="button">
              Salvar modulo
            </button>
            <button className="btn btn-outline" type="button">
              Salvar rascunho
            </button>
          </div>
        </form>
      </section>

      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Modulo 5</span>
          <h2>Denuncias de racismo e violacoes de direitos</h2>
          <p>Canal protegido, com possibilidade de anonimato.</p>
        </div>
        <form className="module-grid">
          <label>
            Canal protegido
            <input type="text" placeholder="Descricao do canal" />
          </label>
          <label>
            Possibilidade de anonimato
            <select className="select">
              <option>Sim</option>
              <option>Nao</option>
            </select>
          </label>
          <label>
            Classificacao do tipo de violacao
            <input type="text" placeholder="Tipo de violacao" />
          </label>
          <label>
            Encaminhamentos e acompanhamento do caso
            <textarea placeholder="Descricao do encaminhamento" rows={4} />
          </label>
          <div className="module-actions">
            <button className="btn btn-primary" type="button">
              Salvar modulo
            </button>
            <button className="btn btn-outline" type="button">
              Salvar rascunho
            </button>
          </div>
        </form>
      </section>

      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Modulo 6</span>
          <h2>Formacao continuada</h2>
          <p>Registre trilhas, atividades e diario reflexivo.</p>
        </div>
        <form className="module-grid">
          <label>
            Registro de atividades formativas
            <textarea placeholder="Atividades, datas" rows={3} />
          </label>
          <label>
            Trilhas de formacao
            <textarea placeholder="Trilhas e metas" rows={3} />
          </label>
          <label>
            Diario reflexivo do agente
            <textarea placeholder="Reflexoes e aprendizados" rows={4} />
          </label>
          <label>
            Biblioteca digital
            <input type="text" placeholder="Links, documentos, referencias" />
          </label>
          <div className="module-actions">
            <button className="btn btn-primary" type="button">
              Salvar modulo
            </button>
            <button className="btn btn-outline" type="button">
              Salvar rascunho
            </button>
          </div>
        </form>
      </section>

      <section className="module-section">
        <div className="module-header">
          <span className="eyebrow">Modulo 7</span>
          <h2>Painel publico da igualdade racial</h2>
          <p>
            Configure o painel publico com mapas interativos, indicadores e
            comunicacao acessivel.
          </p>
        </div>
        <form className="module-grid">
          <label>
            Mapas interativos
            <textarea placeholder="Camadas, filtros, atualizacao" rows={3} />
          </label>
          <label>
            Indicadores agregados
            <textarea placeholder="Indicadores e fontes" rows={3} />
          </label>
          <label>
            Dados territoriais consolidados
            <textarea placeholder="Series historicas" rows={3} />
          </label>
          <label>
            Comunicacao em linguagem acessivel
            <textarea placeholder="Diretrizes e linguagem" rows={3} />
          </label>
          <div className="module-actions">
            <button className="btn btn-primary" type="button">
              Salvar modulo
            </button>
            <button className="btn btn-outline" type="button">
              Salvar rascunho
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
