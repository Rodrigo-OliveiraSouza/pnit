import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  getAuthRole,
  getAuthToken,
  setAuthRole,
  setAuthToken,
  setAuthUserId,
} from "../services/api";
import { useSiteCopy } from "../providers/SiteCopyProvider";

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const baseUrl = import.meta.env.BASE_URL || "/";
  const [authToken, setAuthTokenState] = useState(getAuthToken());
  const role = getAuthRole();
  const isAdmin = role === "admin";
  const isContentManager = role === "content";
  const isSupervisor =
    role === "admin" || role === "manager" || role === "teacher";
  const panelLink = isContentManager
    ? "/admin"
    : isAdmin
      ? "/painel?tab=admin"
      : isSupervisor
        ? "/painel?tab=management"
        : "/painel?tab=register";
  const { copy } = useSiteCopy();
  const isLoggedIn = Boolean(authToken);
  const isPanelRoute =
    location.pathname.startsWith("/painel") || location.pathname.startsWith("/admin");
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    const handler = () => setAuthTokenState(getAuthToken());
    window.addEventListener("pnit_auth_change", handler);
    return () => {
      window.removeEventListener("pnit_auth_change", handler);
    };
  }, []);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    const handleScroll = () => {
      const currentY = window.scrollY;
      const previousY = lastScrollY.current;
      if (currentY > previousY && currentY > 20) {
        setIsHidden(true);
      } else if (currentY < previousY) {
        setIsHidden(false);
      }
      lastScrollY.current = currentY;
    };
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", handleScroll);
    };
  }, []);

  const handleLogout = () => {
    setAuthToken(null);
    setAuthRole(null);
    setAuthUserId(null);
    navigate("/login");
  };

  return (
    <header className={`site-header${isHidden ? " is-hidden" : ""}`}>
      <div className="header-ribbon">
        <div className="header-brand-group header-brand-group--ribbon">
          <Link
            to="/"
            className="header-logo-link header-logo-link--ribbon"
            aria-label="Ir para a página inicial"
          >
            <img
              src={`${baseUrl}logos/agentes-territoriais.png`}
              alt="Agentes Territoriais"
              className="logo logo-agentes theme-ignore"
            />
          </Link>
        </div>
        <div className="header-nav-wrap">
          <nav className="site-nav" aria-label="Navegação principal">
            <NavLink
              to="/"
              end
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              {copy.header.navMap}
            </NavLink>
            <NavLink
              to="/noticias"
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              Notícias
            </NavLink>
            <NavLink
              to="/equipe"
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              Equipe
            </NavLink>
            {!isLoggedIn && (
              <NavLink
                to="/acesso"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                {copy.header.navAccessCode}
              </NavLink>
            )}
            {isLoggedIn && !isContentManager && (
              <NavLink
                to="/relatorios"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                {copy.header.navReports}
              </NavLink>
            )}
            {(isAdmin || isContentManager) && (
              <NavLink
                to="/imagens-noticias"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                {copy.header.navImages}
              </NavLink>
            )}
          </nav>

          <div className="header-auth-actions">
            {isLoggedIn ? (
              <>
                <Link
                  to={panelLink}
                  className={`btn btn-primary header-auth-button${
                    isPanelRoute ? " is-current" : ""
                  }`}
                  aria-current={isPanelRoute ? "page" : undefined}
                >
                  {copy.header.panelLabel}
                </Link>
                <button
                  className="btn btn-primary header-auth-button"
                  type="button"
                  onClick={handleLogout}
                >
                  {copy.header.logoutButton}
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary header-auth-button">
                {copy.header.loginButton}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
