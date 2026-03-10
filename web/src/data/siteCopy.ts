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
    brandSub: "",
    navMap: "Mapa",
    navAccessCode: "Cadastro com c\u00f3digo",
    navReports: "Relat\u00f3rios",
    navImages: "Imagens",
    navComplaints: "Den\u00fancias",
    panelLabel: "Painel",
    loginButton: "Entrar",
    logoutButton: "Sair",
  },
  login: {
    eyebrow: "Acesso restrito",
    title: "Entrar no painel",
    description:
      "Credenciais de agente garantem acesso completo a cadastro, edi\u00e7\u00e3o, associa\u00e7\u00f5es e auditoria.",
    buttonLabel: "Entrar",
    createAccountLabel: "Criar conta",
  },
  footer: {
    description: "Plataforma nacional para visibilidade e gest\u00e3o de pontos de residentes.",
    transparencyTitle: "Transpar\u00eancia",
    transparencyItems: [
      "Dados p\u00fablicos limitados e anonimizados",
      "Pol\u00edtica de privacidade e seguran\u00e7a",
      "Atualiza\u00e7\u00e3o cont\u00ednua via auditoria",
    ],
    contactTitle: "Contato",
    contactItems: ["Canal institucional de suporte", "Ouvidoria", "Centro de ajuda"],
    version: "",
  },
};
