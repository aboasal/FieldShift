export type LatLngPoint = [number, number]; // [lat, lng]

export type CropType =
  | "Wheat"
  | "Corn"
  | "Rice"
  | "Soybeans"
  | "Cotton"
  | "Vegetables"
  | "Orchard"
  | "Pasture";

export interface FarmField {
  id: string;
  name: string;
  crop: CropType;
  coordinates: LatLngPoint[];
  areaHectares: number;
  areaAcres: number;
  perimeterMeters: number;
  centroid: LatLngPoint;
  color: string;
  createdAt: string;
}

export interface NasaDailyRecord {
  date: string;
  tempC: number | null;
  tempMaxC: number | null;
  tempMinC: number | null;
  precipMm: number | null;
  solarKwh: number | null;
  humidityPct: number | null;
  soilWetness: number | null; // 0 to 1
}

export interface NasaPowerResponse {
  records: NasaDailyRecord[];
  source: "nasa-power" | "fallback";
  fetchedAt: string;
}

export type BaseMapId = "satellite" | "street";

export type NasaGibsLayerId =
  | "none"
  | "ndvi"
  | "soil-moisture"
  | "lst-day"
  | "true-color";

export interface FarmAdvisory {
  id: string;
  title: string;
  detail: string;
  severity: "good" | "info" | "warning" | "alert";
  metric: string;
}

export type PreviousCropType =
  | "Wheat"
  | "Corn"
  | "Rice"
  | "Cotton"
  | "Vegetables"
  | "Soybeans"
  | "Orchard"
  | "Fallow";

export type WaterSupplyTier = "low" | "moderate" | "high";

export type PlanPriority = "profit" | "sustainability" | "water-saving";

export interface FarmerGroundInputs {
  waterTier: WaterSupplyTier;
  waterM3PerHa: number;
  lastCrop: PreviousCropType;
  priority: PlanPriority;
}

export interface CropCycleStage {
  season: string;
  crop: string;
  durationMonths: string;
  role: string;
}

export interface CropCyclePlan {
  id: string;
  name: string;
  tagline: string;
  badge: string;
  recommendedFor: PlanPriority;
  matchScore: number; // 0-100
  waterNeededM3PerHa: number;
  waterStatus: "optimal" | "tight" | "deficit";
  estimatedRevenuePerHaUsd: number;
  estimatedTotalRevenueUsd: number;
  soilHealthScore: number; // 0-100
  profitScore: number; // 0-100
  waterEfficiencyScore: number; // 0-100
  stages: [CropCycleStage, CropCycleStage, CropCycleStage];
  whyItFits: string[];
  actionSteps: string[];
}
