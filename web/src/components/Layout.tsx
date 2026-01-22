import { Outlet } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import FloatingSymbols from "./FloatingSymbols";

export default function Layout() {
  return (
    <div className="app-shell">
      <FloatingSymbols />
      <Header />
      <main className="app-main">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
