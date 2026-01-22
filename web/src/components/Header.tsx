import { Link, NavLink, useNavigate } from "react-router-dom";
import {
  getAuthRole,
  getAuthToken,
  setAuthRole,
  setAuthToken,
  setAuthUserId,
} from "../services/api";

export default function Header() {
  const navigate = useNavigate();
  const baseUrl = import.meta.env.BASE_URL || "/";
  const isLoggedIn = Boolean(getAuthToken());
  const role = getAuthRole();
  const isAdmin = role === "admin";
  const panelLink = "/painel";
  const panelLabel = role === "admin" ? "Painel" : "Painel";

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
              className="logo logo-governo"
            />
            <img
              src={`${baseUrl}logos/diversifica.png`}
              alt="Diversifica Inclusao e Diversidade"
              className="logo logo-diversifica"
            />
          </div>
          <div className="brand">
            <span className="brand-mark">GTERF</span>
            <span className="brand-sub">Mapa publico de residentes</span>
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
              Mapa
            </NavLink>
            {isLoggedIn && (
              <NavLink
                to="/relatorios"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                Relatorios
              </NavLink>
            )}
            {isAdmin && (
              <NavLink
                to="/imagens-noticias"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                Imagens
              </NavLink>
            )}
            <NavLink
              to="/denuncias"
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
            >
              Denuncias
            </NavLink>
            {isLoggedIn ? (
              <>
                <Link to={panelLink} className="btn btn-ghost">
                  {panelLabel}
                </Link>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={handleLogout}
                >
                  Sair
                </button>
              </>
            ) : (
              <Link to="/login" className="btn btn-primary">
                Entrar
              </Link>
            )}
          </nav>
          <img
            src={`${baseUrl}logos/mir.png`}
            alt="MIR - Ministerio da Igualdade Racial"
            className="logo logo-mir"
          />
        </div>
      </div>
    </header>
  );
}
