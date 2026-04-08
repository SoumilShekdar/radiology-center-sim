import { MODALITIES, MODALITY_LABELS, SLOT_MINUTES, type Modality, type PatientGender, type PatientType } from "@/lib/constants";
import { createSeededRandom, samplePoisson, weightedChoice } from "@/lib/random";
import type { DailySnapshot, RunMetric, ScenarioInput, SimulationSummary } from "@/lib/types";

type ResourceKey =
  | "supportStaff"
  | "technicians"
  | "radiologists"
  | `machine:${Modality}`
  | `room:${string}`
  | `changingRoom:${string}`;

type PatientRecord = {
  id: string;
  modality: Modality;
  patientType: PatientType;
  gender: PatientGender;
  scheduled: boolean;
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
  prepDurationSlots: number;
  examDurationSlots: number;
  reportingDurationSlots: number;
  communicationDurationSlots: number;
};

type DemandEvent = {
  id: string;
  modality: Modality;
  patientType: PatientType;
  gender: PatientGender;
  urgent: boolean;
  arrivalSlot: number;
  patienceDeadlineSlot: number;
  scheduled: boolean;
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
  queuePeakByDay: Int16Array;
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
const DOWNTIME_BLOCK_MAX_SLOTS = Math.ceil(120 / SLOT_MINUTES);

function toSlots(minutes: number, minimumSlots = 1) {
  return Math.max(minimumSlots, Math.ceil(minutes / SLOT_MINUTES));
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

function sampleBinomial(trials: number, probability: number, random: () => number) {
  if (trials <= 0 || probability <= 0) {
    return 0;
  }
  if (probability >= 1) {
    return trials;
  }

  let successes = 0;
  for (let attempt = 0; attempt < trials; attempt += 1) {
    if (random() < probability) {
      successes += 1;
    }
  }
  return successes;
}

function sampleStandardNormal(random: () => number) {
  const u1 = Math.max(random(), 1e-12);
  const u2 = random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function sampleLogNormalMinutes(meanMinutes: number, coefficientOfVariation: number, random: () => number) {
  if (meanMinutes <= 0) {
    return 0;
  }

  const safeCv = Math.max(0.01, coefficientOfVariation);
  const sigmaSquared = Math.log(1 + safeCv * safeCv);
  const sigma = Math.sqrt(sigmaSquared);
  const mu = Math.log(meanMinutes) - sigmaSquared / 2;
  return Math.exp(mu + sigma * sampleStandardNormal(random));
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

function isRoomResource(resource: ResourceKey): resource is `room:${string}` {
  return resource.startsWith("room:");
}

function isChangingRoomResource(resource: ResourceKey): resource is `changingRoom:${string}` {
  return resource.startsWith("changingRoom:");
}

function isWithinOperatingHours(scenario: ScenarioInput, slot: number) {
  const minute = slot * SLOT_MINUTES;
  const dayIndex = Math.floor(minute / (60 * 24));
  const hour = Math.floor((minute % (60 * 24)) / 60);
  const dow = dayIndex % 7;
  const operating = scenario.operatingHours[dow];
  return operating.enabled && hour >= operating.openHour && hour < operating.closeHour;
}

function getStageVariability(modality: Modality, stage: "prep" | "exam" | "reporting" | "communication") {
  if (stage === "prep") {
    return modality === "MRI" ? 0.3 : modality === "CT" ? 0.25 : 0.18;
  }
  if (stage === "exam") {
    switch (modality) {
      case "MRI":
        return 0.3;
      case "ULTRASOUND":
        return 0.28;
      case "CT":
        return 0.22;
      case "PORTABLE_XRAY":
        return 0.2;
      case "XRAY":
        return 0.16;
    }
  }
  if (stage === "reporting") {
    return modality === "MRI" ? 0.28 : modality === "CT" ? 0.24 : 0.2;
  }

  return 0.12;
}

function sampleStageDurationSlots(
  modality: Modality,
  meanMinutes: number,
  stage: "prep" | "exam" | "reporting" | "communication",
  random: () => number,
  minimumSlots = 1
) {
  if (meanMinutes <= 0) {
    return 0;
  }

  const sampledMinutes = sampleLogNormalMinutes(meanMinutes, getStageVariability(modality, stage), random);
  const boundedMinutes = Math.max(meanMinutes * 0.35, sampledMinutes);
  return toSlots(boundedMinutes, minimumSlots);
}

function samplePatienceWindowMinutes(
  event: Pick<DemandEvent, "modality" | "patientType" | "urgent">,
  scenario: ScenarioInput,
  random: () => number
) {
  const base =
    event.patientType === "INPATIENT"
      ? event.urgent
        ? 300
        : 210
      : event.urgent
        ? 210
        : 110;

  const modalityAdjustment =
    event.modality === "MRI"
      ? 40
      : event.modality === "CT"
        ? 20
        : event.modality === "PORTABLE_XRAY"
          ? -10
          : 0;

  const disruptionPenalty = scenario.demandProfile.unexpectedLeaveRate * 80;
  const sampled = sampleLogNormalMinutes(base + modalityAdjustment, 0.35, random) - disruptionPenalty;
  return Math.max(20, Math.min(8 * 60, sampled));
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
      capacity = Math.max(0, Math.round(scenario.resourceConfig.radiologists * getCoverageAtHour(scenario.staffRotation.radiologists, hour)));
    } else if (isRoomResource(resource) || isChangingRoomResource(resource)) {
      capacity = withinHours ? 1 : 0;
    } else {
      const modality = resource.replace("machine:", "") as Modality;
      capacity = withinHours ? getMachineCount(scenario, modality) : 0;
    }

    values[slot] = capacity;
  }

  return values;
}

function buildMachineCapacityArray(
  scenario: ScenarioInput,
  totalSlots: number,
  modality: Modality,
  random: () => number
) {
  const values = new Int16Array(totalSlots);
  const machineCount = getMachineCount(scenario, modality);

  for (let slot = 0; slot < totalSlots; slot += 1) {
    values[slot] = isWithinOperatingHours(scenario, slot) ? machineCount : 0;
  }

  if (machineCount === 0 || scenario.downtimeRate <= 0) {
    return values;
  }

  const days = Math.ceil(totalSlots / Math.ceil((24 * 60) / SLOT_MINUTES));

  for (let day = 0; day < days; day += 1) {
    const openSlots: number[] = [];
    const dayStart = Math.floor((day * 24 * 60) / SLOT_MINUTES);
    const dayEnd = Math.min(totalSlots, Math.floor(((day + 1) * 24 * 60) / SLOT_MINUTES));

    for (let slot = dayStart; slot < dayEnd; slot += 1) {
      if (isWithinOperatingHours(scenario, slot)) {
        openSlots.push(slot);
      }
    }

    if (openSlots.length === 0) {
      continue;
    }

    for (let machine = 0; machine < machineCount; machine += 1) {
      const unavailable = new Set<number>();
      const targetDowntimeSlots = sampleBinomial(openSlots.length, scenario.downtimeRate, random);

      while (unavailable.size < targetDowntimeSlots) {
        const remaining = targetDowntimeSlots - unavailable.size;
        const blockLength = Math.min(
          remaining,
          Math.max(1, Math.floor(random() * Math.min(DOWNTIME_BLOCK_MAX_SLOTS, remaining)) + 1)
        );
        const startIndex = Math.floor(random() * openSlots.length);

        for (let offset = 0; offset < blockLength && startIndex + offset < openSlots.length; offset += 1) {
          unavailable.add(openSlots[startIndex + offset]);
        }
      }

      for (const slot of unavailable) {
        values[slot] = Math.max(0, values[slot] - 1);
      }
    }
  }

  return values;
}

function createEnvironment(scenario: ScenarioInput, horizonDays: number, seed: number): ResourceEnvironment {
  const horizonSlots = Math.ceil((horizonDays * 24 * 60) / SLOT_MINUTES);
  const totalSlots = horizonSlots + Math.ceil((REPORT_TAIL_DAYS * 24 * 60) / SLOT_MINUTES);
  const downtimeRandom = createSeededRandom(seed + 911);
  const roomKeys = scenario.workflowConfig.roomConfigs.map((room) => `room:${room.id}` as const);
  const changingRoomKeys = scenario.workflowConfig.changingRoomConfigs.map((room) => `changingRoom:${room.id}` as const);
  const keys: ResourceKey[] = [
    "supportStaff",
    "technicians",
    "radiologists",
    ...roomKeys,
    ...changingRoomKeys,
    ...MODALITIES.map((modality) => `machine:${modality}` as const)
  ];

  const capacity = Object.fromEntries(keys.map((key) => {
    if (key.startsWith("machine:")) {
      const modality = key.replace("machine:", "") as Modality;
      return [key, buildMachineCapacityArray(scenario, totalSlots, modality, downtimeRandom)];
    }
    return [key, buildCapacityArray(scenario, totalSlots, key)];
  })) as Record<ResourceKey, Int16Array>;
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
    utilization.technicianCapacity += capacity.technicians[slot];
    utilization.radiologistCapacity += capacity.radiologists[slot];
    for (const roomKey of roomKeys) {
      utilization.roomCapacity += capacity[roomKey][slot];
    }
    for (const changingRoomKey of changingRoomKeys) {
      utilization.changingRoomCapacity += capacity[changingRoomKey][slot];
    }
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
      queuePeakByDay: new Int16Array(horizonDays),
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
        } else if (isChangingRoomResource(resource)) {
          env.stats.occupiedChangingRooms += 1;
        } else if (isRoomResource(resource)) {
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
    if (slot < env.horizonSlots) {
      const dayIndex = slotToDay(slot);
      env.stats.queuePeakByDay[dayIndex] = Math.max(env.stats.queuePeakByDay[dayIndex], activeQueue.length);
    }

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
    if (slot < env.horizonSlots) {
      const dayIndex = slotToDay(slot);
      env.stats.queuePeakByDay[dayIndex] = Math.max(env.stats.queuePeakByDay[dayIndex], activeQueue.length);
    }

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
  const hourlyWeights = scenario.demandProfile.hourlyDistribution.map((weight, hour) => ({ hour, weight }));

  for (let day = 0; day < horizonDays; day += 1) {
    const dow = day % 7;
    let spikeMultiplier = 1;
    let forceUrgent = false;
    if (scenario.demandProfile.traumaSpikeProbability > 0 && random() < scenario.demandProfile.traumaSpikeProbability) {
      spikeMultiplier = scenario.demandProfile.traumaSpikeMultiplier;
      forceUrgent = true;
    }

    const totalPatients = samplePoisson(
      scenario.demandProfile.baseDailyPatients * scenario.demandProfile.dayOfWeekMultiplier[dow] * spikeMultiplier,
      random
    );

    for (let patientIndex = 0; patientIndex < totalPatients; patientIndex += 1) {
      const hour = weightedChoice(hourlyWeights, random).hour;
      const patientType = random() < scenario.demandProfile.inpatientFraction ? "INPATIENT" : "OUTPATIENT";
      const gender = random() < scenario.demandProfile.femaleFraction ? "FEMALE" : "MALE";
      const urgent = forceUrgent || random() < scenario.demandProfile.urgentFraction;
      const modality = weightedChoice(scenario.serviceMix, random).modality;
      const scheduled =
        scenario.appointmentPolicy.enabled &&
        patientType === "OUTPATIENT" &&
        !urgent &&
        random() < scenario.appointmentPolicy.outpatientScheduledFraction;

      if (patientType === "OUTPATIENT" && random() < scenario.demandProfile.noShowRate) {
        continue;
      }

      const scheduledMinute = day * 24 * 60 + hour * 60 + 30;
      const variance = Math.round((random() * 2 - 1) * scenario.appointmentPolicy.arrivalVarianceMinutes);
      const arrivalMinute = scheduled
        ? Math.max(day * 24 * 60, scheduledMinute - scenario.appointmentPolicy.earlyArrivalMinutes + variance)
        : day * 24 * 60 + hour * 60 + Math.floor(random() * 60);
      events.push({
        id: `patient-${sequence}`,
        modality,
        patientType,
        gender,
        urgent,
        arrivalSlot: Math.floor(arrivalMinute / SLOT_MINUTES),
        patienceDeadlineSlot: Math.floor((arrivalMinute + samplePatienceWindowMinutes({ modality, patientType, urgent }, scenario, random)) / SLOT_MINUTES),
        scheduled
      });
      sequence += 1;

      if (random() < scenario.demandProfile.repeatScanRate) {
        const repeatMinute = arrivalMinute + 40 + Math.floor(random() * 180);
        events.push({
          id: `patient-${sequence}`,
          modality,
          patientType,
          gender,
          urgent,
          arrivalSlot: Math.floor(repeatMinute / SLOT_MINUTES),
          patienceDeadlineSlot: Math.floor((repeatMinute + samplePatienceWindowMinutes({ modality, patientType, urgent }, scenario, random)) / SLOT_MINUTES),
          scheduled: false
        });
        sequence += 1;
      }
    }
  }

  return events.sort((a, b) => a.arrivalSlot - b.arrivalSlot);
}

function createPatients(events: DemandEvent[], scenario: ScenarioInput, random: () => number): PatientRecord[] {
  const byModality = Object.fromEntries(scenario.serviceConfigs.map((item) => [item.modality, item])) as Record<Modality, ScenarioInput["serviceConfigs"][number]>;

  return events.map((event): PatientRecord => {
    const service = byModality[event.modality];
    return {
      id: event.id,
      modality: event.modality,
      patientType: event.patientType,
      gender: event.gender,
      scheduled: event.scheduled,
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
      revenue: service.charge,
      bottleneck: "None",
      prepDurationSlots: sampleStageDurationSlots(event.modality, service.prepDurationMinutes, "prep", random, 0),
      examDurationSlots: sampleStageDurationSlots(event.modality, service.examDurationMinutes + service.cleanupMinutes, "exam", random),
      reportingDurationSlots: sampleStageDurationSlots(event.modality, service.reportingMinutes, "reporting", random),
      communicationDurationSlots: sampleStageDurationSlots(
        event.modality,
        scenario.demandProfile.resultCommunicationMinutes,
        "communication",
        random,
        0
      )
    };
  });
}

function requiresChangingRoom(scenario: ScenarioInput, modality: Modality) {
  return scenario.workflowConfig.changingRoomByModality[modality];
}

function getChangingRoomResourceOptions(scenario: ScenarioInput, modality: Modality, gender: PatientGender): ResourceKey[][] {
  if (!requiresChangingRoom(scenario, modality)) {
    return [["supportStaff" as ResourceKey]];
  }

  const options = scenario.workflowConfig.changingRoomConfigs
    .filter((room) => room.gender === "UNISEX" || room.gender === gender)
    .map((room) => ["supportStaff" as ResourceKey, `changingRoom:${room.id}` as ResourceKey]);

  return options.length > 0 ? options : [["supportStaff" as ResourceKey]];
}

function getExamResourceOptions(scenario: ScenarioInput, modality: Modality): ResourceKey[][] {
  const compatibleRooms = scenario.workflowConfig.roomConfigs.filter((room) => {
    if (modality === "PORTABLE_XRAY") {
      return false;
    }
    if (!room.supportedModalities.includes(modality)) {
      return false;
    }
    return room.dedicatedModality === "NONE" || room.dedicatedModality === modality;
  });

  const roomOptions = compatibleRooms.map((room) => [`room:${room.id}` as ResourceKey, "technicians" as ResourceKey]);

  if (modality === "XRAY") {
    const xrayRoomOptions = roomOptions.map((option) => [...option, "machine:XRAY" as ResourceKey] as ResourceKey[]);
    const portableOptions = roomOptions.map((option) => [...option, "machine:PORTABLE_XRAY" as ResourceKey] as ResourceKey[]);
    return [...xrayRoomOptions, ...portableOptions];
  }

  if (modality === "PORTABLE_XRAY") {
    return [["technicians", "machine:PORTABLE_XRAY"]];
  }

  return roomOptions.map((option) => [...option, `machine:${modality}` as ResourceKey] as ResourceKey[]);
}

function resourceLabel(resource: ResourceKey) {
  if (resource.startsWith("machine:")) {
    return `${MODALITY_LABELS[resource.replace("machine:", "") as Modality]} machines`;
  }

  switch (resource) {
    case "supportStaff":
      return "support staff";
    case "technicians":
      return "technicians";
    case "radiologists":
      return "radiologists";
  }

  if (isRoomResource(resource)) {
    return "rooms";
  }

  if (isChangingRoomResource(resource)) {
    return "changing rooms";
  }

  return "None";
}

function inferFlexibleStageBottleneck(
  env: ResourceEnvironment,
  readySlot: number,
  deadlineSlot: number,
  durationSlots: number,
  options: ResourceKey[][]
) {
  const counts = new Map<ResourceKey, number>();
  const finalStart = Math.max(readySlot, deadlineSlot);

  for (let start = readySlot; start <= finalStart; start += 1) {
    for (const option of options) {
      if (canSchedule(env, start, durationSlots, option)) {
        return "None";
      }

      const blockers = new Set<ResourceKey>();
      for (let offset = 0; offset < durationSlots; offset += 1) {
        const slot = start + offset;
        if (slot >= env.totalSlots) {
          for (const resource of option) {
            blockers.add(resource);
          }
          break;
        }

        for (const resource of option) {
          if (env.capacity[resource][slot] <= env.occupancy[resource][slot]) {
            blockers.add(resource);
          }
        }
      }

      for (const blocker of blockers) {
        counts.set(blocker, (counts.get(blocker) ?? 0) + 1);
      }
    }
  }

  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return top ? resourceLabel(top) : "None";
}

function utilizationForResource(
  occupancy: Int16Array,
  capacity: Int16Array,
  startSlot: number,
  endSlot: number
) {
  let occupied = 0;
  let available = 0;
  for (let slot = startSlot; slot < endSlot; slot += 1) {
    occupied += occupancy[slot];
    available += capacity[slot];
  }

  return available === 0 ? 0 : (occupied / available) * 100;
}

function utilizationForResources(
  env: ResourceEnvironment,
  resources: ResourceKey[],
  startSlot: number,
  endSlot: number
) {
  let occupied = 0;
  let available = 0;

  for (const resource of resources) {
    for (let slot = startSlot; slot < endSlot; slot += 1) {
      occupied += env.occupancy[resource][slot];
      available += env.capacity[resource][slot];
    }
  }

  return available === 0 ? 0 : (occupied / available) * 100;
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
  const env = createEnvironment(scenario, horizonDays, seed);
  const events = generateDemand(scenario, horizonDays, seed);
  const random = createSeededRandom(seed + 17);
  const patients = createPatients(events, scenario, random);
  const serviceLookup = Object.fromEntries(scenario.serviceConfigs.map((item) => [item.modality, item])) as Record<Modality, ScenarioInput["serviceConfigs"][number]>;
  const bottleneckSignals = new Map<string, number>();

  const noteBottleneck = (label: string) => {
    if (label === "None") {
      return;
    }
    bottleneckSignals.set(label, (bottleneckSignals.get(label) ?? 0) + 1);
  };

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
    const registrationWaitMinutes = Math.max(0, (patient.registrationReadySlot - patient.arrivalSlot) * SLOT_MINUTES);
    const leaveRisk = Math.min(
      0.95,
      scenario.demandProfile.unexpectedLeaveRate *
        (1 + registrationWaitMinutes / 45) *
        (patient.patientType === "OUTPATIENT" ? (patient.scheduled ? 1.35 : 1.2) : 0.8) *
        (patient.urgent ? 0.5 : 1)
    );
    if (random() < leaveRisk) {
      patient.deferred = true;
      patient.lostDueToUnexpectedLeave = true;
      patient.bottleneck = "unexpected leave";
    }
  }

  const activePatients = patients.filter((patient) => !patient.deferred);

  const prepSimplePatients = activePatients.filter((patient) => patient.prepDurationSlots > 0 && !requiresChangingRoom(scenario, patient.modality));
  const prepChangingPatients = activePatients.filter((patient) => patient.prepDurationSlots > 0 && requiresChangingRoom(scenario, patient.modality));

  const prepResult = assignStage(env, prepSimplePatients.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: patient.registrationReadySlot,
    priority: patient.urgent ? 2 : patient.patientType === "INPATIENT" ? 1 : 0,
    durationSlots: patient.prepDurationSlots,
    resources: ["supportStaff"]
  })));

  const prepChangingResult = assignFlexibleStage(env, prepChangingPatients.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: patient.registrationReadySlot,
    priority: patient.urgent ? 2 : patient.patientType === "INPATIENT" ? 1 : 0,
    durationSlots: patient.prepDurationSlots,
    resourceOptions: getChangingRoomResourceOptions(scenario, patient.modality, patient.gender),
    deadlineSlot: patient.patienceDeadlineSlot
  })));

  for (const patient of activePatients) {
    const prepDurationSlots = patient.prepDurationSlots;
    if (prepDurationSlots === 0) {
      patient.prepReadySlot = patient.registrationReadySlot;
      continue;
    }

    const start = prepResult.starts.get(patient.id) ?? prepChangingResult.starts.get(patient.id);
    if (start === undefined || prepChangingResult.missed.has(patient.id)) {
      patient.deferred = true;
      patient.lostDueToWait = true;
      patient.bottleneck = requiresChangingRoom(scenario, patient.modality) ? "changing rooms" : "support staff";
      noteBottleneck(patient.bottleneck);
      continue;
    }

    patient.prepReadySlot = start + prepDurationSlots;
  }

  const examCandidates = activePatients.filter((patient) => !patient.deferred);

  for (const patient of examCandidates) {
    const examDurationSlots = patient.examDurationSlots;
    patient.mustFinishExamBySlot = Math.min(patient.patienceDeadlineSlot, dayEndSlot(patient.arrivalSlot) - examDurationSlots);
  }

  const examResult = assignFlexibleStage(env, examCandidates.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: patient.prepReadySlot,
    priority: patient.urgent ? 3 : patient.patientType === "INPATIENT" ? 2 : 1,
    durationSlots: patient.examDurationSlots,
    resourceOptions: getExamResourceOptions(scenario, patient.modality),
    deadlineSlot: patient.mustFinishExamBySlot
  })));

  for (const patient of examCandidates) {
    const examDurationSlots = patient.examDurationSlots;
    const examStart = examResult.starts.get(patient.id);

    if (examStart === undefined || examStart >= env.totalSlots - examDurationSlots || examResult.missed.has(patient.id)) {
      patient.deferred = true;
      patient.lostDueToWait = true;
      patient.bottleneck = inferFlexibleStageBottleneck(
        env,
        patient.prepReadySlot,
        patient.mustFinishExamBySlot,
        examDurationSlots,
        getExamResourceOptions(scenario, patient.modality)
      );
      noteBottleneck(patient.bottleneck);
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
    durationSlots: patient.reportingDurationSlots,
    resources: ["radiologists"]
  })));

  const communicationCandidates = reportCandidates.filter((patient) => reportResult.starts.has(patient.id));
  const communicationResult = assignStage(env, communicationCandidates.map((patient) => ({
    patientId: patient.id,
    modality: patient.modality,
    readySlot: (reportResult.starts.get(patient.id) ?? patient.examReadySlot) + patient.reportingDurationSlots,
    priority: patient.patientType === "INPATIENT" ? 1 : 0,
    durationSlots: patient.communicationDurationSlots,
    resources: ["supportStaff"]
  })), false);

  for (const patient of reportCandidates) {
    const reportStart = reportResult.starts.get(patient.id);
    if (reportStart === undefined || reportResult.missed.has(patient.id)) {
      patient.deferred = true;
      patient.lostDueToResult = true;
      patient.bottleneck = "radiologists";
      noteBottleneck(patient.bottleneck);
      continue;
    }

    const reportingSlots = patient.reportingDurationSlots;
    const communicationSlots = patient.communicationDurationSlots;
    const reportEnd = reportStart + reportingSlots;
    const communicationStart = communicationSlots === 0
      ? reportEnd
      : (communicationResult.starts.get(patient.id) ?? reportEnd);
    patient.reportReadySlot = reportEnd;
    patient.resultReadySlot = communicationStart + communicationSlots;
    patient.waitToResultMinutes = Math.max(0, (patient.resultReadySlot - patient.examReadySlot) * SLOT_MINUTES);
    patient.completed =
      patient.resultReadySlot < env.totalSlots &&
      patient.resultReadySlot <= patient.arrivalSlot + toSlots(24 * 60) &&
      patient.examReadySlot <= dayEndSlot(patient.arrivalSlot);
    if (!patient.completed) {
      patient.lostDueToResult = true;
      patient.bottleneck = communicationSlots > 0 && !communicationResult.starts.has(patient.id) ? "support staff" : "radiologists";
      noteBottleneck(patient.bottleneck);
      continue;
    }

    const examQueueMinutes = patient.waitToExamMinutes;
    const reportQueueMinutes = Math.max(0, (reportStart - patient.examReadySlot) * SLOT_MINUTES);
    const communicationQueueMinutes = Math.max(0, (communicationStart - reportEnd) * SLOT_MINUTES);
    if (reportQueueMinutes >= examQueueMinutes && reportQueueMinutes >= communicationQueueMinutes) {
      patient.bottleneck = "radiologists";
    } else if (communicationQueueMinutes >= examQueueMinutes) {
      patient.bottleneck = "support staff";
    } else {
      patient.bottleneck = findBottleneck(scenario, patient.modality);
    }
    noteBottleneck(patient.bottleneck);
  }

  const completedPatients = patients.filter((patient) => patient.completed && !patient.deferred && slotToDay(patient.examReadySlot) < horizonDays);
  const deferredPatients = patients.filter((patient) => patient.deferred || !patient.completed || slotToDay(patient.examReadySlot) >= horizonDays);

  const waits = completedPatients.map((patient) => patient.waitToExamMinutes);
  const resultWaits = completedPatients.map((patient) => patient.waitToResultMinutes);
  const possibleRevenue = patients.reduce((sum, patient) => sum + patient.revenue, 0);
  const actualRevenue = completedPatients.reduce((sum, patient) => sum + patient.revenue, 0);
  
  const totalConsumableCost = completedPatients.reduce((sum, patient) => sum + serviceLookup[patient.modality].consumableCost, 0);
  let totalMachineCost = 0;
  if (scenario.resourceConfig.machineCostModel === "LEASED") {
    totalMachineCost = horizonDays * (
      scenario.resourceConfig.xRayMachines * scenario.resourceConfig.xRayLeaseCostDaily +
      scenario.resourceConfig.ctMachines * scenario.resourceConfig.ctLeaseCostDaily +
      scenario.resourceConfig.mriMachines * scenario.resourceConfig.mriLeaseCostDaily +
      scenario.resourceConfig.portableXRayMachines * scenario.resourceConfig.portableXRayLeaseCostDaily +
      scenario.resourceConfig.ultrasoundMachines * scenario.resourceConfig.ultrasoundLeaseCostDaily
    );
  }
  const dailyStaffCost = (
    (scenario.resourceConfig.technicians || 0) * (scenario.resourceConfig.technicianSalaryDaily || 0) +
    (scenario.resourceConfig.radiologists || 0) * (scenario.resourceConfig.radiologistSalaryDaily || 0) +
    (scenario.resourceConfig.supportStaff || 0) * (scenario.resourceConfig.supportStaffSalaryDaily || 0)
  );
  const totalStaffCost = horizonDays * dailyStaffCost;
  const totalCost = totalConsumableCost + totalMachineCost + totalStaffCost;

  const lostRevenueDueToWait = patients.filter((patient) => patient.lostDueToWait).reduce((sum, patient) => sum + patient.revenue, 0);
  const lostRevenueDueToResult = patients.filter((patient) => !patient.lostDueToWait && patient.lostDueToResult).reduce((sum, patient) => sum + patient.revenue, 0);
  const lostRevenueDueToUnexpectedLeave = patients.filter((patient) => patient.lostDueToUnexpectedLeave).reduce((sum, patient) => sum + patient.revenue, 0);
  const maximumRevenue = calculateMaximumRevenue(env, scenario, serviceLookup);
  const inpatientPatients = completedPatients.filter((patient) => patient.patientType === "INPATIENT");
  const outpatientPatients = completedPatients.filter((patient) => patient.patientType === "OUTPATIENT");

  const roomResources = scenario.workflowConfig.roomConfigs.map((room) => `room:${room.id}` as ResourceKey);
  const changingRoomResources = scenario.workflowConfig.changingRoomConfigs.map((room) => `changingRoom:${room.id}` as ResourceKey);
  const snapshots: DailySnapshot[] = [];

  for (let day = 0; day < horizonDays; day += 1) {
    const dayStartSlot = Math.floor((day * 24 * 60) / SLOT_MINUTES);
    const dayEndSlotExclusive = Math.min(env.horizonSlots, Math.floor(((day + 1) * 24 * 60) / SLOT_MINUTES));
    const dayPatients = completedPatients.filter((patient) => slotToDay(patient.examReadySlot) === day);
    const dayDeferred = deferredPatients.filter((patient) => slotToDay(patient.arrivalSlot) === day);
    const dayWaits = dayPatients.map((patient) => patient.waitToExamMinutes);
    const dayResults = dayPatients.map((patient) => patient.waitToResultMinutes);
    
    const dailyMachineUtilization = average(
      MODALITIES.map((modality) =>
        utilizationForResource(
          env.occupancy[`machine:${modality}`],
          env.capacity[`machine:${modality}`],
          dayStartSlot,
          dayEndSlotExclusive
        )
      )
    );

    const dayConsumableCost = dayPatients.reduce((sum, patient) => sum + serviceLookup[patient.modality].consumableCost, 0);
    let dayMachineCostAll = 0;
    if (scenario.resourceConfig.machineCostModel === "LEASED") {
      dayMachineCostAll = (
        scenario.resourceConfig.xRayMachines * scenario.resourceConfig.xRayLeaseCostDaily +
        scenario.resourceConfig.ctMachines * scenario.resourceConfig.ctLeaseCostDaily +
        scenario.resourceConfig.mriMachines * scenario.resourceConfig.mriLeaseCostDaily +
        scenario.resourceConfig.portableXRayMachines * scenario.resourceConfig.portableXRayLeaseCostDaily +
        scenario.resourceConfig.ultrasoundMachines * scenario.resourceConfig.ultrasoundLeaseCostDaily
      );
    }
    const dayStaffCost = dailyStaffCost;
    const dayRevenue = dayPatients.reduce((sum, patient) => sum + patient.revenue, 0);
    const dayTotalCost = dayConsumableCost + dayMachineCostAll + dayStaffCost;

    const allSnapshot: DailySnapshot = {
      dayIndex: day,
      modality: "ALL",
      throughput: dayPatients.length,
      completedPatients: dayPatients.length,
      deferredPatients: dayDeferred.length,
      revenue: dayRevenue,
      profit: dayRevenue - dayTotalCost,
      totalCost: dayTotalCost,
      consumableCost: dayConsumableCost,
      machineCost: dayMachineCostAll,
      staffCost: dayStaffCost,
      averageWaitMinutes: average(dayWaits),
      averageResultMinutes: average(dayResults),
      p90WaitMinutes: percentile(dayWaits, 0.9),
      queuePeak: env.stats.queuePeakByDay[day],
      machineUtilization: dailyMachineUtilization,
      technicianUtilization: utilizationForResource(env.occupancy.technicians, env.capacity.technicians, dayStartSlot, dayEndSlotExclusive),
      radiologistUtilization: utilizationForResource(env.occupancy.radiologists, env.capacity.radiologists, dayStartSlot, dayEndSlotExclusive),
      roomUtilization: utilizationForResources(env, roomResources, dayStartSlot, dayEndSlotExclusive),
      changingRoomUtilization: utilizationForResources(env, changingRoomResources, dayStartSlot, dayEndSlotExclusive)
    };
    snapshots.push(allSnapshot);

    for (const modality of MODALITIES) {
      const subset = dayPatients.filter((patient) => patient.modality === modality);
      const waitsForModality = subset.map((patient) => patient.waitToExamMinutes);
      const resultsForModality = subset.map((patient) => patient.waitToResultMinutes);
      const modalityDayConsumableCost = subset.reduce((sum, patient) => sum + serviceLookup[patient.modality].consumableCost, 0);
      let modalityDayMachineCost = 0;
      if (scenario.resourceConfig.machineCostModel === "LEASED") {
        if (modality === "XRAY") modalityDayMachineCost = scenario.resourceConfig.xRayMachines * scenario.resourceConfig.xRayLeaseCostDaily;
        if (modality === "CT") modalityDayMachineCost = scenario.resourceConfig.ctMachines * scenario.resourceConfig.ctLeaseCostDaily;
        if (modality === "MRI") modalityDayMachineCost = scenario.resourceConfig.mriMachines * scenario.resourceConfig.mriLeaseCostDaily;
        if (modality === "PORTABLE_XRAY") modalityDayMachineCost = scenario.resourceConfig.portableXRayMachines * scenario.resourceConfig.portableXRayLeaseCostDaily;
        if (modality === "ULTRASOUND") modalityDayMachineCost = scenario.resourceConfig.ultrasoundMachines * scenario.resourceConfig.ultrasoundLeaseCostDaily;
      }
      const modalityDayRevenue = subset.reduce((sum, patient) => sum + patient.revenue, 0);
      const modalityDayTotalCost = modalityDayConsumableCost + modalityDayMachineCost;

      snapshots.push({
        dayIndex: day,
        modality,
        throughput: subset.length,
        completedPatients: subset.length,
        deferredPatients: dayDeferred.filter((patient) => patient.modality === modality).length,
        revenue: modalityDayRevenue,
        profit: modalityDayRevenue - modalityDayTotalCost,
        totalCost: modalityDayTotalCost,
        consumableCost: modalityDayConsumableCost,
        machineCost: modalityDayMachineCost,
        staffCost: 0, // Staff cost is global for now
        averageWaitMinutes: average(waitsForModality),
        averageResultMinutes: average(resultsForModality),
        p90WaitMinutes: percentile(waitsForModality, 0.9),
        queuePeak: env.stats.queuePeakByDay[day],
        machineUtilization: utilizationForResource(
          env.occupancy[`machine:${modality}`],
          env.capacity[`machine:${modality}`],
          dayStartSlot,
          dayEndSlotExclusive
        ),
        technicianUtilization: utilizationForResource(env.occupancy.technicians, env.capacity.technicians, dayStartSlot, dayEndSlotExclusive),
        radiologistUtilization: utilizationForResource(env.occupancy.radiologists, env.capacity.radiologists, dayStartSlot, dayEndSlotExclusive),
        roomUtilization: utilizationForResources(env, roomResources, dayStartSlot, dayEndSlotExclusive),
        changingRoomUtilization: utilizationForResources(env, changingRoomResources, dayStartSlot, dayEndSlotExclusive)
      });
    }
  }

  const summary: SimulationSummary = {
    horizonDays,
    seed,
    possibleRevenue,
    maximumRevenue,
    actualRevenue,
    totalProfit: actualRevenue - totalCost,
    totalCost,
    consumableCost: totalConsumableCost,
    machineCost: totalMachineCost,
    staffCost: totalStaffCost,
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
    machineUtilization: snapshots.filter(s => s.modality === "ALL").reduce((sum, s) => sum + s.machineUtilization, 0) / horizonDays,
    technicianUtilization: snapshots.filter(s => s.modality === "ALL").reduce((sum, s) => sum + s.technicianUtilization, 0) / horizonDays,
    radiologistUtilization: snapshots.filter(s => s.modality === "ALL").reduce((sum, s) => sum + s.radiologistUtilization, 0) / horizonDays,
    roomUtilization: snapshots.filter(s => s.modality === "ALL").reduce((sum, s) => sum + s.roomUtilization, 0) / horizonDays,
    changingRoomUtilization: snapshots.filter(s => s.modality === "ALL").reduce((sum, s) => sum + s.changingRoomUtilization, 0) / horizonDays,
    bottleneck: [...bottleneckSignals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None"
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
    const modalitySnapshots = snapshots.filter(s => s.modality === modality);
    metrics.push(
      { modality, metricName: "throughput", metricValue: subset.length },
      { modality, metricName: "revenue", metricValue: modalityRevenue },
      { modality, metricName: "averageWaitMinutes", metricValue: average(subset.map((patient) => patient.waitToExamMinutes)) },
      { modality, metricName: "averageResultMinutes", metricValue: average(subset.map((patient) => patient.waitToResultMinutes)) },
      {
        modality,
        metricName: "machineUtilization",
        metricValue: modalitySnapshots.reduce((sum, s) => sum + s.machineUtilization, 0) / horizonDays
      }
    );
  }

  return { summary, metrics, snapshots };
}

