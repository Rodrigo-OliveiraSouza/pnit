export type MapPoint = {
  id: string;
  publicLat: number;
  publicLng: number;
  status: "active" | "inactive";
  precision: "approx" | "exact";
  updatedAt: string;
  region: string;
  residents: number;
  publicNote?: string;
};

export type Resident = {
  id: string;
  name: string;
  status: "active" | "inactive";
  pointId?: string;
  lastUpdate: string;
};

export type AuditEntry = {
  id: string;
  actor: string;
  action: string;
  entity: string;
  createdAt: string;
};
