export type StatusLabel = "active" | "inactive" | "pending";
export type PrecisionLabel = "approx" | "exact";

export function formatStatus(value: StatusLabel) {
  if (value === "active") return "Ativo";
  if (value === "inactive") return "Inativo";
  return "Pendente";
}

export function formatPrecision(value: PrecisionLabel) {
  if (value === "exact") return "Exato";
  return "Aproximado";
}
