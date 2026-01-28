export type SiteCopy = {
  header: {
    brandSub: string;
    navMap: string;
    navAccessCode: string;
    navReports: string;
    navImages: string;
    navComplaints: string;
    panelLabel: string;
    loginButton: string;
    logoutButton: string;
  };
  login: {
    eyebrow: string;
    title: string;
    description: string;
    buttonLabel: string;
    createAccountLabel: string;
  };
  footer: {
    description: string;
    transparencyTitle: string;
    transparencyItems: string[];
    contactTitle: string;
    contactItems: string[];
    version: string;
  };
};

export const DEFAULT_SITE_COPY: SiteCopy = {
  header: {
    brandSub: "Mapa público de residentes",
    navMap: "Mapa",
    navAccessCode: "Cadastro com código",
    navReports: "Relatórios",
    navImages: "Imagens",
    navComplaints: "Denúncias",
    panelLabel: "Painel",
    loginButton: "Entrar",
    logoutButton: "Sair",
  },
  login: {
    eyebrow: "Acesso restrito",
    title: "Entrar no painel",
    description:
      "Credenciais de funcionário garantem acesso completo a cadastro, edição, associações e auditoria.",
    buttonLabel: "Entrar",
    createAccountLabel: "Criar conta",
  },
  footer: {
    description: "Plataforma nacional para visibilidade e gestão de pontos de residentes.",
    transparencyTitle: "Transparência",
    transparencyItems: [
      "Dados públicos limitados e anonimizados",
      "Política de privacidade e segurança",
      "Atualização contínua via auditoria",
    ],
    contactTitle: "Contato",
    contactItems: ["Canal institucional de suporte", "Ouvidoria", "Centro de ajuda"],
    version: "Versão MVP",
  },
};
