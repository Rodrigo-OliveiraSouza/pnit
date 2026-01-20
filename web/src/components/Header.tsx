import { Link, NavLink } from "react-router-dom";

export default function Header() {
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
          <Link to="/login" className="btn btn-primary">
            Entrar
          </Link>
        </nav>
      </div>
    </header>
  );
}
