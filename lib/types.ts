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

export type PatientGender = "MALE" | "FEMALE";

export type RoomConfigInput = {
  id: string;
  name: string;
  supportedModalities: Modality[];
  dedicatedModality: Modality | "NONE";
};

export type ChangingRoomConfigInput = {
  id: string;
  name: string;
  gender: PatientGender | "UNISEX";
};

export type WorkflowConfigInput = {
  roomConfigs: RoomConfigInput[];
  changingRoomConfigs: ChangingRoomConfigInput[];
  changingRoomByModality: Record<Modality, boolean>;
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
  technicianSalaryDaily: number;
  radiologistSalaryDaily: number;
  supportStaffSalaryDaily: number;
  machineCostModel: "LEASED" | "OWNED";
  xRayLeaseCostDaily: number;
  ctLeaseCostDaily: number;
  mriLeaseCostDaily: number;
  portableXRayLeaseCostDaily: number;
  ultrasoundLeaseCostDaily: number;
};

export type ServiceConfigInput = {
  modality: Modality;
  charge: number;
  consumableCost: number;
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
  femaleFraction: number;
  urgentFraction: number;
  noShowRate: number;
  unexpectedLeaveRate: number;
  repeatScanRate: number;
  traumaSpikeProbability: number;
  traumaSpikeMultiplier: number;
  resultCommunicationMinutes: number;
};

export type AppointmentPolicyInput = {
  enabled: boolean;
  outpatientScheduledFraction: number;
  arrivalVarianceMinutes: number;
  earlyArrivalMinutes: number;
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
  workflowConfig: WorkflowConfigInput;
  serviceConfigs: ServiceConfigInput[];
  demandProfile: DemandProfileInput;
  appointmentPolicy: AppointmentPolicyInput;
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
  profit: number;
  totalCost: number;
  consumableCost: number;
  machineCost: number;
  staffCost: number;
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
  mode?: "SINGLE" | "MONTE_CARLO";
  horizonDays: number;
  seed: number;
  possibleRevenue: number;
  maximumRevenue: number;
  actualRevenue: number;
  totalProfit: number;
  totalCost: number;
  consumableCost: number;
  machineCost: number;
  staffCost: number;
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
  iterations?: number;
  seedStart?: number;
  seedEnd?: number;
  p10ActualRevenue?: number;
  p50ActualRevenue?: number;
  p90ActualRevenue?: number;
  p10P90WaitMinutes?: number;
  p50P90WaitMinutes?: number;
  p90P90WaitMinutes?: number;
  p10CompletedPatients?: number;
  p50CompletedPatients?: number;
  p90CompletedPatients?: number;
};
