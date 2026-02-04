export type StatusLabel =
  | "active"
  | "inactive"
  | "pending"
  | "disabled"
  | "new"
  | "reviewing"
  | "closed";
export type PrecisionLabel = "approx" | "exact";

export function formatStatus(value: StatusLabel) {
  if (value === "active") return "Ativo";
  if (value === "inactive") return "Inativo";
  if (value === "disabled") return "Desativado";
  if (value === "reviewing") return "Em análise";
  if (value === "closed") return "Encerrado";
  if (value === "new") return "Novo";
  return "Pendente";
}

export function formatPrecision(value: PrecisionLabel) {
  if (value === "exact") return "Exato";
  return "Aproximado";
}
