import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  getAuthRole,
  getAuthToken,
  setAuthRole,
  setAuthToken,
  setAuthUserId,
} from "../services/api";
import { useSiteCopy } from "../providers/SiteCopyProvider";
import { useEffect, useState } from "react";

export default function Header() {
  const navigate = useNavigate();
  const baseUrl = import.meta.env.BASE_URL || "/";
  const [authToken, setAuthTokenState] = useState(getAuthToken());
  const role = getAuthRole();
  const isAdmin = role === "admin";
  const panelLink = "/painel?tab=register";
  const { copy } = useSiteCopy();
  const isLoggedIn = Boolean(authToken);

  useEffect(() => {
    const handler = () => setAuthTokenState(getAuthToken());
    window.addEventListener("pnit_auth_change", handler);
    return () => {
      window.removeEventListener("pnit_auth_change", handler);
    };
  }, []);

  const handleLogout = () => {
    setAuthToken(null);
    setAuthRole(null);
    setAuthUserId(null);
    navigate("/login");
  };

  return (
    <header className="site-header">
      <div className="header-top header-top-logos header-bar">
        <div className="header-left">
          <div className="header-logos">
            <img
              src={`${baseUrl}logos/governo-brasil.png`}
              alt="Governo do Brasil"
              className="logo logo-governo theme-ignore"
            />
            <img
              src={`${baseUrl}logos/diversifica.png`}
              alt="Diversifica Inclusão e Diversidade"
              className="logo logo-diversifica theme-ignore"
            />
          </div>
          <div className="brand">
            <span className="brand-sub">{copy.header.brandSub}</span>
          </div>
        </div>
        <div className="header-actions">
          <nav className="nav">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              {copy.header.navMap}
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
            {isLoggedIn && (
              <NavLink
                to="/relatorios"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                {copy.header.navReports}
              </NavLink>
            )}
            {isAdmin && (
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
            {isLoggedIn ? (
              <>
                <Link to={panelLink} className="btn btn-ghost">
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
          </nav>
        </div>
      </div>
    </header>
  );
}
