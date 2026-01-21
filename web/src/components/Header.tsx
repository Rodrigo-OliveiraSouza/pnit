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
  const isLoggedIn = Boolean(getAuthToken());
  const role = getAuthRole();
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
      <div className="header-top">
        <span className="header-kicker">
          Sistema Nacional de Promocao da Igualdade Racial
        </span>
        <span className="header-tag">SINAPIR</span>
      </div>
      <div className="header-main">
        <div className="brand">
          <span className="brand-mark">GTERF</span>
          <span className="brand-sub">Mapa publico de residentes</span>
        </div>
        <nav className="nav">
          <NavLink
            to="/"
            className={({ isActive }) =>
              `nav-link${isActive ? " active" : ""}`
            }
          >
            Mapa
          </NavLink>
          <NavLink
            to="/relatorios"
            className={({ isActive }) =>
              `nav-link${isActive ? " active" : ""}`
            }
          >
            Relatorios
          </NavLink>
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
              <button className="btn btn-primary" type="button" onClick={handleLogout}>
                Sair
              </button>
            </>
          ) : (
            <Link to="/login" className="btn btn-primary">
              Entrar
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
