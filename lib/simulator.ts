import { MODALITIES, MODALITY_LABELS, SLOT_MINUTES, type Modality, type PatientType } from "@/lib/constants";
import { createSeededRandom, samplePoisson, weightedChoice } from "@/lib/random";
import type { DailySnapshot, RunMetric, ScenarioInput, SimulationSummary } from "@/lib/types";

type ResourceKey =
  | "supportStaff"
  | "changingRooms"
  | "rooms"
  | "technicians"
  | "radiologists"
  | `machine:${Modality}`;

type PatientRecord = {
  id: string;
  modality: Modality;
  patientType: PatientType;
  urgent: boolean;
  arrivalSlot: number;
  patienceDeadlineSlot: number;
  mustFinishExamBySlot: number;
  registrationReadySlot: number;
  prepReadySlot: number;
  examReadySlot: number;
  reportReadySlot: number;
  resultReadySlot: number;
  completed: boolean;
  deferred: boolean;
  lostDueToWait: boolean;
  lostDueToResult: boolean;
  lostDueToUnexpectedLeave: boolean;
  waitToExamMinutes: number;
  waitToResultMinutes: number;
  revenue: number;
  bottleneck: string;
};

type DemandEvent = {
  id: string;
  modality: Modality;
  patientType: PatientType;
  urgent: boolean;
  arrivalSlot: number;
  patienceDeadlineSlot: number;
};

type ScheduledStage = {
  patientId: string;
  modality: Modality;
  readySlot: number;
  priority: number;
  durationSlots: number;
  resources: ResourceKey[];
  deadlineSlot?: number;
};

type FlexibleStage = {
  patientId: string;
  modality: Modality;
  readySlot: number;
  priority: number;
  durationSlots: number;
  resourceOptions: ResourceKey[][];
  deadlineSlot?: number;
};

type StageStats = {
  queuePeak: number;
  occupiedSupportStaff: number;
  occupiedChangingRooms: number;
  occupiedRooms: number;
  occupiedTechnicians: number;
  occupiedRadiologists: number;
  occupiedMachines: Record<Modality, number>;
};

type UtilizationAccumulator = {
  supportStaffCapacity: number;
  changingRoomCapacity: number;
  roomCapacity: number;
  technicianCapacity: number;
  radiologistCapacity: number;
  machineCapacity: Record<Modality, number>;
};

type ResourceEnvironment = {
  capacity: Record<ResourceKey, Int16Array>;
  occupancy: Record<ResourceKey, Int16Array>;
  horizonSlots: number;
  totalSlots: number;
  stats: StageStats;
  utilization: UtilizationAccumulator;
};

const REPORT_TAIL_DAYS = 7;

function toSlots(minutes: number) {
  return Math.max(1, Math.ceil(minutes / SLOT_MINUTES));
}

function slotToDay(slot: number) {
  return Math.max(0, Math.floor((slot * SLOT_MINUTES) / (60 * 24)));
}

function percentile(values: number[], ratio: number) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(ratio * (sorted.length - 1)));
  return sorted[index];
}

