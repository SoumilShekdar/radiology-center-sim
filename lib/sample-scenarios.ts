import { DAY_NAMES, MODALITIES } from "@/lib/constants";
import type { ScenarioInput } from "@/lib/types";

function buildCoverage(peakStart: number, peakEnd: number, offPeak = 0.55) {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    coverage: hour >= peakStart && hour < peakEnd ? 1 : offPeak
  }));
}

function buildOperatingHours(start: number, end: number) {
  return DAY_NAMES.map((_, index) => ({
    enabled: index !== 0,
    openHour: start,
    closeHour: end
  }));
}

const baseHourlyDistribution = [
  0.01, 0.01, 0.01, 0.01, 0.01, 0.02,
  0.04, 0.08, 0.11, 0.1, 0.09, 0.08,
  0.08, 0.08, 0.08, 0.07, 0.05, 0.03,
  0.02, 0.02, 0, 0, 0, 0
];

const dayMultiplier = [0.45, 1, 1.05, 1.05, 1, 0.95, 0.7];

function commonServiceConfigs() {
  return [
    { modality: "XRAY", charge: 110, examDurationMinutes: 15, prepDurationMinutes: 8, cleanupMinutes: 4, reportingMinutes: 10 },
    { modality: "CT", charge: 420, examDurationMinutes: 30, prepDurationMinutes: 15, cleanupMinutes: 8, reportingMinutes: 18 },
    { modality: "MRI", charge: 900, examDurationMinutes: 50, prepDurationMinutes: 20, cleanupMinutes: 10, reportingMinutes: 25 },
    { modality: "PORTABLE_XRAY", charge: 180, examDurationMinutes: 20, prepDurationMinutes: 5, cleanupMinutes: 5, reportingMinutes: 12 },
    { modality: "ULTRASOUND", charge: 280, examDurationMinutes: 25, prepDurationMinutes: 10, cleanupMinutes: 5, reportingMinutes: 14 }
  ] as ScenarioInput["serviceConfigs"];
}

function buildRoomConfigs(count: number): ScenarioInput["workflowConfig"]["roomConfigs"] {
  const templates: Array<{ name: string; supportedModalities: ScenarioInput["workflowConfig"]["roomConfigs"][number]["supportedModalities"]; dedicatedModality: ScenarioInput["workflowConfig"]["roomConfigs"][number]["dedicatedModality"] }> = [
    { name: "General X-Ray 1", supportedModalities: ["XRAY"], dedicatedModality: "XRAY" },
    { name: "General X-Ray 2", supportedModalities: ["XRAY"], dedicatedModality: "XRAY" },
    { name: "CT Suite", supportedModalities: ["CT"], dedicatedModality: "CT" },
    { name: "MRI Suite", supportedModalities: ["MRI"], dedicatedModality: "MRI" },
    { name: "Ultrasound 1", supportedModalities: ["ULTRASOUND"], dedicatedModality: "ULTRASOUND" },
    { name: "Ultrasound 2", supportedModalities: ["ULTRASOUND"], dedicatedModality: "ULTRASOUND" },
    { name: "Flex Room 1", supportedModalities: ["XRAY", "CT", "ULTRASOUND"], dedicatedModality: "NONE" },
    { name: "Flex Room 2", supportedModalities: ["XRAY", "CT", "MRI", "ULTRASOUND"], dedicatedModality: "NONE" },
    { name: "Flex Room 3", supportedModalities: ["XRAY", "CT", "ULTRASOUND"], dedicatedModality: "NONE" },
    { name: "Flex Room 4", supportedModalities: ["XRAY", "MRI", "ULTRASOUND"], dedicatedModality: "NONE" },
    { name: "Procedure Room A", supportedModalities: ["CT", "ULTRASOUND"], dedicatedModality: "NONE" },
    { name: "Procedure Room B", supportedModalities: ["CT", "ULTRASOUND"], dedicatedModality: "NONE" },
    { name: "General Imaging A", supportedModalities: ["XRAY", "CT", "ULTRASOUND"], dedicatedModality: "NONE" },
    { name: "General Imaging B", supportedModalities: ["XRAY", "MRI", "ULTRASOUND"], dedicatedModality: "NONE" }
  ];

  return Array.from({ length: count }, (_, index) => {
    const template = templates[index] ?? {
      name: `Flex Room ${index + 1}`,
      supportedModalities: ["XRAY", "CT", "MRI", "ULTRASOUND"] as const,
      dedicatedModality: "NONE" as const
    };
    return {
      id: `room-${index + 1}`,
      name: template.name,
      supportedModalities: [...template.supportedModalities],
      dedicatedModality: template.dedicatedModality
    };
  });
}

