import { Fragment, useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import { Link } from "react-router-dom";
import { formatStatus } from "../utils/format";
import type { AuditEntry } from "../types/models";
import {
  fetchAuditEntries,
  fetchAdminUserDetails,
  fetchProductivity,
  fetchUserSummary,
  fetchUserSummaryPdf,
  activateTheme,
  createTheme,
  deleteTheme,
  getAuthRole,
  getAuthUserId,
  listThemes,
  listAdminUsers,
  listComplaints,
  listLinkCodes,
  refreshPublicMapCache,
  resetTheme,
  updateAdminUser,
  updateComplaintStatus,
  updateTheme,
  createLinkCode,
  revokeLinkCode,
  type AdminUser,
  type Complaint,
  type LinkCode,
  type ProductivityResponse,
} from "../services/api";
import type {
  ThemeColors,
  ThemeImageStyles,
  ThemePalette,
  ThemeTypography,
} from "../types/theme";
import {
  applyThemeToRoot,
  resolveThemeColors,
  resolveThemeImageStyles,
  resolveThemeTypography,
  DEFAULT_THEME_COLORS,
  DEFAULT_THEME_IMAGE_STYLES,
  DEFAULT_THEME_TYPOGRAPHY,
} from "../utils/theme";
import type { SiteCopy } from "../data/siteCopy";
import { useSiteCopy } from "../providers/SiteCopyProvider";

export function AdminPanel() {
  const role = getAuthRole();
  const isAdmin = role === "admin";
  const isManager = role === "manager";
  const isTeacher = role === "teacher";
  const isSupervisor = isAdmin || isManager || isTeacher;
  const [activeTab, setActiveTab] = useState<
    | "requests"
    | "users"
    | "complaints"
    | "productivity"
    | "management"
    | "settings"
    | "audit"
    | "theme"
  >("requests");
  const [pendingUsers, setPendingUsers] = useState<AdminUser[]>([]);
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [openComplaintId, setOpenComplaintId] = useState<string | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [productivity, setProductivity] = useState<ProductivityResponse | null>(
    null
  );
  const [loading, setLoading] = useState(false);
  const [complaintLoading, setComplaintLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [productivityLoading, setProductivityLoading] = useState(false);
  const [productivityDetailsId, setProductivityDetailsId] = useState<string | null>(
    null
  );
  const [productivityDetails, setProductivityDetails] = useState<
    Record<string, Awaited<ReturnType<typeof fetchUserSummary>>>
  >({});
  const [productivityDetailsLoadingId, setProductivityDetailsLoadingId] = useState<
    string | null
  >(null);
  const [productivityDetailsError, setProductivityDetailsError] = useState<
    string | null
  >(null);
  const [productivityDownloadId, setProductivityDownloadId] = useState<string | null>(
    null
  );
  const [managedUserId, setManagedUserId] = useState<string | null>(null);
  const [managedUserDetails, setManagedUserDetails] = useState<
    Record<string, Awaited<ReturnType<typeof fetchAdminUserDetails>>>
  >({});
  const [managedUserLoadingId, setManagedUserLoadingId] = useState<string | null>(
    null
  );
  const [managedUserError, setManagedUserError] = useState<string | null>(null);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [refreshFeedback, setRefreshFeedback] = useState<string | null>(null);
  const [linkCodes, setLinkCodes] = useState<LinkCode[]>([]);
  const [linkCodesLoading, setLinkCodesLoading] = useState(false);
  const [linkCodesError, setLinkCodesError] = useState<string | null>(null);
  const [linkCodeCreating, setLinkCodeCreating] = useState(false);
  const [linkCodeRevokingId, setLinkCodeRevokingId] = useState<string | null>(null);
  const [auditView, setAuditView] = useState<"recent" | "history">("recent");
  const [auditPage, setAuditPage] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [themes, setThemes] = useState<ThemePalette[]>([]);
  const [activeThemeId, setActiveThemeId] = useState<string | null>(null);
  const [themeLoading, setThemeLoading] = useState(false);
  const [themeError, setThemeError] = useState<string | null>(null);
  const [themeSaving, setThemeSaving] = useState(false);
  const [themeDeletingId, setThemeDeletingId] = useState<string | null>(null);
  const [themeActivatingId, setThemeActivatingId] = useState<string | null>(null);
  const [themeResetting, setThemeResetting] = useState(false);
  const [themeFeedback, setThemeFeedback] = useState<string | null>(null);
  const [themeDraft, setThemeDraft] = useState<{
    id: string | null;
    name: string;
    colors: ThemeColors;
    image_styles: ThemeImageStyles;
    typography: ThemeTypography;
  } | null>(null);
  const [themeSnapshot, setThemeSnapshot] = useState<{
    id: string | null;
    name: string;
    colors: ThemeColors;
    image_styles: ThemeImageStyles;
    typography: ThemeTypography;
  } | null>(null);
  const {
    copy,
    updateHeaderCopy,
    updateLoginCopy,
    updateFooterCopy,
    resetSiteCopy,
  } = useSiteCopy();
  const [textDraft, setTextDraft] = useState<SiteCopy>(copy);
  const [textSaving, setTextSaving] = useState(false);
  const [textFeedback, setTextFeedback] = useState<string | null>(null);

  const toThemeDraft = (theme?: ThemePalette | null) => ({
    id: theme?.id ?? null,
    name: theme?.name ?? "Nova paleta",
    colors: resolveThemeColors(theme?.colors ?? DEFAULT_THEME_COLORS),
    image_styles: resolveThemeImageStyles(
      theme?.image_styles ?? DEFAULT_THEME_IMAGE_STYLES
    ),
    typography: resolveThemeTypography(
      theme?.typography ?? DEFAULT_THEME_TYPOGRAPHY
    ),
  });

  const loadUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pending, all] = await Promise.all([
        listAdminUsers({ status: "pending" }),
        listAdminUsers(),
      ]);
      setPendingUsers(pending.items);
      setAllUsers(all.items);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar usuários.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const loadLinkCodes = async () => {
    if (!isSupervisor) return;
    setLinkCodesLoading(true);
    setLinkCodesError(null);
    try {
      const response = await listLinkCodes();
      setLinkCodes(response.items);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar códigos.";
      setLinkCodesError(message);
      setLinkCodes([]);
    } finally {
      setLinkCodesLoading(false);
    }
  };

  const loadThemes = async () => {
    if (!isAdmin) return;
    setThemeLoading(true);
    setThemeError(null);
    try {
      const response = await listThemes();
      setThemes(response.items);
      setActiveThemeId(response.active_theme_id ?? null);
      if (response.items.length > 0) {
        const current =
          response.items.find(
            (item) => item.id === (themeDraft?.id ?? response.active_theme_id)
          ) ?? response.items[0];
        const draft = toThemeDraft(current);
        setThemeDraft(draft);
        setThemeSnapshot(draft);
      } else {
        const draft = toThemeDraft(null);
        setThemeDraft(draft);
        setThemeSnapshot(draft);
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar paletas.";
      setThemeError(message);
    } finally {
      setThemeLoading(false);
    }
  };

  useEffect(() => {
    if (!isSupervisor) return;
    void loadUsers();
    void loadLinkCodes();
    if (isAdmin) {
      void loadComplaints();
      void loadThemes();
    }
    void loadAudit();
    void loadProductivity();
  }, [isSupervisor, isAdmin]);

  useEffect(() => {
    if (!isAdmin && (activeTab === "complaints" || activeTab === "settings")) {
      setActiveTab("requests");
      return;
    }
    if (!isSupervisor && activeTab === "management") {
      setActiveTab("requests");
    }
    if (!isAdmin && activeTab === "theme") {
      setActiveTab("requests");
    }
  }, [activeTab, isAdmin, isSupervisor]);

  useEffect(() => {
    setTextDraft(copy);
  }, [copy]);

  useEffect(() => {
    if (!themeDraft) return;
    applyThemeToRoot(
      themeDraft.colors,
      themeDraft.image_styles,
      themeDraft.typography
    );
  }, [themeDraft]);

  const handleApprove = async (id: string) => {
    await updateAdminUser(id, { status: "active" });
    await loadUsers();
  };

  const handleDisable = async (id: string) => {
    await updateAdminUser(id, { status: "disabled" });
    await loadUsers();
  };

  const handleEnable = async (id: string) => {
    await updateAdminUser(id, { status: "active" });
    await loadUsers();
  };

  const handleCreateLinkCode = async () => {
    if (!isSupervisor) return;
    setLinkCodeCreating(true);
    setLinkCodesError(null);
    try {
      await createLinkCode();
      await loadLinkCodes();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao gerar código.";
      setLinkCodesError(message);
    } finally {
      setLinkCodeCreating(false);
    }
  };

  const handleRevokeLinkCode = async (id: string) => {
    if (!isSupervisor) return;
    setLinkCodeRevokingId(id);
    setLinkCodesError(null);
    try {
      await revokeLinkCode(id);
      await loadLinkCodes();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao revogar código.";
      setLinkCodesError(message);
    } finally {
      setLinkCodeRevokingId(null);
    }
  };

  const handleSelectTheme = (theme: ThemePalette) => {
    const draft = toThemeDraft(theme);
    setThemeDraft(draft);
    setThemeSnapshot(draft);
    setThemeFeedback(null);
  };

  const handleNewTheme = () => {
    const draft = toThemeDraft(null);
    setThemeDraft(draft);
    setThemeSnapshot(draft);
    setThemeFeedback("Nova paleta iniciada. Edite e salve para criar.");
  };

  const handleHeaderTextChange =
    (field: keyof SiteCopy["header"]) => (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setTextDraft((current) => ({
        ...current,
        header: { ...current.header, [field]: value },
      }));
    };

  const handleLoginTextChange =
    (field: keyof SiteCopy["login"]) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = event.target.value;
      setTextDraft((current) => ({
        ...current,
        login: { ...current.login, [field]: value },
      }));
    };

  const handleFooterTextChange =
    (
      field: Exclude<keyof SiteCopy["footer"], "transparencyItems" | "contactItems">
    ) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setTextDraft((current) => ({
        ...current,
        footer: { ...current.footer, [field]: value },
      }));
    };

  const handleFooterListChange =
    (list: "transparencyItems" | "contactItems", index: number) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setTextDraft((current) => {
        const updatedList = [...current.footer[list]];
        updatedList[index] = value;
        return {
          ...current,
          footer: {
            ...current.footer,
            [list]: updatedList,
          },
        };
      });
    };

  const handleTextSave = () => {
    setTextSaving(true);
    try {
      updateHeaderCopy(textDraft.header);
      updateLoginCopy(textDraft.login);
      updateFooterCopy(textDraft.footer);
      setTextFeedback("Textos atualizados.");
    } catch {
      setTextFeedback("Não foi possível atualizar os textos.");
    } finally {
      setTextSaving(false);
    }
  };

  const handleTextReset = () => {
    resetSiteCopy();
    setTextFeedback("Textos restaurados para o padrão.");
  };

  const updateThemeDraft = (
    partial: Partial<{
      name: string;
      colors: Partial<ThemeColors>;
      image_styles: Partial<ThemeImageStyles>;
      typography: Partial<ThemeTypography>;
    }>
  ) => {
    setThemeDraft((current) => {
      if (!current) return current;
      return {
        ...current,
        ...partial,
        colors: partial.colors ? { ...current.colors, ...partial.colors } : current.colors,
        image_styles: partial.image_styles
          ? { ...current.image_styles, ...partial.image_styles }
          : current.image_styles,
        typography: partial.typography
          ? { ...current.typography, ...partial.typography }
          : current.typography,
      };
    });
  };

  const handleThemeColorChange =
    (key: keyof ThemeColors) => (event: ChangeEvent<HTMLInputElement>) => {
      updateThemeDraft({ colors: { [key]: event.target.value } });
    };

  const handleThemeImageChange =
    (key: keyof ThemeImageStyles) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      const parsed =
        event.target.type === "number" || event.target.type === "range"
          ? Number(value)
          : value;
      if (
        (event.target.type === "number" || event.target.type === "range") &&
        Number.isNaN(parsed as number)
      ) {
        return;
      }
      updateThemeDraft({
        image_styles: {
          [key]: parsed as ThemeImageStyles[keyof ThemeImageStyles],
        },
      });
    };

  const handleThemeTypographyChange =
    (key: keyof ThemeTypography) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      updateThemeDraft({
        typography: { [key]: event.target.value } as Partial<ThemeTypography>,
      });
    };

  const handleUndoTheme = () => {
    if (!themeSnapshot) return;
    setThemeDraft(themeSnapshot);
    setThemeFeedback("Alterações desfeitas.");
  };

  const handleSaveTheme = async () => {
    if (!isAdmin || !themeDraft) return;
    setThemeSaving(true);
    setThemeFeedback(null);
    try {
      if (themeDraft.id) {
        await updateTheme(themeDraft.id, {
          name: themeDraft.name,
          colors: themeDraft.colors,
          image_styles: themeDraft.image_styles,
          typography: themeDraft.typography,
        });
        setThemeFeedback("Paleta atualizada.");
      } else {
        const response = await createTheme({
          name: themeDraft.name,
          colors: themeDraft.colors,
          image_styles: themeDraft.image_styles,
          typography: themeDraft.typography,
        });
        setThemeFeedback("Paleta criada.");
        const created = toThemeDraft(response.item);
        setThemeDraft(created);
        setThemeSnapshot(created);
      }
      await loadThemes();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao salvar paleta.";
      setThemeError(message);
    } finally {
      setThemeSaving(false);
    }
  };

  const handleSaveThemeVersion = async () => {
    if (!isAdmin || !themeDraft) return;
    setThemeSaving(true);
    setThemeFeedback(null);
    try {
      const response = await createTheme({
        name: themeDraft.name || "Nova versão",
        colors: themeDraft.colors,
        image_styles: themeDraft.image_styles,
        typography: themeDraft.typography,
      });
      setThemeFeedback("Nova versão criada.");
      const created = toThemeDraft(response.item);
      setThemeDraft(created);
      setThemeSnapshot(created);
      await loadThemes();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao criar nova versão.";
      setThemeError(message);
    } finally {
      setThemeSaving(false);
    }
  };

  const handleActivateTheme = async () => {
    if (!isAdmin || !themeDraft?.id) return;
    setThemeActivatingId(themeDraft.id);
    setThemeFeedback(null);
    try {
      await activateTheme(themeDraft.id);
      setActiveThemeId(themeDraft.id);
      setThemeFeedback("Paleta ativada.");
      await loadThemes();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao ativar paleta.";
      setThemeError(message);
    } finally {
      setThemeActivatingId(null);
    }
  };

  const handleDeleteTheme = async (id: string) => {
    if (!isAdmin) return;
    if (!window.confirm("Remover esta paleta?")) return;
    setThemeDeletingId(id);
    setThemeFeedback(null);
    try {
      await deleteTheme(id);
      setThemeFeedback("Paleta removida.");
      await loadThemes();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao remover paleta.";
      setThemeError(message);
    } finally {
      setThemeDeletingId(null);
    }
  };

  const handleResetTheme = async () => {
    if (!isAdmin) return;
    setThemeResetting(true);
    setThemeFeedback(null);
    try {
      await resetTheme();
      setThemeFeedback("Tema padrão restaurado.");
      await loadThemes();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao restaurar tema.";
      setThemeError(message);
    } finally {
      setThemeResetting(false);
    }
  };

  const loadComplaints = async () => {
    setComplaintLoading(true);
    try {
      const response = await listComplaints();
      setComplaints(response.items);
    } catch {
      setComplaints([]);
    } finally {
      setComplaintLoading(false);
    }
  };

  const handleComplaintStatus = async (
    id: string,
    status: "new" | "reviewing" | "closed"
  ) => {
    await updateComplaintStatus(id, status);
    await loadComplaints();
  };

  const handleToggleComplaint = (id: string) => {
    setOpenComplaintId((current) => (current === id ? null : id));
  };

  const safeFileName = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "");

  const handleToggleProductivity = async (userId: string) => {
    if (productivityDetailsId === userId) {
      setProductivityDetailsId(null);
      return;
    }
    setProductivityDetailsId(userId);
    if (productivityDetails[userId]) {
      return;
    }
    setProductivityDetailsLoadingId(userId);
    setProductivityDetailsError(null);
    try {
      const summary = await fetchUserSummary(userId);
      setProductivityDetails((current) => ({ ...current, [userId]: summary }));
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Falha ao carregar relatório individual.";
      setProductivityDetailsError(message);
    } finally {
      setProductivityDetailsLoadingId(null);
    }
  };

  const handleDownloadUserReport = async (userId: string, label?: string | null) => {
    setProductivityDownloadId(userId);
    setProductivityDetailsError(null);
    try {
      const response = await fetchUserSummaryPdf(userId);
      const contentType = response.content_type ?? "application/pdf";
      const fallback = `usuario-${userId}`;
      const baseName = safeFileName(label ?? "") || fallback;
      const filename = response.filename ?? `${baseName}-relatorio.pdf`;
      if (response.content_base64) {
        const binary = window.atob(response.content_base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) {
          bytes[i] = binary.charCodeAt(i);
        }
        const blob = new Blob([bytes], { type: contentType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        return;
      }
      throw new Error("PDF indisponível.");
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Falha ao baixar relatório individual.";
      setProductivityDetailsError(message);
    } finally {
      setProductivityDownloadId(null);
    }
  };

  const handleToggleManagedUser = async (userId: string) => {
    if (managedUserId === userId) {
      setManagedUserId(null);
      return;
    }
    setManagedUserId(userId);
    if (managedUserDetails[userId]) {
      return;
    }
    setManagedUserLoadingId(userId);
    setManagedUserError(null);
    try {
      const detail = await fetchAdminUserDetails(userId);
      setManagedUserDetails((current) => ({ ...current, [userId]: detail }));
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao carregar usuário.";
      setManagedUserError(message);
    } finally {
      setManagedUserLoadingId(null);
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const actorUserId = getAuthUserId();
      const response = await fetchAuditEntries({
        limit: 100,
        actor_user_id: actorUserId ?? undefined,
      });
      const mapped = response.items.map((entry) => ({
        id: String(entry.id ?? ""),
        actor_user_id: String(entry.actor_user_id ?? ""),
        action: String(entry.action ?? ""),
        entity_type: String(entry.entity_type ?? ""),
        entity_id: String(entry.entity_id ?? ""),
        created_at: String(entry.created_at ?? ""),
      }));
      setAuditEntries(mapped);
      setAuditPage(0);
      setAuditView("recent");
    } catch {
      setAuditEntries([]);
    } finally {
      setAuditLoading(false);
    }
  };

  const loadProductivity = async () => {
    setProductivityLoading(true);
    try {
      const response = await fetchProductivity({ period: "month" });
      setProductivity(response);
    } catch {
      setProductivity(null);
    } finally {
      setProductivityLoading(false);
    }
  };

  const auditPageSize = 10;
  const auditTotalPages = Math.max(1, Math.ceil(auditEntries.length / auditPageSize));
  const recentAuditEntries = useMemo(
    () => auditEntries.slice(0, auditPageSize),
    [auditEntries]
  );
  const pagedAuditEntries = useMemo(
    () =>
      auditEntries.slice(
        auditPage * auditPageSize,
        auditPage * auditPageSize + auditPageSize
      ),
    [auditEntries, auditPage]
  );

  const handleForceRefresh = async () => {
    setRefreshLoading(true);
    setRefreshFeedback(null);
    try {
      const response = await refreshPublicMapCache(true);
      if (response.skipped) {
        const when = response.last_refresh
          ? new Date(response.last_refresh).toLocaleString()
          : "agora";
        setRefreshFeedback(
          `Atualização já executada nas últimas 24h (última: ${when}).`
        );
      } else {
        const when = response.refreshed_at
          ? new Date(response.refreshed_at).toLocaleString()
          : "agora";
        setRefreshFeedback(`Atualização executada em ${when}.`);
      }
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Falha ao atualizar o mapa público.";
      setRefreshFeedback(message);
    } finally {
      setRefreshLoading(false);
    }
  };

  const roleLabel = isAdmin
    ? "Administrador"
    : isManager
    ? "Gerente"
    : "Professor";

  const formatRoleLabel = (value?: string | null) => {
    switch (value) {
      case "admin":
        return "Administrador";
      case "manager":
        return "Gerente";
      case "teacher":
        return "Professor";
      case "registrar":
        return "Cadastrante";
      default:
        return value ?? "-";
    }
  };

  const formatLinkCodeStatus = (status: LinkCode["status"]) => {
    switch (status) {
      case "active":
        return "Ativo";
      case "used":
        return "Usado";
      case "revoked":
        return "Revogado";
      default:
        return status;
    }
  };

  const isThemeActive = Boolean(themeDraft?.id && themeDraft.id === activeThemeId);

  return (
    <>
      <section className="dashboard-hero">
        <div>
          <span className="eyebrow">{roleLabel}</span>
          <h1>
            {isAdmin
              ? "Gestão de equipes e auditoria"
              : "Aprovação de usuários e relatórios"}
          </h1>
          <p>
            {isAdmin
              ? "Acompanhe acessos, aprove solicitações e garanta a integridade dos dados."
              : "Acompanhe solicitações pendentes, aprove usuários e consulte relatórios."}
          </p>
          {refreshFeedback && <div className="alert">{refreshFeedback}</div>}
        </div>
        {isAdmin && (
          <div className="dashboard-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void handleForceRefresh()}
              disabled={refreshLoading}
            >
              {refreshLoading ? "Atualizando..." : "Atualizar mapa geral"}
            </button>
            <Link className="btn btn-outline" to="/painel?tab=register">
              Cadastro de pessoas
            </Link>
            <Link className="btn btn-outline" to="/painel?tab=people">
              Gerenciar pessoas
            </Link>
            <button className="btn btn-outline" type="button">
              Exportar auditoria
            </button>
          </div>
        )}
      </section>

      <section className="module-section">
        <div className="tabs">
          <button
            className={`tab ${activeTab === "requests" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("requests")}
          >
            Cadastros pendentes
            {pendingUsers.length > 0 ? ` (${pendingUsers.length})` : ""}
          </button>
          <button
            className={`tab ${activeTab === "users" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("users")}
          >
            Cadastros registrados
          </button>
          {isSupervisor && (
            <button
              className={`tab ${activeTab === "management" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("management")}
            >
              Gerenciar usuários
            </button>
          )}
          {isAdmin && (
            <button
              className={`tab ${activeTab === "complaints" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("complaints")}
            >
              Denúncias
            </button>
          )}
          <button
            className={`tab ${activeTab === "productivity" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("productivity")}
          >
            Relatório de usuário
          </button>
          {isAdmin && (
            <button
              className={`tab ${activeTab === "settings" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("settings")}
            >
              Configurações
            </button>
          )}
          {isAdmin && (
            <button
              className={`tab ${activeTab === "theme" ? "active" : ""}`}
              type="button"
              onClick={() => setActiveTab("theme")}
            >
              Perfil admin
            </button>
          )}
          <button
            className={`tab ${activeTab === "audit" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("audit")}
          >
            Minhas ações
          </button>
        </div>
        {error && <div className="alert">{error}</div>}
        {activeTab === "requests" && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Território</th>
                  <th>Status</th>
                  <th>Opções</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : pendingUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        Nenhuma solicitação pendente.
                      </div>
                    </td>
                  </tr>
                ) : (
                  pendingUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.full_name ?? "-"}</td>
                      <td>{user.email}</td>
                      <td>{user.territory ?? "-"}</td>
                      <td>
                        <span className="status pending">
                          {formatStatus("pending")}
                        </span>
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost"
                          type="button"
                          onClick={() => void handleApprove(user.id)}
                        >
                          Aprovar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "users" && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Opções</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : allUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        Nenhum usuário cadastrado ainda.
                      </div>
                    </td>
                  </tr>
                ) : (
                  allUsers.map((user) => (
                    <tr key={user.id}>
                      <td>{user.id}</td>
                      <td>{user.full_name ?? "-"}</td>
                      <td>{user.email}</td>
                      <td>{formatRoleLabel(user.role)}</td>
                      <td>
                        <span className={`status ${user.status}`}>
                          {formatStatus(user.status)}
                        </span>
                      </td>
                      <td>
                        {user.status === "disabled" ? (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => void handleEnable(user.id)}
                          >
                            Ativar
                          </button>
                        ) : user.status === "pending" ? (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => void handleApprove(user.id)}
                          >
                            Aprovar
                          </button>
                        ) : (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={() => void handleDisable(user.id)}
                          >
                            Desativar
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "management" && (
          <div className="table-card">
            {isSupervisor && (
              <div className="card" style={{ marginBottom: "1.2rem" }}>
                <div className="card-header">
                  <div>
                    <span className="eyebrow">Códigos</span>
                    <h2>Código de vinculação</h2>
                    <p>
                      Gere um código para direcionar a aprovação de novos
                      cadastros de usuários ao seu perfil.
                    </p>
                  </div>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void handleCreateLinkCode()}
                    disabled={linkCodeCreating}
                  >
                    {linkCodeCreating ? "Gerando..." : "Gerar código"}
                  </button>
                </div>
                {linkCodesError && <div className="alert">{linkCodesError}</div>}
                <div className="card-body">
                  {linkCodesLoading ? (
                    <div className="empty-state">Carregando códigos...</div>
                  ) : linkCodes.length === 0 ? (
                    <div className="empty-state">
                      Nenhum código de vinculação criado ainda.
                    </div>
                  ) : (
                    <div className="code-list">
                      {linkCodes.map((code) => (
                        <div key={code.id} className="code-item">
                          <div>
                            <strong>{code.code}</strong>
                            <div className="muted">
                              Status: {formatLinkCodeStatus(code.status)}
                            </div>
                            <div className="muted">
                              Criado em{" "}
                              {code.created_at
                                ? new Date(code.created_at).toLocaleString()
                                : "-"}
                            </div>
                            {code.used_at && (
                              <div className="muted">
                                Usado em {new Date(code.used_at).toLocaleString()}
                              </div>
                            )}
                          </div>
                          <div className="code-actions">
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() =>
                                void navigator.clipboard.writeText(code.code)
                              }
                            >
                              Copiar
                            </button>
                            {code.status === "active" && (
                              <button
                                type="button"
                                className="btn btn-ghost"
                                onClick={() => void handleRevokeLinkCode(code.id)}
                                disabled={linkCodeRevokingId === code.id}
                              >
                                {linkCodeRevokingId === code.id
                                  ? "Revogando..."
                                  : "Revogar"}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
            {managedUserError && <div className="alert">{managedUserError}</div>}
            <table>
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Email</th>
                  <th>Perfil</th>
                  <th>Status</th>
                  <th>Cidade/UF</th>
                  <th>Opções</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : allUsers.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <div className="table-empty">
                        Nenhum usuário cadastrado ainda.
                      </div>
                    </td>
                  </tr>
                ) : (
                  allUsers.map((user) => {
                    const isOpen = managedUserId === user.id;
                    const detail = managedUserDetails[user.id];
                    const detailLoading = managedUserLoadingId === user.id;
                    return (
                      <Fragment key={user.id}>
                        <tr>
                          <td>{user.full_name ?? "-"}</td>
                          <td>{user.email}</td>
                          <td>{formatRoleLabel(user.role)}</td>
                          <td>
                            <span className={`status ${user.status}`}>
                              {formatStatus(user.status)}
                            </span>
                          </td>
                          <td>
                            {[user.city, user.state].filter(Boolean).join(" / ") ||
                              "-"}
                          </td>
                          <td>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              onClick={() => void handleToggleManagedUser(user.id)}
                            >
                              {isOpen ? "Fechar" : "Ver cadastros"}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={6}>
                              <div className="table-empty" style={{ textAlign: "left" }}>
                                <strong>Dados do usuário</strong>
                                <div className="summary-grid" style={{ marginTop: "0.8rem" }}>
                                  <div>
                                    <span>Organização</span>
                                    <strong>{detail?.user.organization ?? "-"}</strong>
                                  </div>
                                  <div>
                                    <span>Telefone</span>
                                    <strong>{detail?.user.phone ?? "-"}</strong>
                                  </div>
                                  <div>
                                    <span>Território</span>
                                    <strong>{detail?.user.territory ?? "-"}</strong>
                                  </div>
                                  <div>
                                    <span>Motivo</span>
                                    <strong>{detail?.user.access_reason ?? "-"}</strong>
                                  </div>
                                </div>
                                {detailLoading && (
                                  <p className="muted">Carregando cadastros...</p>
                                )}
                                {detail && detail.residents.length > 0 && (
                                  <div className="table-card" style={{ marginTop: "1rem" }}>
                                    <table>
                                      <thead>
                                        <tr>
                                          <th>Nome</th>
                                          <th>Comunidade</th>
                                          <th>Cidade</th>
                                          <th>Estado</th>
                                          <th>Status</th>
                                          <th>Criado em</th>
                                          <th>Ponto</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {detail.residents.map((resident) => (
                                          <tr key={resident.id}>
                                            <td>{resident.full_name ?? "-"}</td>
                                            <td>{resident.community_name ?? "-"}</td>
                                            <td>{resident.city ?? "-"}</td>
                                            <td>{resident.state ?? "-"}</td>
                                            <td>{resident.status ?? "-"}</td>
                                            <td>
                                              {resident.created_at
                                                ? new Date(resident.created_at).toLocaleDateString()
                                                : "-"}
                                            </td>
                                            <td>
                                              {resident.point_status
                                                ? `${resident.point_status} / ${resident.point_precision ?? "-"}`
                                                : "-"}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                                {detail && detail.residents.length === 0 && (
                                  <p className="muted">Nenhum cadastro encontrado.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "complaints" && (
          <div className="table-card">
            <table>
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Tipo</th>
                  <th>Cidade</th>
                  <th>Estado</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Opções</th>
                </tr>
              </thead>
              <tbody>
                {complaintLoading ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : complaints.length === 0 ? (
                  <tr>
                    <td colSpan={7}>
                      <div className="table-empty">
                        Nenhuma denúncia registrada.
                      </div>
                    </td>
                  </tr>
                ) : (
                  complaints.map((complaint) => {
                    const isOpen = openComplaintId === complaint.id;
                    return (
                      <Fragment key={complaint.id}>
                        <tr>
                          <td>{complaint.id}</td>
                          <td>{complaint.type}</td>
                          <td>{complaint.city ?? "-"}</td>
                          <td>{complaint.state ?? "-"}</td>
                          <td>
                            <span className={`status ${complaint.status}`}>
                              {formatStatus(complaint.status)}
                            </span>
                          </td>
                          <td>
                            {new Date(complaint.created_at).toLocaleDateString()}
                          </td>
                          <td>
                            <select
                              className="select"
                              value={complaint.status}
                              onChange={(event) =>
                                void handleComplaintStatus(
                                  complaint.id,
                                  event.target.value as
                                    | "new"
                                    | "reviewing"
                                    | "closed"
                                )
                              }
                            >
                              <option value="new">Novo</option>
                              <option value="reviewing">Em análise</option>
                              <option value="closed">Encerrado</option>
                            </select>
                            <button
                              className="btn btn-ghost"
                              type="button"
                              onClick={() => handleToggleComplaint(complaint.id)}
                            >
                              {isOpen ? "Fechar denúncia" : "Ver denúncia"}
                            </button>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr>
                            <td colSpan={7}>
                              <div className="table-empty" style={{ textAlign: "left" }}>
                                <strong>Descricao</strong>
                                <p>{complaint.description}</p>
                                {complaint.location_text && (
                                  <p>Local: {complaint.location_text}</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
        {activeTab === "productivity" && (
          <div className="dashboard-card">
            <h3>Relatório de usuários</h3>
            {productivityLoading && <p className="muted">Carregando...</p>}
            {!productivityLoading && !productivity && (
              <p className="muted">Sem dados disponiveis.</p>
            )}
            {productivity && (
              <>
                <div className="summary-grid">
                  <div>
                    <span>Total de cadastros</span>
                    <strong>{productivity.summary.total_residents}</strong>
                  </div>
                  <div>
                    <span>Total de pontos</span>
                    <strong>{productivity.summary.total_points}</strong>
                  </div>
                  <div>
                    <span>Periodo</span>
                    <strong>{productivity.summary.period}</strong>
                  </div>
                </div>
                <div className="table-card">
                  <table>
                    <thead>
                      <tr>
                        <th>Agente</th>
                        <th>Email</th>
                        <th>Cadastros</th>
                        <th>Pontos</th>
                        <th>Média Saúde</th>
                        <th>Média Educação</th>
                        <th>Média Renda</th>
                        <th>Média Moradia</th>
                        <th>Média Segurança</th>
                        <th>Opções</th>
                      </tr>
                    </thead>
                    <tbody>
                      {productivity.by_user.length === 0 ? (
                        <tr>
                          <td colSpan={10}>
                            <div className="table-empty">
                              Nenhuma atividade registrada.
                            </div>
                          </td>
                        </tr>
                      ) : (
                        productivity.by_user.map((item) => {
                          const isOpen = productivityDetailsId === item.user_id;
                          const details = productivityDetails[item.user_id];
                          const detailsLoading =
                            productivityDetailsLoadingId === item.user_id;
                          return (
                            <Fragment key={item.user_id}>
                              <tr>
                                <td>{item.full_name ?? "-"}</td>
                                <td>{item.email ?? "-"}</td>
                                <td>{item.residents}</td>
                                <td>{item.points}</td>
                                <td>{item.health_avg ?? "-"}</td>
                                <td>{item.education_avg ?? "-"}</td>
                                <td>{item.income_avg ?? "-"}</td>
                                <td>{item.housing_avg ?? "-"}</td>
                                <td>{item.security_avg ?? "-"}</td>
                                <td>
                                  <button
                                    className="btn btn-ghost"
                                    type="button"
                                    onClick={() => void handleToggleProductivity(item.user_id)}
                                  >
                                    {isOpen ? "Fechar detalhes" : "Ver detalhes"}
                                  </button>
                                  <button
                                    className="btn btn-outline"
                                    type="button"
                                    onClick={() =>
                                      void handleDownloadUserReport(
                                        item.user_id,
                                        item.full_name ?? item.email ?? undefined
                                      )
                                    }
                                    disabled={productivityDownloadId === item.user_id}
                                  >
                                    {productivityDownloadId === item.user_id
                                      ? "Baixando..."
                                      : "Baixar relatório"}
                                  </button>
                                </td>
                              </tr>
                              {isOpen && (
                                <tr>
                                  <td colSpan={10}>
                                    <div className="table-empty" style={{ textAlign: "left" }}>
                                      <strong>Relatório individual</strong>
                                      {detailsLoading && (
                                        <p className="muted">Carregando detalhes...</p>
                                      )}
                                      {!detailsLoading && productivityDetailsError && (
                                        <div className="alert">
                                          {productivityDetailsError}
                                        </div>
                                      )}
                                      {!detailsLoading && details && (
                                        <>
                                          <div className="summary-grid" style={{ marginTop: "0.8rem" }}>
                                            <div>
                                              <span>Total de cadastros</span>
                                              <strong>
                                                {details.summary?.total_residents ?? 0}
                                              </strong>
                                            </div>
                                            <div>
                                              <span>Renda média (R$)</span>
                                              <strong>
                                                {details.averages?.income_monthly ?? "-"}
                                              </strong>
                                            </div>
                                            <div>
                                              <span>Saúde</span>
                                              <strong>
                                                {details.averages?.health_score ?? "-"}
                                              </strong>
                                            </div>
                                            <div>
                                              <span>Educação</span>
                                              <strong>
                                                {details.averages?.education_score ?? "-"}
                                              </strong>
                                            </div>
                                            <div>
                                              <span>Moradia</span>
                                              <strong>
                                                {details.averages?.housing_score ?? "-"}
                                              </strong>
                                            </div>
                                            <div>
                                              <span>Segurança</span>
                                              <strong>
                                                {details.averages?.security_score ?? "-"}
                                              </strong>
                                            </div>
                                          </div>
                                          {details.monthly && details.monthly.length > 0 && (
                                            <div style={{ marginTop: "0.8rem" }}>
                                              <strong>Cadastros por mes</strong>
                                              <ul className="activity-list">
                                                {details.monthly.slice(0, 6).map((entry) => (
                                                  <li key={`${item.user_id}-${entry.month}`}>
                                                    {entry.month}: {entry.total}
                                                  </li>
                                                ))}
                                              </ul>
                                            </div>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
        )}
        {activeTab === "theme" && (
          <div className="dashboard-card">
            <div className="table-header">
              <div>
                <span className="eyebrow">Design system</span>
                <h3>Perfil admin</h3>
                <p className="muted">
                  Ajuste cores, paletas e estilos globais de imagem com
                  pré-visualização instantânea.
                </p>
              </div>
              <div className="theme-actions">
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={handleNewTheme}
                >
                  Nova paleta
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => void handleResetTheme()}
                  disabled={themeResetting}
                >
                  {themeResetting ? "Resetando..." : "Resetar padrão"}
                </button>
              </div>
            </div>

            {themeError && <div className="alert">{themeError}</div>}
            {themeFeedback && <div className="report-ready">{themeFeedback}</div>}

            <div className="theme-panel">
              <div className="theme-list">
                {themeLoading && <p className="muted">Carregando paletas...</p>}
                {!themeLoading && themes.length === 0 && (
                  <p className="muted">Nenhuma paleta cadastrada.</p>
                )}
                {!themeLoading &&
                  themes.map((theme) => {
                    const resolved = resolveThemeColors(
                      theme.colors ?? DEFAULT_THEME_COLORS
                    );
                    const isActive = theme.id === activeThemeId;
                    const isSelected = themeDraft?.id === theme.id;
                    const previewGradient = `linear-gradient(135deg, ${resolved.primary}, ${resolved.secondary})`;
                    const previewPrimaryBg =
                      resolved.button_primary_bg ?? resolved.primary;
                    const previewPrimaryText =
                      resolved.button_primary_text ?? resolved.text;
                    const previewSecondaryBg =
                      resolved.button_secondary_bg ?? resolved.background;
                    const previewSecondaryText =
                      resolved.button_secondary_text ?? resolved.text;
                    return (
                      <div
                        key={theme.id}
                        className={`theme-card ${isSelected ? "active" : ""}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleSelectTheme(theme)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " " ) {
                            event.preventDefault();
                            handleSelectTheme(theme);
                          }
                        }}
                      >
                        <div className="theme-card-header">
                          <div>
                            <strong>{theme.name}</strong>
                            <span className="muted">
                              {isActive ? "Ativa" : "Disponível"}
                            </span>
                          </div>
                          {isActive && (
                            <span className="theme-card-badge">Ativa</span>
                          )}
                        </div>
                        <div className="theme-card-preview">
                          <div
                            className="theme-card-gradient"
                            style={{ background: previewGradient }}
                          />
                          <div className="theme-card-buttons">
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled
                              style={{
                                background: previewPrimaryBg,
                                color: previewPrimaryText,
                                borderColor: previewPrimaryBg,
                              }}
                            >
                              Primária
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost ghost"
                              disabled
                              style={{
                                background: previewSecondaryBg,
                                color: previewSecondaryText,
                                borderColor: previewSecondaryText,
                              }}
                            >
                              Secundária
                            </button>
                          </div>
                        </div>
                        <div className="theme-swatches theme-card-swatches">
                          {[
                            resolved.primary,
                            resolved.secondary,
                            resolved.accent,
                            resolved.background,
                            resolved.text,
                            resolved.text_muted ?? resolved.text,
                            resolved.heading ?? resolved.text,
                            resolved.border,
                          ].map((color) => (
                            <span
                              key={`${theme.id}-${color}`}
                              className="theme-swatch"
                              style={{ background: color }}
                            />
                          ))}
                        </div>
                        <div className="theme-actions">
                          <button
                            className="btn btn-ghost"
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              setThemeDraft(toThemeDraft(theme));
                              setThemeSnapshot(toThemeDraft(theme));
                            }}
                          >
                            Editar
                          </button>
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={isActive || themeDeletingId === theme.id}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleDeleteTheme(theme.id);
                            }}
                          >
                            {themeDeletingId === theme.id ? "Excluindo..." : "Excluir"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
              <div className="theme-editor">
                {!themeDraft && <p className="muted">Selecione uma paleta.</p>}
                {themeDraft && (
                  <>
                    <div className="theme-editor-grid">
                      <div className="theme-control">
                        <label>Nome da paleta</label>
                        <input
                          value={themeDraft.name}
                          onChange={(event) =>
                            updateThemeDraft({ name: event.target.value })
                          }
                        />
                      </div>
                      <div className="theme-control">
                        <label>Status</label>
                        <input
                          value={isThemeActive ? "Ativa" : "Rascunho"}
                          disabled
                        />
                      </div>
                    </div>

                    <h4>Paleta global</h4>
                    <div className="theme-editor-grid">
                      <div className="theme-control">
                        <label>Primária</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.primary}
                          onChange={handleThemeColorChange("primary")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Secundária</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.secondary}
                          onChange={handleThemeColorChange("secondary")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Destaque</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.accent}
                          onChange={handleThemeColorChange("accent")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Fundo</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.background}
                          onChange={handleThemeColorChange("background")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Texto principal</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.text}
                          onChange={handleThemeColorChange("text")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Texto secundário</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={
                            themeDraft.colors.text_muted ?? themeDraft.colors.text
                          }
                          onChange={handleThemeColorChange("text_muted")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Títulos</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.heading ?? themeDraft.colors.text}
                          onChange={handleThemeColorChange("heading")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Bordas</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.border}
                          onChange={handleThemeColorChange("border")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Header (início)</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.header_start ?? themeDraft.colors.primary}
                          onChange={handleThemeColorChange("header_start")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Header (fim)</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.colors.header_end ?? themeDraft.colors.secondary}
                          onChange={handleThemeColorChange("header_end")}
                        />
                      </div>
                    </div>

                    <h4>Botões</h4>
                    <div className="theme-editor-grid">
                      <div className="theme-control">
                        <label>Primário (fundo)</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={
                            themeDraft.colors.button_primary_bg ??
                            themeDraft.colors.primary
                          }
                          onChange={handleThemeColorChange("button_primary_bg")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Primário (texto)</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={
                            themeDraft.colors.button_primary_text ??
                            themeDraft.colors.text
                          }
                          onChange={handleThemeColorChange("button_primary_text")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Secundário (fundo)</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={
                            themeDraft.colors.button_secondary_bg ??
                            themeDraft.colors.background
                          }
                          onChange={handleThemeColorChange("button_secondary_bg")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Secundário (texto)</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={
                            themeDraft.colors.button_secondary_text ??
                            themeDraft.colors.text
                          }
                          onChange={handleThemeColorChange("button_secondary_text")}
                        />
                      </div>
                    </div>

                    <h4>Tipografia</h4>
                    <div className="theme-editor-grid">
                      <div className="theme-control">
                        <label>Fonte do texto</label>
                        <input
                          value={themeDraft.typography.body ?? ""}
                          onChange={handleThemeTypographyChange("body")}
                          placeholder='Ex: "Source Sans 3", sans-serif'
                        />
                      </div>
                      <div className="theme-control">
                        <label>Fonte dos títulos</label>
                        <input
                          value={themeDraft.typography.heading ?? ""}
                          onChange={handleThemeTypographyChange("heading")}
                          placeholder='Ex: "Newsreader", serif'
                        />
                      </div>
                      <div className="theme-control">
                        <label>Fonte dos botões</label>
                        <input
                          value={themeDraft.typography.button ?? ""}
                          onChange={handleThemeTypographyChange("button")}
                          placeholder='Ex: "Source Sans 3", sans-serif'
                        />
                      </div>
                    </div>

                    <h4>Estilo global das imagens</h4>
                    <div className="theme-editor-grid">
                      <div className="theme-control">
                        <label>Overlay</label>
                        <input
                          className="theme-color"
                          type="color"
                          value={themeDraft.image_styles.overlay ?? "#000000"}
                          onChange={handleThemeImageChange("overlay")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Opacidade</label>
                        <input
                          type="range"
                          min="0"
                          max="0.8"
                          step="0.05"
                          value={themeDraft.image_styles.overlay_opacity ?? 0}
                          onChange={handleThemeImageChange("overlay_opacity")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Saturação</label>
                        <input
                          type="range"
                          min="0.3"
                          max="2"
                          step="0.05"
                          value={themeDraft.image_styles.saturation ?? 1}
                          onChange={handleThemeImageChange("saturation")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Contraste</label>
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.05"
                          value={themeDraft.image_styles.contrast ?? 1}
                          onChange={handleThemeImageChange("contrast")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Brilho</label>
                        <input
                          type="range"
                          min="0.5"
                          max="2"
                          step="0.05"
                          value={themeDraft.image_styles.brightness ?? 1}
                          onChange={handleThemeImageChange("brightness")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Arredondamento (px)</label>
                        <input
                          type="number"
                          min="0"
                          max="64"
                          value={themeDraft.image_styles.radius ?? 0}
                          onChange={handleThemeImageChange("radius")}
                        />
                      </div>
                      <div className="theme-control">
                        <label>Sombra</label>
                        <input
                          value={themeDraft.image_styles.shadow ?? ""}
                          onChange={handleThemeImageChange("shadow")}
                        />
                      </div>
                    </div>

                    <div className="theme-actions">
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={handleUndoTheme}
                        disabled={!themeSnapshot}
                      >
                        Desfazer
                      </button>
                      <button
                        className="btn btn-outline"
                        type="button"
                        onClick={() => void handleSaveThemeVersion()}
                        disabled={themeSaving}
                      >
                        Salvar como versão
                      </button>
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => void handleSaveTheme()}
                        disabled={themeSaving}
                      >
                        {themeSaving ? "Salvando..." : "Salvar alterações"}
                      </button>
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => void handleActivateTheme()}
                        disabled={!themeDraft.id || themeActivatingId === themeDraft.id}
                      >
                        {themeActivatingId === themeDraft.id
                          ? "Ativando..."
                          : "Ativar paleta"}
                      </button>
                    </div>
                    <p className="theme-preview-note">
                      As alterações são aplicadas em tempo real. Você pode desfazer
                      antes de salvar.
                    </p>
                  </>
                )}
              </div>
            </div>
            <div className="theme-copy-panel">
              <h4>Textos do front-end</h4>
              <div className="copy-section">
                <h5>Cabeçalho</h5>
                <div className="theme-editor-grid">
                  <div className="theme-control">
                    <label>Subtítulo do cabeçalho</label>
                    <input
                      value={textDraft.header.brandSub}
                      onChange={handleHeaderTextChange("brandSub")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Botão do painel</label>
                    <input
                      value={textDraft.header.panelLabel}
                      onChange={handleHeaderTextChange("panelLabel")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Botão de login</label>
                    <input
                      value={textDraft.header.loginButton}
                      onChange={handleHeaderTextChange("loginButton")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Botão de saída</label>
                    <input
                      value={textDraft.header.logoutButton}
                      onChange={handleHeaderTextChange("logoutButton")}
                    />
                  </div>
                </div>
                <div className="theme-editor-grid">
                  <div className="theme-control">
                    <label>Menu - Mapa</label>
                    <input
                      value={textDraft.header.navMap}
                      onChange={handleHeaderTextChange("navMap")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Menu - Cadastro com código</label>
                    <input
                      value={textDraft.header.navAccessCode}
                      onChange={handleHeaderTextChange("navAccessCode")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Menu - Relatórios</label>
                    <input
                      value={textDraft.header.navReports}
                      onChange={handleHeaderTextChange("navReports")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Menu - Imagens</label>
                    <input
                      value={textDraft.header.navImages}
                      onChange={handleHeaderTextChange("navImages")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Menu - Denúncias</label>
                    <input
                      value={textDraft.header.navComplaints}
                      onChange={handleHeaderTextChange("navComplaints")}
                    />
                  </div>
                </div>
              </div>
              <div className="copy-section">
                <h5>Login</h5>
                <div className="theme-editor-grid">
                  <div className="theme-control">
                    <label>Eyebrow</label>
                    <input
                      value={textDraft.login.eyebrow}
                      onChange={handleLoginTextChange("eyebrow")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Título da página</label>
                    <input
                      value={textDraft.login.title}
                      onChange={handleLoginTextChange("title")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Botão</label>
                    <input
                      value={textDraft.login.buttonLabel}
                      onChange={handleLoginTextChange("buttonLabel")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Link de cadastro</label>
                    <input
                      value={textDraft.login.createAccountLabel}
                      onChange={handleLoginTextChange("createAccountLabel")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Descrição</label>
                    <textarea
                      rows={3}
                      value={textDraft.login.description}
                      onChange={handleLoginTextChange("description")}
                    />
                  </div>
                </div>
              </div>
              <div className="copy-section">
                <h5>Rodapé</h5>
                <div className="theme-editor-grid">
                  <div className="theme-control">
                    <label>Descrição principal</label>
                    <input
                      value={textDraft.footer.description}
                      onChange={handleFooterTextChange("description")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Título - Transparência</label>
                    <input
                      value={textDraft.footer.transparencyTitle}
                      onChange={handleFooterTextChange("transparencyTitle")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Título - Contato</label>
                    <input
                      value={textDraft.footer.contactTitle}
                      onChange={handleFooterTextChange("contactTitle")}
                    />
                  </div>
                  <div className="theme-control">
                    <label>Versão</label>
                    <input
                      value={textDraft.footer.version}
                      onChange={handleFooterTextChange("version")}
                    />
                  </div>
                </div>
                <div className="theme-editor-grid copy-footer-lists">
                  {textDraft.footer.transparencyItems.map((item, index) => (
                    <div className="theme-control" key={`transparency-${index}`}>
                      <label>{`Transparência ${index + 1}`}</label>
                      <input
                        value={item}
                        onChange={handleFooterListChange("transparencyItems", index)}
                      />
                    </div>
                  ))}
                </div>
                <div className="theme-editor-grid copy-footer-lists">
                  {textDraft.footer.contactItems.map((item, index) => (
                    <div className="theme-control" key={`contact-${index}`}>
                      <label>{`Contato ${index + 1}`}</label>
                      <input
                        value={item}
                        onChange={handleFooterListChange("contactItems", index)}
                      />
                    </div>
                  ))}
                </div>
              </div>
              <div className="theme-actions">
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleTextSave}
                  disabled={textSaving}
                >
                  {textSaving ? "Salvando..." : "Salvar textos"}
                </button>
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={handleTextReset}
                >
                  Restaurar padrão
                </button>
              </div>
              {textFeedback && <div className="report-ready">{textFeedback}</div>}
            </div>
          </div>
        )}
        {activeTab === "settings" && (
          <div className="dashboard-card">
            <h3>Configurações</h3>
            <p className="muted">
              Parametros territoriais e textos institucionais serao
              adicionados aqui.
            </p>
          </div>
        )}
        {activeTab === "audit" && (
          <div className="table-card">
            <div className="table-header" style={{ marginBottom: "0.8rem" }}>
              <div>
                <span className="eyebrow">Registro</span>
                <h3>
                  {auditView === "recent"
                    ? "Minhas ações recentes (últimas 10)"
                    : "Histórico completo de ações"}
                </h3>
              </div>
              {auditView === "recent" && auditEntries.length > auditPageSize && (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setAuditView("history")}
                >
                  Ver todas as a&ccedil;&otilde;es
                </button>
              )}
              {auditView === "history" && (
                <button
                  className="btn btn-outline"
                  type="button"
                  onClick={() => setAuditView("recent")}
                >
                  Voltar para recentes
                </button>
              )}
            </div>
            <table>
              <thead>
                <tr>
                  <th>A&ccedil;&atilde;o</th>
                  <th>Entidade</th>
                  <th>Registro</th>
                  <th>Data</th>
                </tr>
              </thead>
              <tbody>
                {auditLoading ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="table-empty">Carregando...</div>
                    </td>
                  </tr>
                ) : auditEntries.length === 0 ? (
                  <tr>
                    <td colSpan={4}>
                      <div className="table-empty">
                        Nenhuma a&ccedil;&atilde;o registrada ainda.
                      </div>
                    </td>
                  </tr>
                ) : (
                  (auditView === "recent"
                    ? recentAuditEntries
                    : pagedAuditEntries
                  ).map((entry) => (
                    <tr key={entry.id}>
                      <td>{entry.action}</td>
                      <td>{entry.entity_type}</td>
                      <td>{entry.entity_id}</td>
                      <td>{new Date(entry.created_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {auditView === "history" && auditEntries.length > auditPageSize && (
              <div className="table-footer">
                <span className="muted">
                  Página {auditPage + 1} de {auditTotalPages}
                </span>
                <div className="pager">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setAuditPage((current) => Math.max(0, current - 1))}
                    disabled={auditPage === 0}
                  >
                    Anterior
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() =>
                      setAuditPage((current) =>
                        Math.min(auditTotalPages - 1, current + 1)
                      )
                    }
                    disabled={auditPage >= auditTotalPages - 1}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}

export default function Admin() {
  const role = getAuthRole();
  if (role !== "admin" && role !== "manager" && role !== "teacher") {
    return (
      <div className="page">
        <div className="alert">Acesso restrito ao painel admin.</div>
      </div>
    );
  }
  return (
    <div className="page">
      <AdminPanel />
    </div>
  );
}