function average(values: number[]) {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getMachineCount(scenario: ScenarioInput, modality: Modality) {
  switch (modality) {
    case "XRAY":
      return scenario.resourceConfig.xRayMachines;
    case "CT":
      return scenario.resourceConfig.ctMachines;
    case "MRI":
      return scenario.resourceConfig.mriMachines;
    case "PORTABLE_XRAY":
      return scenario.resourceConfig.portableXRayMachines;
    case "ULTRASOUND":
      return scenario.resourceConfig.ultrasoundMachines;
  }
}

function getCoverageAtHour(points: ScenarioInput["staffRotation"]["technicians"], hour: number) {
  return points.find((point) => point.hour === hour)?.coverage ?? 0;
}

function buildCapacityArray(
  scenario: ScenarioInput,
  totalSlots: number,
  resource: ResourceKey
) {
  const values = new Int16Array(totalSlots);

  for (let slot = 0; slot < totalSlots; slot += 1) {
    const minute = slot * SLOT_MINUTES;
    const dayIndex = Math.floor(minute / (60 * 24));
    const hour = Math.floor((minute % (60 * 24)) / 60);
    const dow = dayIndex % 7;
    const operating = scenario.operatingHours[dow];
    const withinHours = operating.enabled && hour >= operating.openHour && hour < operating.closeHour;

    let capacity = 0;

    if (resource === "supportStaff") {
      capacity = withinHours
        ? Math.max(0, Math.round(scenario.resourceConfig.supportStaff * getCoverageAtHour(scenario.staffRotation.supportStaff, hour)))
        : 0;
    } else if (resource === "technicians") {
      capacity = withinHours
        ? Math.max(0, Math.round(scenario.resourceConfig.technicians * getCoverageAtHour(scenario.staffRotation.technicians, hour)))
        : 0;
    } else if (resource === "radiologists") {
      capacity = withinHours
        ? Math.max(0, Math.round(scenario.resourceConfig.radiologists * getCoverageAtHour(scenario.staffRotation.radiologists, hour)))
        : 0;
    } else if (resource === "rooms") {
      capacity = withinHours ? scenario.resourceConfig.rooms : 0;
    } else if (resource === "changingRooms") {
      capacity = withinHours ? scenario.resourceConfig.changingRooms : 0;
    } else {
      const modality = resource.replace("machine:", "") as Modality;
      const effectiveCount = Math.max(0, Math.round(getMachineCount(scenario, modality) * (1 - scenario.downtimeRate)));
      capacity = withinHours ? effectiveCount : 0;
    }

    values[slot] = capacity;
  }

  return values;
}

function createEnvironment(scenario: ScenarioInput, horizonDays: number): ResourceEnvironment {
  const horizonSlots = Math.ceil((horizonDays * 24 * 60) / SLOT_MINUTES);
  const totalSlots = horizonSlots + Math.ceil((REPORT_TAIL_DAYS * 24 * 60) / SLOT_MINUTES);
  const keys: ResourceKey[] = [
    "supportStaff",
    "changingRooms",
    "rooms",
    "technicians",
    "radiologists",
    ...MODALITIES.map((modality) => `machine:${modality}` as const)
  ];

  const capacity = Object.fromEntries(keys.map((key) => [key, buildCapacityArray(scenario, totalSlots, key)])) as Record<ResourceKey, Int16Array>;
  const occupancy = Object.fromEntries(keys.map((key) => [key, new Int16Array(totalSlots)])) as Record<ResourceKey, Int16Array>;

  const utilization: UtilizationAccumulator = {
    supportStaffCapacity: 0,
    changingRoomCapacity: 0,
    roomCapacity: 0,
    technicianCapacity: 0,
    radiologistCapacity: 0,
    machineCapacity: {
      XRAY: 0,
      CT: 0,
      MRI: 0,
      PORTABLE_XRAY: 0,
      ULTRASOUND: 0
    }
  };

  for (let slot = 0; slot < horizonSlots; slot += 1) {
    utilization.supportStaffCapacity += capacity.supportStaff[slot];
    utilization.changingRoomCapacity += capacity.changingRooms[slot];
    utilization.roomCapacity += capacity.rooms[slot];
    utilization.technicianCapacity += capacity.technicians[slot];
    utilization.radiologistCapacity += capacity.radiologists[slot];
    for (const modality of MODALITIES) {
      utilization.machineCapacity[modality] += capacity[`machine:${modality}`][slot];
    }
  }

  return {
    capacity,
    occupancy,
    horizonSlots,
    totalSlots,
    stats: {
      queuePeak: 0,
      occupiedSupportStaff: 0,
      occupiedChangingRooms: 0,
      occupiedRooms: 0,
      occupiedTechnicians: 0,
      occupiedRadiologists: 0,
      occupiedMachines: {
        XRAY: 0,
        CT: 0,
        MRI: 0,
        PORTABLE_XRAY: 0,
        ULTRASOUND: 0
      }
    },
    utilization
  };
}

function canSchedule(env: ResourceEnvironment, start: number, duration: number, resources: ResourceKey[]) {
  for (let offset = 0; offset < duration; offset += 1) {
    const slot = start + offset;
    if (slot >= env.totalSlots) {
      return false;
    }
    for (const resource of resources) {
      if (env.capacity[resource][slot] <= env.occupancy[resource][slot]) {
        return false;
      }
    }
  }

  return true;
}

function commitSchedule(
  env: ResourceEnvironment,
  start: number,
  duration: number,
  resources: ResourceKey[]
) {
  for (let offset = 0; offset < duration; offset += 1) {
    const slot = start + offset;
    for (const resource of resources) {
      env.occupancy[resource][slot] += 1;
      if (slot < env.horizonSlots) {
        if (resource === "supportStaff") {
          env.stats.occupiedSupportStaff += 1;
        } else if (resource === "changingRooms") {
          env.stats.occupiedChangingRooms += 1;
        } else if (resource === "rooms") {
          env.stats.occupiedRooms += 1;
        } else if (resource === "technicians") {
          env.stats.occupiedTechnicians += 1;
        } else if (resource === "radiologists") {
          env.stats.occupiedRadiologists += 1;
        } else {
          env.stats.occupiedMachines[resource.replace("machine:", "") as Modality] += 1;
        }
      }
    }
  }
}

function assignStage(
  env: ResourceEnvironment,
  items: ScheduledStage[],
  allowPriorities = true
) {
  const pending = [...items].sort((a, b) => a.readySlot - b.readySlot);
  const starts = new Map<string, number>();
  const missed = new Set<string>();
  let cursor = 0;
  const activeQueue: ScheduledStage[] = [];

  for (let slot = 0; slot < env.totalSlots; slot += 1) {
    while (cursor < pending.length && pending[cursor].readySlot <= slot) {
      activeQueue.push(pending[cursor]);
      cursor += 1;
    }

    if (activeQueue.length === 0) {
      continue;
    }

    activeQueue.sort((a, b) => {
      if (!allowPriorities || a.priority === b.priority) {
        return a.readySlot - b.readySlot;
      }
      return b.priority - a.priority || a.readySlot - b.readySlot;
    });

    for (let index = activeQueue.length - 1; index >= 0; index -= 1) {
      const candidate = activeQueue[index];
      if (candidate.deadlineSlot !== undefined && slot > candidate.deadlineSlot) {
        missed.add(candidate.patientId);
        activeQueue.splice(index, 1);
      }
    }

    env.stats.queuePeak = Math.max(env.stats.queuePeak, activeQueue.length);

    let scheduledOne = true;
    while (scheduledOne) {
      scheduledOne = false;
      for (let index = 0; index < activeQueue.length; index += 1) {
        const candidate = activeQueue[index];
        if (candidate.readySlot > slot) {
          continue;
        }
        if (canSchedule(env, slot, candidate.durationSlots, candidate.resources)) {
          commitSchedule(env, slot, candidate.durationSlots, candidate.resources);
          starts.set(candidate.patientId, slot);
          activeQueue.splice(index, 1);
          scheduledOne = true;
          break;
        }
      }
    }
  }

  for (const candidate of activeQueue) {
    if (candidate.deadlineSlot !== undefined) {
      missed.add(candidate.patientId);
    }
  }

  return { starts, missed };
}

function assignFlexibleStage(
  env: ResourceEnvironment,
  items: FlexibleStage[]
) {
  const pending = [...items].sort((a, b) => a.readySlot - b.readySlot);
  const starts = new Map<string, number>();
  const missed = new Set<string>();
  let cursor = 0;
  const activeQueue: FlexibleStage[] = [];

  for (let slot = 0; slot < env.totalSlots; slot += 1) {
    while (cursor < pending.length && pending[cursor].readySlot <= slot) {
      activeQueue.push(pending[cursor]);
      cursor += 1;
    }

    if (activeQueue.length === 0) {
      continue;
    }

    activeQueue.sort((a, b) => b.priority - a.priority || a.readySlot - b.readySlot);

    for (let index = activeQueue.length - 1; index >= 0; index -= 1) {
      const candidate = activeQueue[index];
      if (candidate.deadlineSlot !== undefined && slot > candidate.deadlineSlot) {
        missed.add(candidate.patientId);
        activeQueue.splice(index, 1);
      }
    }

    env.stats.queuePeak = Math.max(env.stats.queuePeak, activeQueue.length);

    let scheduledOne = true;
    while (scheduledOne) {
      scheduledOne = false;
      for (let index = 0; index < activeQueue.length; index += 1) {
        const candidate = activeQueue[index];
        if (candidate.readySlot > slot) {
          continue;
        }

        for (const option of candidate.resourceOptions) {
          if (canSchedule(env, slot, candidate.durationSlots, option)) {
            commitSchedule(env, slot, candidate.durationSlots, option);
            starts.set(candidate.patientId, slot);
            activeQueue.splice(index, 1);
            scheduledOne = true;
            break;
          }
        }

        if (scheduledOne) {
          break;
        }
      }
    }
  }

  for (const candidate of activeQueue) {
    if (candidate.deadlineSlot !== undefined) {
      missed.add(candidate.patientId);
    }
  }

  return { starts, missed };
}

function generateDemand(scenario: ScenarioInput, horizonDays: number, seed: number) {
  const random = createSeededRandom(seed);
  const events: DemandEvent[] = [];
  let sequence = 0;

  for (let day = 0; day < horizonDays; day += 1) {
    const dow = day % 7;
    const totalPatients = samplePoisson(
      scenario.demandProfile.baseDailyPatients * scenario.demandProfile.dayOfWeekMultiplier[dow],
      random
    );

    for (let hour = 0; hour < 24; hour += 1) {
      const hourlyCount = samplePoisson(totalPatients * scenario.demandProfile.hourlyDistribution[hour], random);
      for (let occurrence = 0; occurrence < hourlyCount; occurrence += 1) {
        const patientType = random() < scenario.demandProfile.inpatientFraction ? "INPATIENT" : "OUTPATIENT";
        const urgent = random() < scenario.demandProfile.urgentFraction;
        const modality = weightedChoice(scenario.serviceMix, random).modality;

        if (patientType === "OUTPATIENT" && random() < scenario.demandProfile.noShowRate) {
          continue;
        }

        const arrivalMinute = day * 24 * 60 + hour * 60 + Math.floor(random() * 60);
        events.push({
          id: `patient-${sequence}`,
          modality,
          patientType,
          urgent,
          arrivalSlot: Math.floor(arrivalMinute / SLOT_MINUTES),
          patienceDeadlineSlot: Math.floor((arrivalMinute + 15 + random() * 105) / SLOT_MINUTES)
        });
        sequence += 1;

        if (random() < scenario.demandProfile.repeatScanRate) {
          const repeatMinute = arrivalMinute + 40 + Math.floor(random() * 180);
          events.push({
            id: `patient-${sequence}`,
            modality,
            patientType,
            urgent,
            arrivalSlot: Math.floor(repeatMinute / SLOT_MINUTES),
            patienceDeadlineSlot: Math.floor((repeatMinute + 15 + random() * 105) / SLOT_MINUTES)
          });
          sequence += 1;
        }
      }
    }
  }

  return events.sort((a, b) => a.arrivalSlot - b.arrivalSlot);
}

function createPatients(events: DemandEvent[], scenario: ScenarioInput): PatientRecord[] {
  const byModality = Object.fromEntries(scenario.serviceConfigs.map((item) => [item.modality, item])) as Record<Modality, ScenarioInput["serviceConfigs"][number]>;

  return events.map((event): PatientRecord => ({
    id: event.id,
    modality: event.modality,
    patientType: event.patientType,
    urgent: event.urgent,
    arrivalSlot: event.arrivalSlot,
    patienceDeadlineSlot: event.patienceDeadlineSlot,
    mustFinishExamBySlot: event.arrivalSlot,
    registrationReadySlot: event.arrivalSlot,
    prepReadySlot: event.arrivalSlot,
    examReadySlot: event.arrivalSlot,
    reportReadySlot: event.arrivalSlot,
    resultReadySlot: event.arrivalSlot,
    completed: false,
    deferred: false,
    lostDueToWait: false,
    lostDueToResult: false,
    lostDueToUnexpectedLeave: false,
    waitToExamMinutes: 0,
    waitToResultMinutes: 0,
    revenue: byModality[event.modality].charge,
    bottleneck: "None"
  }));
}

function requiresChangingRoom(modality: Modality) {
  return modality === "CT";
}

function getExamResourceOptions(modality: Modality): ResourceKey[][] {
  if (modality === "XRAY") {
    return [
      ["rooms", "technicians", "machine:XRAY"],
      ["rooms", "technicians", "machine:PORTABLE_XRAY"]
    ];
  }

  return [["rooms", "technicians", `machine:${modality}`]];
}

function dayEndSlot(slot: number) {
  return Math.ceil(((slotToDay(slot) + 1) * 24 * 60) / SLOT_MINUTES);
}

function calculateMaximumRevenue(env: ResourceEnvironment, scenario: ScenarioInput, serviceLookup: Record<Modality, ScenarioInput["serviceConfigs"][number]>) {
  let maximumRevenue = 0;

  for (const modality of MODALITIES) {
    const service = serviceLookup[modality];
    const cycleSlots = toSlots(service.examDurationMinutes + service.cleanupMinutes);
    const machineSlots = env.utilization.machineCapacity[modality];
    if (cycleSlots > 0) {
      maximumRevenue += (machineSlots / cycleSlots) * service.charge;
    }
  }

  return maximumRevenue;
}

function findBottleneck(scenario: ScenarioInput, modality: Modality) {
  const machineCount = getMachineCount(scenario, modality);
  if (machineCount <= 1) {
    return `${MODALITY_LABELS[modality]} machines`;
  }
  if (scenario.resourceConfig.radiologists <= 2) {
    return "radiologists";
  }
  if (scenario.resourceConfig.technicians <= 3) {
    return "technicians";
  }
  return "rooms";
}

export function runSimulation(scenario: ScenarioInput, horizonDays: number, seed: number) {
  const env = createEnvironment(scenario, horizonDays);
  const events = generateDemand(scenario, horizonDays, seed);
  const patients = createPatients(events, scenario);
  const random = createSeededRandom(seed + 17);
  const serviceLookup = Object.fromEntries(scenario.serviceConfigs.map((item) => [item.modality, item])) as Record<Modality, ScenarioInput["serviceConfigs"][number]>;

  const registrationResult = assignStage(env, patients.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: patient.arrivalSlot,
    priority: 0,
    durationSlots: 1,
    resources: ["supportStaff"]
  })), false);

  for (const patient of patients) {
    const regStart = registrationResult.starts.get(patient.id) ?? patient.arrivalSlot;
    patient.registrationReadySlot = regStart + 1;
  }

  for (const patient of patients) {
    if (random() < scenario.demandProfile.unexpectedLeaveRate) {
      patient.deferred = true;
      patient.lostDueToUnexpectedLeave = true;
      patient.bottleneck = "unexpected leave";
    }
  }

  const activePatients = patients.filter((patient) => !patient.deferred);

  const prepResult = assignStage(env, activePatients.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: patient.registrationReadySlot,
    priority: patient.urgent ? 2 : patient.patientType === "INPATIENT" ? 1 : 0,
    durationSlots: toSlots(serviceLookup[patient.modality].prepDurationMinutes || SLOT_MINUTES),
    resources:
      serviceLookup[patient.modality].prepDurationMinutes > 0
        ? requiresChangingRoom(patient.modality)
          ? ["supportStaff", "changingRooms"]
          : ["supportStaff"]
        : ["supportStaff"]
  })));

  for (const patient of activePatients) {
    const prepDurationSlots = toSlots(serviceLookup[patient.modality].prepDurationMinutes || SLOT_MINUTES);
    const start = prepResult.starts.get(patient.id) ?? patient.registrationReadySlot;
    patient.prepReadySlot = start + prepDurationSlots;
  }

  for (const patient of activePatients) {
    const examDurationSlots = toSlots(serviceLookup[patient.modality].examDurationMinutes + serviceLookup[patient.modality].cleanupMinutes);
    patient.mustFinishExamBySlot = Math.min(patient.patienceDeadlineSlot, dayEndSlot(patient.arrivalSlot) - examDurationSlots);
  }

  const examResult = assignFlexibleStage(env, activePatients.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: patient.prepReadySlot,
    priority: patient.urgent ? 3 : patient.patientType === "INPATIENT" ? 2 : 1,
    durationSlots: toSlots(serviceLookup[patient.modality].examDurationMinutes + serviceLookup[patient.modality].cleanupMinutes),
    resourceOptions: getExamResourceOptions(patient.modality),
    deadlineSlot: patient.mustFinishExamBySlot
  })));

  for (const patient of activePatients) {
    const examDurationSlots = toSlots(serviceLookup[patient.modality].examDurationMinutes + serviceLookup[patient.modality].cleanupMinutes);
    const examStart = examResult.starts.get(patient.id);

    if (examStart === undefined || examStart >= env.totalSlots - examDurationSlots || examResult.missed.has(patient.id)) {
      patient.deferred = true;
      patient.lostDueToWait = true;
      patient.bottleneck = findBottleneck(scenario, patient.modality);
      continue;
    }

    patient.examReadySlot = examStart + examDurationSlots;
    patient.waitToExamMinutes = Math.max(0, (examStart - patient.arrivalSlot) * SLOT_MINUTES);
  }

  const reportCandidates = patients.filter((patient) => !patient.deferred);
  const reportResult = assignStage(env, reportCandidates.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: patient.examReadySlot,
    priority: patient.urgent ? 3 : patient.patientType === "INPATIENT" ? 2 : 1,
    durationSlots: toSlots(serviceLookup[patient.modality].reportingMinutes),
    resources: ["radiologists"]
  })));

  const communicationCandidates = reportCandidates.filter((patient) => reportResult.starts.has(patient.id));
  const communicationResult = assignStage(env, communicationCandidates.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: (reportResult.starts.get(patient.id) ?? patient.examReadySlot) + toSlots(serviceLookup[patient.modality].reportingMinutes),
    priority: patient.patientType === "INPATIENT" ? 1 : 0,
    durationSlots: toSlots(scenario.demandProfile.resultCommunicationMinutes || SLOT_MINUTES),
    resources: ["supportStaff"]
  })), false);

  for (const patient of reportCandidates) {
    const reportStart = reportResult.starts.get(patient.id);
    if (reportStart === undefined || reportResult.missed.has(patient.id)) {
      patient.deferred = true;
      patient.lostDueToResult = true;
      patient.bottleneck = "radiologists";
      continue;
    }

    const reportEnd = reportStart + toSlots(serviceLookup[patient.modality].reportingMinutes);
    const communicationStart = communicationResult.starts.get(patient.id) ?? reportEnd;
    patient.reportReadySlot = reportEnd;
    patient.resultReadySlot = communicationStart + toSlots(scenario.demandProfile.resultCommunicationMinutes || SLOT_MINUTES);
    patient.waitToResultMinutes = Math.max(0, (patient.resultReadySlot - patient.examReadySlot) * SLOT_MINUTES);
    patient.completed =
      patient.resultReadySlot < env.totalSlots &&
      patient.resultReadySlot <= patient.arrivalSlot + toSlots(24 * 60) &&
      patient.examReadySlot <= dayEndSlot(patient.arrivalSlot);
    if (!patient.completed) {
      patient.lostDueToResult = true;
    }
    patient.bottleneck = patient.waitToResultMinutes - patient.waitToExamMinutes > 90 ? "radiologists" : findBottleneck(scenario, patient.modality);
  }

  const completedPatients = patients.filter((patient) => patient.completed && !patient.deferred && slotToDay(patient.examReadySlot) < horizonDays);
  const deferredPatients = patients.filter((patient) => patient.deferred || !patient.completed || slotToDay(patient.examReadySlot) >= horizonDays);

  const waits = completedPatients.map((patient) => patient.waitToExamMinutes);
  const resultWaits = completedPatients.map((patient) => patient.waitToResultMinutes);
  const possibleRevenue = patients.reduce((sum, patient) => sum + patient.revenue, 0);
  const actualRevenue = completedPatients.reduce((sum, patient) => sum + patient.revenue, 0);
  const lostRevenueDueToWait = patients.filter((patient) => patient.lostDueToWait).reduce((sum, patient) => sum + patient.revenue, 0);
  const lostRevenueDueToResult = patients.filter((patient) => !patient.lostDueToWait && patient.lostDueToResult).reduce((sum, patient) => sum + patient.revenue, 0);
  const lostRevenueDueToUnexpectedLeave = patients.filter((patient) => patient.lostDueToUnexpectedLeave).reduce((sum, patient) => sum + patient.revenue, 0);
  const maximumRevenue = calculateMaximumRevenue(env, scenario, serviceLookup);
  const inpatientPatients = completedPatients.filter((patient) => patient.patientType === "INPATIENT");
  const outpatientPatients = completedPatients.filter((patient) => patient.patientType === "OUTPATIENT");

  const summary: SimulationSummary = {
    horizonDays,
    seed,
    possibleRevenue,
    maximumRevenue,
    actualRevenue,
    lostRevenue: possibleRevenue - actualRevenue,
    lostRevenueDueToWait,
    lostRevenueDueToResult,
    lostRevenueDueToUnexpectedLeave,
    completedPatients: completedPatients.length,
    deferredPatients: deferredPatients.length,
    averageWaitMinutes: average(waits),
    averageResultMinutes: average(resultWaits),
    p50WaitMinutes: percentile(waits, 0.5),
    p90WaitMinutes: percentile(waits, 0.9),
    p50ResultMinutes: percentile(resultWaits, 0.5),
    p90ResultMinutes: percentile(resultWaits, 0.9),
    p95WaitMinutes: percentile(waits, 0.95),
    machineUtilization:
      average(
        MODALITIES.map((modality) =>
          env.utilization.machineCapacity[modality] === 0
            ? 0
            : env.stats.occupiedMachines[modality] / env.utilization.machineCapacity[modality]
        )
      ) * 100,
    technicianUtilization:
      env.utilization.technicianCapacity === 0 ? 0 : (env.stats.occupiedTechnicians / env.utilization.technicianCapacity) * 100,
    radiologistUtilization:
      env.utilization.radiologistCapacity === 0 ? 0 : (env.stats.occupiedRadiologists / env.utilization.radiologistCapacity) * 100,
    roomUtilization: env.utilization.roomCapacity === 0 ? 0 : (env.stats.occupiedRooms / env.utilization.roomCapacity) * 100,
    changingRoomUtilization:
      env.utilization.changingRoomCapacity === 0 ? 0 : (env.stats.occupiedChangingRooms / env.utilization.changingRoomCapacity) * 100,
    bottleneck: (() => {
      const counts = new Map<string, number>();
      for (const patient of patients) {
        counts.set(patient.bottleneck, (counts.get(patient.bottleneck) ?? 0) + 1);
      }
      return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None";
    })()
  };

  const metrics: RunMetric[] = [
    { modality: "ALL", metricName: "averageWaitMinutes", metricValue: summary.averageWaitMinutes },
    { modality: "ALL", metricName: "averageResultMinutes", metricValue: summary.averageResultMinutes },
    { modality: "ALL", metricName: "possibleRevenue", metricValue: summary.possibleRevenue },
    { modality: "ALL", metricName: "maximumRevenue", metricValue: summary.maximumRevenue },
    { modality: "ALL", metricName: "actualRevenue", metricValue: summary.actualRevenue },
    { modality: "ALL", metricName: "lostRevenue", metricValue: summary.lostRevenue },
    { modality: "ALL", metricName: "lostRevenueDueToWait", metricValue: summary.lostRevenueDueToWait },
    { modality: "ALL", metricName: "lostRevenueDueToResult", metricValue: summary.lostRevenueDueToResult },
    { modality: "ALL", metricName: "lostRevenueDueToUnexpectedLeave", metricValue: summary.lostRevenueDueToUnexpectedLeave },
    { modality: "ALL", metricName: "completedPatients", metricValue: summary.completedPatients },
    { modality: "ALL", metricName: "deferredPatients", metricValue: summary.deferredPatients },
    { modality: "ALL", metricName: "p50WaitMinutes", metricValue: summary.p50WaitMinutes },
    { modality: "ALL", metricName: "p90WaitMinutes", metricValue: summary.p90WaitMinutes },
    { modality: "ALL", metricName: "p50ResultMinutes", metricValue: summary.p50ResultMinutes },
    { modality: "ALL", metricName: "p90ResultMinutes", metricValue: summary.p90ResultMinutes },
    { modality: "ALL", metricName: "p95WaitMinutes", metricValue: summary.p95WaitMinutes },
    { modality: "ALL", metricName: "machineUtilization", metricValue: summary.machineUtilization },
    { modality: "ALL", metricName: "technicianUtilization", metricValue: summary.technicianUtilization },
    { modality: "ALL", metricName: "radiologistUtilization", metricValue: summary.radiologistUtilization },
    { modality: "ALL", metricName: "roomUtilization", metricValue: summary.roomUtilization },
    { modality: "ALL", metricName: "changingRoomUtilization", metricValue: summary.changingRoomUtilization },
    { modality: "ALL", metricName: "inpatientAverageWaitMinutes", metricValue: average(inpatientPatients.map((patient) => patient.waitToExamMinutes)) },
    { modality: "ALL", metricName: "outpatientAverageWaitMinutes", metricValue: average(outpatientPatients.map((patient) => patient.waitToExamMinutes)) },
    { modality: "ALL", metricName: "inpatientAverageResultMinutes", metricValue: average(inpatientPatients.map((patient) => patient.waitToResultMinutes)) },
    { modality: "ALL", metricName: "outpatientAverageResultMinutes", metricValue: average(outpatientPatients.map((patient) => patient.waitToResultMinutes)) }
  ];

  for (const modality of MODALITIES) {
    const subset = completedPatients.filter((patient) => patient.modality === modality);
    const modalityRevenue = subset.reduce((sum, patient) => sum + patient.revenue, 0);
    metrics.push(
      { modality, metricName: "throughput", metricValue: subset.length },
      { modality, metricName: "revenue", metricValue: modalityRevenue },
      { modality, metricName: "averageWaitMinutes", metricValue: average(subset.map((patient) => patient.waitToExamMinutes)) },
      { modality, metricName: "averageResultMinutes", metricValue: average(subset.map((patient) => patient.waitToResultMinutes)) },
      {
        modality,
        metricName: "machineUtilization",
        metricValue:
          env.utilization.machineCapacity[modality] === 0 ? 0 : (env.stats.occupiedMachines[modality] / env.utilization.machineCapacity[modality]) * 100
      }
    );
  }

  const snapshots: DailySnapshot[] = [];
  for (let day = 0; day < horizonDays; day += 1) {
    const dayPatients = completedPatients.filter((patient) => slotToDay(patient.examReadySlot) === day);
    const dayDeferred = deferredPatients.filter((patient) => slotToDay(patient.arrivalSlot) === day);
    const dayWaits = dayPatients.map((patient) => patient.waitToExamMinutes);
    const dayResults = dayPatients.map((patient) => patient.waitToResultMinutes);

    const allSnapshot: DailySnapshot = {
      dayIndex: day,
      modality: "ALL",
      throughput: dayPatients.length,
      completedPatients: dayPatients.length,
      deferredPatients: dayDeferred.length,
      revenue: dayPatients.reduce((sum, patient) => sum + patient.revenue, 0),
      averageWaitMinutes: average(dayWaits),
      averageResultMinutes: average(dayResults),
      p90WaitMinutes: percentile(dayWaits, 0.9),
      queuePeak: env.stats.queuePeak,
      machineUtilization: summary.machineUtilization,
      technicianUtilization: summary.technicianUtilization,
      radiologistUtilization: summary.radiologistUtilization,
      roomUtilization: summary.roomUtilization,
      changingRoomUtilization: summary.changingRoomUtilization
    };
    snapshots.push(allSnapshot);

    for (const modality of MODALITIES) {
      const subset = dayPatients.filter((patient) => patient.modality === modality);
      const waitsForModality = subset.map((patient) => patient.waitToExamMinutes);
      const resultsForModality = subset.map((patient) => patient.waitToResultMinutes);
      snapshots.push({
        dayIndex: day,
        modality,
        throughput: subset.length,
        completedPatients: subset.length,
        deferredPatients: dayDeferred.filter((patient) => patient.modality === modality).length,
        revenue: subset.reduce((sum, patient) => sum + patient.revenue, 0),
        averageWaitMinutes: average(waitsForModality),
        averageResultMinutes: average(resultsForModality),
        p90WaitMinutes: percentile(waitsForModality, 0.9),
        queuePeak: env.stats.queuePeak,
        machineUtilization:
          env.utilization.machineCapacity[modality] === 0 ? 0 : (env.stats.occupiedMachines[modality] / env.utilization.machineCapacity[modality]) * 100,
        technicianUtilization: summary.technicianUtilization,
        radiologistUtilization: summary.radiologistUtilization,
        roomUtilization: summary.roomUtilization,
        changingRoomUtilization: summary.changingRoomUtilization
      });
    }
  }

  return { summary, metrics, snapshots };
}
