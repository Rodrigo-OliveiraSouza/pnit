import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Reports from "./pages/Reports";
import Login from "./pages/Login";
import Register from "./pages/Register";
import EmployeeDashboard from "./pages/EmployeeDashboard";
import Admin from "./pages/Admin";
import PointDetail from "./pages/PointDetail";
import Complaints from "./pages/Complaints";
import NewsImages from "./pages/NewsImages";
import News from "./pages/News";
import NotFound from "./pages/NotFound";
import AccessCodeRegister from "./pages/AccessCodeRegister";
import PasswordReset from "./pages/PasswordReset";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/relatorios" element={<Reports />} />
        <Route path="/login" element={<Login />} />
        <Route path="/recuperar-senha" element={<PasswordReset />} />
        <Route path="/cadastro" element={<Register />} />
        <Route path="/acesso" element={<AccessCodeRegister />} />
        <Route path="/painel" element={<EmployeeDashboard />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/denuncias" element={<Complaints />} />
        <Route path="/noticias" element={<News />} />
        <Route path="/imagens-noticias" element={<NewsImages />} />
        <Route path="/map/points/:id" element={<PointDetail />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
