import { prisma } from "@/lib/prisma";
import type { ScenarioInput } from "@/lib/types";

function toPlainScenario(scenario: ScenarioInput) {
  return {
    name: scenario.name,
    description: scenario.description,
    currency: scenario.currency,
    seedDefault: scenario.seedDefault,
    downtimeRate: scenario.downtimeRate,
    operatingHours: scenario.operatingHours,
    staffRotation: scenario.staffRotation,
    workflowConfig: scenario.workflowConfig,
    appointmentPolicy: scenario.appointmentPolicy
  };
}

export async function upsertScenario(input: ScenarioInput) {
  const baseData = toPlainScenario(input);

  if (input.id) {
    await prisma.scenario.update({
      where: { id: input.id },
      data: {
        ...baseData,
        resourceConfig: {
          upsert: {
            update: input.resourceConfig,
            create: input.resourceConfig
          }
        },
        services: {
          deleteMany: {},
          createMany: { data: input.serviceConfigs }
        },
        demandProfile: {
          upsert: {
            update: input.demandProfile,
            create: input.demandProfile
          }
        },
        serviceMix: {
          deleteMany: {},
          createMany: { data: input.serviceMix }
        }
      }
    });

    return input.id;
  }

  const scenario = await prisma.scenario.create({
    data: {
      ...baseData,
      resourceConfig: { create: input.resourceConfig },
      services: { createMany: { data: input.serviceConfigs } },
      demandProfile: { create: input.demandProfile },
      serviceMix: { createMany: { data: input.serviceMix } }
    }
  });

  return scenario.id;
}

export async function duplicateScenario(id: string) {
  const scenario = await getScenario(id);
  const copyName = `${scenario.name} Copy`;
  return upsertScenario({ ...scenario, id: undefined, name: copyName });
}

export async function getScenario(id: string): Promise<ScenarioInput> {
  const scenario = await prisma.scenario.findUniqueOrThrow({
    where: { id },
    include: {
      resourceConfig: true,
      services: true,
      demandProfile: true,
      serviceMix: true
    }
  });

  return {
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    currency: scenario.currency,
    seedDefault: scenario.seedDefault,
    downtimeRate: scenario.downtimeRate,
    operatingHours: scenario.operatingHours as ScenarioInput["operatingHours"],
    staffRotation: {
      technicians: (scenario.staffRotation as ScenarioInput["staffRotation"]).technicians,
      supportStaff: (scenario.staffRotation as ScenarioInput["staffRotation"]).supportStaff,
      radiologists: (scenario.staffRotation as ScenarioInput["staffRotation"]).radiologists
    },
    workflowConfig: (scenario.workflowConfig as ScenarioInput["workflowConfig"]) ?? {
      roomConfigs: Array.from({ length: scenario.resourceConfig?.rooms ?? 1 }, (_, index) => ({
        id: `room-${index + 1}`,
        name: `Room ${index + 1}`,
        supportedModalities: ["XRAY", "CT", "MRI", "ULTRASOUND"],
        dedicatedModality: "NONE"
      })),
      changingRoomConfigs: Array.from({ length: scenario.resourceConfig?.changingRooms ?? 0 }, (_, index) => ({
        id: `changing-room-${index + 1}`,
        name: `Changing Room ${index + 1}`,
        gender: "UNISEX"
      })),
      changingRoomByModality: {
        XRAY: false,
        CT: true,
        MRI: true,
        PORTABLE_XRAY: false,
        ULTRASOUND: false
      }
    },
    resourceConfig: {
      xRayMachines: scenario.resourceConfig?.xRayMachines ?? 0,
      ctMachines: scenario.resourceConfig?.ctMachines ?? 0,
      mriMachines: scenario.resourceConfig?.mriMachines ?? 0,
      portableXRayMachines: scenario.resourceConfig?.portableXRayMachines ?? 0,
      ultrasoundMachines: scenario.resourceConfig?.ultrasoundMachines ?? 0,
      rooms: scenario.resourceConfig?.rooms ?? 1,
      changingRooms: scenario.resourceConfig?.changingRooms ?? 0,
      technicians: scenario.resourceConfig?.technicians ?? 1,
      supportStaff: scenario.resourceConfig?.supportStaff ?? 1,
      radiologists: scenario.resourceConfig?.radiologists ?? 1
    },
    serviceConfigs: scenario.services.map((service) => ({
      modality: service.modality as ScenarioInput["serviceConfigs"][number]["modality"],
      charge: service.charge,
      examDurationMinutes: service.examDurationMinutes,
      prepDurationMinutes: service.prepDurationMinutes,
      cleanupMinutes: service.cleanupMinutes,
      reportingMinutes: service.reportingMinutes
    })),
    demandProfile: {
      baseDailyPatients: scenario.demandProfile?.baseDailyPatients ?? 1,
      hourlyDistribution: scenario.demandProfile?.hourlyDistribution as number[],
      dayOfWeekMultiplier: scenario.demandProfile?.dayOfWeekMultiplier as number[],
      inpatientFraction: scenario.demandProfile?.inpatientFraction ?? 0,
      femaleFraction: scenario.demandProfile?.femaleFraction ?? 0.5,
      urgentFraction: scenario.demandProfile?.urgentFraction ?? 0,
      noShowRate: scenario.demandProfile?.noShowRate ?? 0,
      unexpectedLeaveRate: scenario.demandProfile?.unexpectedLeaveRate ?? 0,
      repeatScanRate: scenario.demandProfile?.repeatScanRate ?? 0,
      resultCommunicationMinutes: scenario.demandProfile?.resultCommunicationMinutes ?? 0
    },
    appointmentPolicy: (scenario.appointmentPolicy as ScenarioInput["appointmentPolicy"]) ?? {
      enabled: false,
      outpatientScheduledFraction: 0.7,
      arrivalVarianceMinutes: 15,
      earlyArrivalMinutes: 20
    },
    serviceMix: scenario.serviceMix.map((item) => ({
      modality: item.modality as ScenarioInput["serviceMix"][number]["modality"],
      weight: item.weight
    }))
  };
}

export async function listScenarioSummaries() {
  const scenarios = await prisma.scenario.findMany({
    orderBy: { updatedAt: "desc" }
  });

  return scenarios.map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    description: scenario.description,
    currency: scenario.currency,
    seedDefault: scenario.seedDefault,
    updatedAt: scenario.updatedAt
  }));
}

export async function listRunsForScenario(scenarioId: string) {
  return prisma.simulationRun.findMany({
    where: { scenarioId },
    orderBy: { startedAt: "desc" },
    include: {
      metrics: true
    }
  });
}