function buildChangingRoomConfigs(count: number): ScenarioInput["workflowConfig"]["changingRoomConfigs"] {
  return Array.from({ length: count }, (_, index) => ({
    id: `changing-room-${index + 1}`,
    name: index === 0 ? "Women Changing" : index === 1 ? "Men Changing" : `Unisex Changing ${index - 1}`,
    gender: index === 0 ? "FEMALE" : index === 1 ? "MALE" : "UNISEX"
  }));
}

function buildWorkflowConfig(rooms: number, changingRooms: number): ScenarioInput["workflowConfig"] {
  return {
    roomConfigs: buildRoomConfigs(rooms),
    changingRoomConfigs: buildChangingRoomConfigs(changingRooms),
    changingRoomByModality: {
      XRAY: false,
      CT: true,
      MRI: true,
      PORTABLE_XRAY: false,
      ULTRASOUND: false
    }
  };
}

export const SAMPLE_SCENARIOS: ScenarioInput[] = [
  {
    name: "Small Community Hospital",
    description: "A lean radiology team with limited advanced imaging capacity and moderate weekday demand.",
    currency: "USD",
    seedDefault: 101,
    downtimeRate: 0.08,
    operatingHours: buildOperatingHours(7, 18),
    staffRotation: {
      technicians: buildCoverage(7, 18),
      supportStaff: buildCoverage(7, 18),
      radiologists: buildCoverage(8, 17, 0.4)
    },
    resourceConfig: {
      xRayMachines: 2,
      ctMachines: 1,
      mriMachines: 1,
      portableXRayMachines: 1,
      ultrasoundMachines: 1,
      rooms: 4,
      changingRooms: 2,
      technicians: 4,
      supportStaff: 3,
      radiologists: 2
    },
    workflowConfig: buildWorkflowConfig(4, 2),
    serviceConfigs: commonServiceConfigs(),
    demandProfile: {
      baseDailyPatients: 48,
      hourlyDistribution: baseHourlyDistribution,
      dayOfWeekMultiplier: dayMultiplier,
      inpatientFraction: 0.22,
      femaleFraction: 0.52,
      urgentFraction: 0.08,
      noShowRate: 0.05,
      unexpectedLeaveRate: 0.015,
      repeatScanRate: 0.02,
      resultCommunicationMinutes: 12
    },
    appointmentPolicy: {
      enabled: false,
      outpatientScheduledFraction: 0.7,
      arrivalVarianceMinutes: 15,
      earlyArrivalMinutes: 20
    },
    serviceMix: [
      { modality: "XRAY", weight: 0.38 },
      { modality: "CT", weight: 0.18 },
      { modality: "MRI", weight: 0.12 },
      { modality: "PORTABLE_XRAY", weight: 0.12 },
      { modality: "ULTRASOUND", weight: 0.2 }
    ]
  },
  {
    name: "Mid-Size General Hospital",
    description: "Balanced capacity across common imaging modalities with dedicated reporting coverage across the workday.",
    currency: "USD",
    seedDefault: 202,
    downtimeRate: 0.07,
    operatingHours: buildOperatingHours(6, 20),
    staffRotation: {
      technicians: buildCoverage(6, 20),
      supportStaff: buildCoverage(6, 20),
      radiologists: buildCoverage(7, 19, 0.55)
    },
    resourceConfig: {
      xRayMachines: 4,
      ctMachines: 2,
      mriMachines: 2,
      portableXRayMachines: 2,
      ultrasoundMachines: 3,
      rooms: 8,
      changingRooms: 4,
      technicians: 9,
      supportStaff: 6,
      radiologists: 4
    },
    workflowConfig: buildWorkflowConfig(8, 4),
    serviceConfigs: commonServiceConfigs().map((item) =>
      item.modality === "MRI" ? { ...item, charge: 950 } : item
    ),
    demandProfile: {
      baseDailyPatients: 115,
      hourlyDistribution: baseHourlyDistribution,
      dayOfWeekMultiplier: dayMultiplier,
      inpatientFraction: 0.28,
      femaleFraction: 0.52,
      urgentFraction: 0.11,
      noShowRate: 0.04,
      unexpectedLeaveRate: 0.012,
      repeatScanRate: 0.025,
      resultCommunicationMinutes: 10
    },
    appointmentPolicy: {
      enabled: false,
      outpatientScheduledFraction: 0.72,
      arrivalVarianceMinutes: 15,
      earlyArrivalMinutes: 20
    },
    serviceMix: [
      { modality: "XRAY", weight: 0.34 },
      { modality: "CT", weight: 0.21 },
      { modality: "MRI", weight: 0.14 },
      { modality: "PORTABLE_XRAY", weight: 0.11 },
      { modality: "ULTRASOUND", weight: 0.2 }
    ]
  },
  {
    name: "High-Volume Tertiary Center",
    description: "Large radiology department with strong inpatient and urgent demand, complex imaging mix, and longer reporting queues.",
    currency: "USD",
    seedDefault: 303,
    downtimeRate: 0.06,
    operatingHours: buildOperatingHours(6, 22),
    staffRotation: {
      technicians: buildCoverage(6, 22),
      supportStaff: buildCoverage(6, 22),
      radiologists: buildCoverage(6, 21, 0.65)
    },
    resourceConfig: {
      xRayMachines: 7,
      ctMachines: 4,
      mriMachines: 3,
      portableXRayMachines: 4,
      ultrasoundMachines: 5,
      rooms: 14,
      changingRooms: 8,
      technicians: 18,
      supportStaff: 10,
      radiologists: 8
    },
    workflowConfig: buildWorkflowConfig(14, 8),
    serviceConfigs: commonServiceConfigs().map((item) =>
      item.modality === "CT"
        ? { ...item, charge: 465 }
        : item.modality === "MRI"
          ? { ...item, charge: 1025 }
          : item
    ),
    demandProfile: {
      baseDailyPatients: 230,
      hourlyDistribution: baseHourlyDistribution,
      dayOfWeekMultiplier: dayMultiplier,
      inpatientFraction: 0.36,
      femaleFraction: 0.51,
      urgentFraction: 0.16,
      noShowRate: 0.03,
      unexpectedLeaveRate: 0.018,
      repeatScanRate: 0.03,
      resultCommunicationMinutes: 9
    },
    appointmentPolicy: {
      enabled: false,
      outpatientScheduledFraction: 0.76,
      arrivalVarianceMinutes: 20,
      earlyArrivalMinutes: 25
    },
    serviceMix: [
      { modality: "XRAY", weight: 0.3 },
      { modality: "CT", weight: 0.24 },
      { modality: "MRI", weight: 0.16 },
      { modality: "PORTABLE_XRAY", weight: 0.12 },
      { modality: "ULTRASOUND", weight: 0.18 }
    ]
  }
];

export const DEFAULT_SCENARIO = SAMPLE_SCENARIOS[1];

export const MODALITY_DEFAULTS = MODALITIES.map((modality) => ({
  modality,
  weight: 1 / MODALITIES.length
}));

export const SCENARIO_PRESET_LABELS = [
  "Small Community Hospital",
  "Mid-Size General Hospital",
  "High-Volume Tertiary Center"
] as const;
