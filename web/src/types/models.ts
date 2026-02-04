export type MapPoint = {
  id: string;
  publicLat: number;
  publicLng: number;
  status: "active" | "inactive";
  precision: "approx" | "exact";
  updatedAt: string;
  region: string;
  city?: string | null;
  state?: string | null;
  residents: number;
  communityName?: string | null;
  publicNote?: string;
  photoUrl?: string | null;
};

export type ResidentProfile = {
  healthScore: number;
  healthHasClinic?: boolean;
  healthHasEmergency?: boolean;
  healthHasCommunityAgent?: boolean;
  healthNotes?: string;
  educationScore: number;
  educationLevel?: string;
  educationHasSchool?: boolean;
  educationHasTransport?: boolean;
  educationMaterialSupport?: boolean;
  educationNotes?: string;
  incomeScore: number;
  incomeMonthly?: number | null;
  incomeSource?: string;
  assetsHasCar?: boolean;
  assetsHasFridge?: boolean;
  assetsHasFurniture?: boolean;
  assetsHasLand?: boolean;
  housingScore: number;
  housingRooms?: number | null;
  housingAreaM2?: number | null;
  housingLandM2?: number | null;
  housingType?: string;
  securityScore: number;
  securityHasPoliceStation?: boolean;
  securityHasPatrol?: boolean;
  securityNotes?: string;
  raceIdentity?: string;
  territoryNarrative?: string;
  territoryMemories?: string;
  territoryConflicts?: string;
  territoryCulture?: string;
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
  actor_user_id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  created_at: string;
};