export function runMonteCarlo(scenario: ScenarioInput, horizonDays: number, seedStart: number, iterations: number) {
  const runs = Array.from({ length: iterations }, (_, index) => runSimulation(scenario, horizonDays, seedStart + index));
  const summaries = runs.map((run) => run.summary);
  const actualRevenueSeries = summaries.map((summary) => summary.actualRevenue);
  const p90WaitSeries = summaries.map((summary) => summary.p90WaitMinutes);
  const completedSeries = summaries.map((summary) => summary.completedPatients);
  const bottleneckCounts = new Map<string, number>();

  for (const summary of summaries) {
    bottleneckCounts.set(summary.bottleneck, (bottleneckCounts.get(summary.bottleneck) ?? 0) + 1);
  }

  const summary: SimulationSummary = {
    mode: "MONTE_CARLO",
    horizonDays,
    seed: seedStart,
    iterations,
    seedStart,
    seedEnd: seedStart + iterations - 1,
    possibleRevenue: average(summaries.map((item) => item.possibleRevenue)),
    maximumRevenue: average(summaries.map((item) => item.maximumRevenue)),
    actualRevenue: average(actualRevenueSeries),
    totalProfit: average(summaries.map((item) => item.totalProfit)),
    totalCost: average(summaries.map((item) => item.totalCost)),
    consumableCost: average(summaries.map((item) => item.consumableCost)),
    machineCost: average(summaries.map((item) => item.machineCost)),
    staffCost: average(summaries.map((item) => item.staffCost || 0)),
    lostRevenue: average(summaries.map((item) => item.lostRevenue)),
    lostRevenueDueToWait: average(summaries.map((item) => item.lostRevenueDueToWait)),
    lostRevenueDueToResult: average(summaries.map((item) => item.lostRevenueDueToResult)),
    lostRevenueDueToUnexpectedLeave: average(summaries.map((item) => item.lostRevenueDueToUnexpectedLeave)),
    completedPatients: average(completedSeries),
    deferredPatients: average(summaries.map((item) => item.deferredPatients)),
    averageWaitMinutes: average(summaries.map((item) => item.averageWaitMinutes)),
    averageResultMinutes: average(summaries.map((item) => item.averageResultMinutes)),
    p50WaitMinutes: percentile(summaries.map((item) => item.p50WaitMinutes), 0.5),
    p90WaitMinutes: average(p90WaitSeries),
    p50ResultMinutes: percentile(summaries.map((item) => item.p50ResultMinutes), 0.5),
    p90ResultMinutes: average(summaries.map((item) => item.p90ResultMinutes)),
    p95WaitMinutes: average(summaries.map((item) => item.p95WaitMinutes)),
    machineUtilization: average(summaries.map((item) => item.machineUtilization)),
    technicianUtilization: average(summaries.map((item) => item.technicianUtilization)),
    radiologistUtilization: average(summaries.map((item) => item.radiologistUtilization)),
    roomUtilization: average(summaries.map((item) => item.roomUtilization)),
    changingRoomUtilization: average(summaries.map((item) => item.changingRoomUtilization)),
    bottleneck: [...bottleneckCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "None",
    p10ActualRevenue: percentile(actualRevenueSeries, 0.1),
    p50ActualRevenue: percentile(actualRevenueSeries, 0.5),
    p90ActualRevenue: percentile(actualRevenueSeries, 0.9),
    p10P90WaitMinutes: percentile(p90WaitSeries, 0.1),
    p50P90WaitMinutes: percentile(p90WaitSeries, 0.5),
    p90P90WaitMinutes: percentile(p90WaitSeries, 0.9),
    p10CompletedPatients: percentile(completedSeries, 0.1),
    p50CompletedPatients: percentile(completedSeries, 0.5),
    p90CompletedPatients: percentile(completedSeries, 0.9)
  };

  const metrics: RunMetric[] = [
    { modality: "ALL", metricName: "actualRevenueMean", metricValue: summary.actualRevenue },
    { modality: "ALL", metricName: "actualRevenueP10", metricValue: summary.p10ActualRevenue ?? 0 },
    { modality: "ALL", metricName: "actualRevenueP50", metricValue: summary.p50ActualRevenue ?? 0 },
    { modality: "ALL", metricName: "actualRevenueP90", metricValue: summary.p90ActualRevenue ?? 0 },
    { modality: "ALL", metricName: "p90WaitP10", metricValue: summary.p10P90WaitMinutes ?? 0 },
    { modality: "ALL", metricName: "p90WaitP50", metricValue: summary.p50P90WaitMinutes ?? 0 },
    { modality: "ALL", metricName: "p90WaitP90", metricValue: summary.p90P90WaitMinutes ?? 0 },
    { modality: "ALL", metricName: "completedPatientsP10", metricValue: summary.p10CompletedPatients ?? 0 },
    { modality: "ALL", metricName: "completedPatientsP50", metricValue: summary.p50CompletedPatients ?? 0 },
    { modality: "ALL", metricName: "completedPatientsP90", metricValue: summary.p90CompletedPatients ?? 0 }
  ];

  const snapshots: DailySnapshot[] = [];
  const snapshotKeys = new Map<string, DailySnapshot[]>();
  for (const run of runs) {
    for (const snapshot of run.snapshots) {
      const key = `${snapshot.dayIndex}:${snapshot.modality}`;
      const bucket = snapshotKeys.get(key) ?? [];
      bucket.push(snapshot);
      snapshotKeys.set(key, bucket);
    }
  }

  for (const [key, bucket] of snapshotKeys.entries()) {
    const [dayIndexRaw, modality] = key.split(":");
    snapshots.push({
      dayIndex: Number(dayIndexRaw),
      modality: modality as DailySnapshot["modality"],
      throughput: Math.round(average(bucket.map((item) => item.throughput))),
      completedPatients: Math.round(average(bucket.map((item) => item.completedPatients))),
      deferredPatients: Math.round(average(bucket.map((item) => item.deferredPatients))),
      revenue: average(bucket.map((item) => item.revenue)),
      profit: average(bucket.map((item) => item.profit)),
      totalCost: average(bucket.map((item) => item.totalCost)),
      consumableCost: average(bucket.map((item) => item.consumableCost)),
      machineCost: average(bucket.map((item) => item.machineCost)),
      staffCost: average(bucket.map((item) => item.staffCost || 0)),
      averageWaitMinutes: average(bucket.map((item) => item.averageWaitMinutes)),
      averageResultMinutes: average(bucket.map((item) => item.averageResultMinutes)),
      p90WaitMinutes: average(bucket.map((item) => item.p90WaitMinutes)),
      queuePeak: Math.round(average(bucket.map((item) => item.queuePeak))),
      machineUtilization: average(bucket.map((item) => item.machineUtilization)),
      technicianUtilization: average(bucket.map((item) => item.technicianUtilization)),
      radiologistUtilization: average(bucket.map((item) => item.radiologistUtilization)),
      roomUtilization: average(bucket.map((item) => item.roomUtilization)),
      changingRoomUtilization: average(bucket.map((item) => item.changingRoomUtilization))
    });
  }

  snapshots.sort((a, b) => a.dayIndex - b.dayIndex || a.modality.localeCompare(b.modality));

  return { summary, metrics, snapshots };
}
