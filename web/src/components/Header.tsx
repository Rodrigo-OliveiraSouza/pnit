import { useEffect, useRef, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
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
  const [isHidden, setIsHidden] = useState(false);
  const lastScrollY = useRef(0);
  const homeAnchor = `${baseUrl}#relatorios`;
  const brandSubtitle =
    copy.header.brandSub.trim() ||
    "Mapa p\u00fablico, relat\u00f3rios export\u00e1veis e leitura institucional dos territ\u00f3rios.";

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
        <div className="header-ribbon-copy">
          <span className="header-ribbon-label">Plataforma p\u00fablica</span>
          <p>
            Inspirada em portais institucionais de forma\u00e7\u00e3o e servi\u00e7o,
            com navega\u00e7\u00e3o editorial, contraste alto e tons terrosos.
          </p>
        </div>
        <div className="header-ribbon-links">
          <a href={homeAnchor}>Explorar mapa</a>
          <Link to="/noticias">Publica\u00e7\u00f5es</Link>
        </div>
      </div>

      <div className="header-main">
        <div className="header-brand-group">
          <Link to="/" className="header-logo-link" aria-label="Ir para a p\u00e1gina inicial">
            <img
              src={`${baseUrl}logos/agentes-territoriais.png`}
              alt="Agentes Territoriais"
              className="logo logo-agentes theme-ignore"
            />
          </Link>
          <div className="brand">
            <span className="brand-kicker">PNIT</span>
            <strong className="brand-mark">Painel territorial com leitura p\u00fablica</strong>
            <span className="brand-sub">{brandSubtitle}</span>
          </div>
        </div>

        <div className="header-nav-wrap">
          <nav className="site-nav" aria-label="Navega\u00e7\u00e3o principal">
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
              Not\u00edcias
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
            <NavLink
              to="/denuncias"
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              {copy.header.navComplaints}
            </NavLink>
          </nav>

          <div className="header-auth-actions">
            <span className="header-status-pill">
              Atualiza\u00e7\u00e3o institucional
            </span>
            {isLoggedIn ? (
              <>
                <Link to={panelLink} className="btn btn-outline">
                  {copy.header.panelLabel}
                </Link>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleLogout}
                >
                  {copy.header.logoutButton}
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary">
                {copy.header.loginButton}
              </Link>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
