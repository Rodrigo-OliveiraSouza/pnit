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
  const isTeacher = role === "teacher";
  const panelLink = "/painel?tab=register";
  const panelLabel = "Painel";

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
            <span className="brand-sub">Mapa público de residentes</span>
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
            {!isLoggedIn && (
              <NavLink
                to="/acesso"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                Cadastro com código
              </NavLink>
            )}
            {isLoggedIn && (
              <NavLink
                to="/relatorios"
                className={({ isActive }) =>
                  `nav-link${isActive ? " active" : ""}`
                }
              >
                Relatórios
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
              Denúncias
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
            alt="MIR - Ministério da Igualdade Racial"
            className="logo logo-mir theme-ignore"
          />
        </div>
      </div>
    </header>
  );
}
