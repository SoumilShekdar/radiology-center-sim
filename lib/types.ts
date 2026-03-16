import type { Modality } from "@/lib/constants";

export type OperatingHour = {
  enabled: boolean;
  openHour: number;
  closeHour: number;
};

export type CoveragePoint = {
  hour: number;
  coverage: number;
};

export type StaffRotation = {
  technicians: CoveragePoint[];
  supportStaff: CoveragePoint[];
  radiologists: CoveragePoint[];
};

export type ResourceConfigInput = {
  xRayMachines: number;
  ctMachines: number;
  mriMachines: number;
  portableXRayMachines: number;
  ultrasoundMachines: number;
  rooms: number;
  changingRooms: number;
  technicians: number;
  supportStaff: number;
  radiologists: number;
};

export type ServiceConfigInput = {
  modality: Modality;
  charge: number;
  examDurationMinutes: number;
  prepDurationMinutes: number;
  cleanupMinutes: number;
  reportingMinutes: number;
};

export type DemandProfileInput = {
  baseDailyPatients: number;
  hourlyDistribution: number[];
  dayOfWeekMultiplier: number[];
  inpatientFraction: number;
  urgentFraction: number;
  noShowRate: number;
  unexpectedLeaveRate: number;
  repeatScanRate: number;
  resultCommunicationMinutes: number;
};

export type ServiceMixInput = {
  modality: Modality;
  weight: number;
};

export type ScenarioInput = {
  id?: string;
  name: string;
  description: string;
  currency: string;
  seedDefault: number;
  operatingHours: OperatingHour[];
  staffRotation: StaffRotation;
  downtimeRate: number;
  resourceConfig: ResourceConfigInput;
  serviceConfigs: ServiceConfigInput[];
  demandProfile: DemandProfileInput;
  serviceMix: ServiceMixInput[];
};

export type ScenarioSummary = {
  id: string;
  name: string;
  description: string;
  updatedAt: Date;
  seedDefault: number;
};

export type RunMetric = {
  modality: Modality | "ALL";
  metricName: string;
  metricValue: number;
};

export type DailySnapshot = {
  dayIndex: number;
  modality: Modality | "ALL";
  throughput: number;
  completedPatients: number;
  deferredPatients: number;
  revenue: number;
  averageWaitMinutes: number;
  averageResultMinutes: number;
  p90WaitMinutes: number;
  queuePeak: number;
  machineUtilization: number;
  technicianUtilization: number;
  radiologistUtilization: number;
  roomUtilization: number;
  changingRoomUtilization: number;
};

export type SimulationSummary = {
  horizonDays: number;
  seed: number;
  possibleRevenue: number;
  maximumRevenue: number;
  actualRevenue: number;
  lostRevenue: number;
  lostRevenueDueToWait: number;
  lostRevenueDueToResult: number;
  lostRevenueDueToUnexpectedLeave: number;
  completedPatients: number;
  deferredPatients: number;
  averageWaitMinutes: number;
  averageResultMinutes: number;
  p50WaitMinutes: number;
  p90WaitMinutes: number;
  p50ResultMinutes: number;
  p90ResultMinutes: number;
  p95WaitMinutes: number;
  machineUtilization: number;
  technicianUtilization: number;
  radiologistUtilization: number;
  roomUtilization: number;
  changingRoomUtilization: number;
  bottleneck: string;
};
