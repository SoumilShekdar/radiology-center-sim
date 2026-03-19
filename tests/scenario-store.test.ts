import { beforeEach, describe, expect, test, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  scenario: {
    create: vi.fn(),
    findMany: vi.fn(),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn()
  },
  simulationRun: {
    findMany: vi.fn()
  }
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock
}));

import { DEFAULT_SCENARIO } from "@/lib/sample-scenarios";
import { duplicateScenario, getScenario, listRunsForScenario, listScenarioSummaries, upsertScenario } from "@/lib/scenario-store";

function cloneScenario() {
  return structuredClone(DEFAULT_SCENARIO);
}

describe("scenario-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("creates a new scenario with nested relations", async () => {
    const scenario = cloneScenario();
    prismaMock.scenario.create.mockResolvedValue({ id: "scenario-1" });

    const id = await upsertScenario(scenario);

    expect(id).toBe("scenario-1");
    expect(prismaMock.scenario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: scenario.name,
        description: scenario.description,
        currency: scenario.currency,
        seedDefault: scenario.seedDefault,
        resourceConfig: { create: scenario.resourceConfig },
        demandProfile: { create: scenario.demandProfile },
        services: { createMany: { data: scenario.serviceConfigs } },
        serviceMix: { createMany: { data: scenario.serviceMix } }
      })
    });
  });

  test("updates an existing scenario with relation upserts", async () => {
    const scenario = { ...cloneScenario(), id: "scenario-2", downtimeRate: 0.12 };

    const id = await upsertScenario(scenario);

    expect(id).toBe("scenario-2");
    expect(prismaMock.scenario.update).toHaveBeenCalledWith({
      where: { id: "scenario-2" },
      data: expect.objectContaining({
        name: scenario.name,
        downtimeRate: scenario.downtimeRate,
        services: {
          deleteMany: {},
          createMany: { data: scenario.serviceConfigs }
        },
        serviceMix: {
          deleteMany: {},
          createMany: { data: scenario.serviceMix }
        }
      })
    });
    expect(prismaMock.scenario.update.mock.calls[0]?.[0]?.data?.staffRotation).toEqual(
      expect.objectContaining({
        technicians: scenario.staffRotation.technicians,
        supportStaff: scenario.staffRotation.supportStaff,
        radiologists: scenario.staffRotation.radiologists
      })
    );
  });

  test("hydrates a stored scenario into the app input shape", async () => {
    const scenario = cloneScenario();
    prismaMock.scenario.findUniqueOrThrow.mockResolvedValue({
      id: "scenario-3",
      name: scenario.name,
      description: scenario.description,
      currency: scenario.currency,
      seedDefault: scenario.seedDefault,
      downtimeRate: 0.08,
      operatingHours: scenario.operatingHours,
      staffRotation: scenario.staffRotation,
      workflowConfig: scenario.workflowConfig,
      appointmentPolicy: scenario.appointmentPolicy,
      resourceConfig: scenario.resourceConfig,
      services: scenario.serviceConfigs,
      demandProfile: scenario.demandProfile,
      serviceMix: scenario.serviceMix
    });

    const result = await getScenario("scenario-3");

    expect(result).toEqual({
      id: "scenario-3",
      ...scenario,
      downtimeRate: 0.08
    });
  });

  test("duplicates a scenario with a copy suffix", async () => {
    const scenario = cloneScenario();
    prismaMock.scenario.findUniqueOrThrow.mockResolvedValue({
      id: "source-id",
      name: scenario.name,
      description: scenario.description,
      currency: scenario.currency,
      seedDefault: scenario.seedDefault,
      downtimeRate: scenario.downtimeRate,
      operatingHours: scenario.operatingHours,
      staffRotation: scenario.staffRotation,
      workflowConfig: scenario.workflowConfig,
      appointmentPolicy: scenario.appointmentPolicy,
      resourceConfig: scenario.resourceConfig,
      services: scenario.serviceConfigs,
      demandProfile: scenario.demandProfile,
      serviceMix: scenario.serviceMix
    });
    prismaMock.scenario.create.mockResolvedValue({ id: "copy-id" });

    const copyId = await duplicateScenario("source-id");

    expect(copyId).toBe("copy-id");
    expect(prismaMock.scenario.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: `${scenario.name} Copy`
      })
    });
  });

  test("maps scenario summaries for the home page", async () => {
    const updatedAt = new Date("2026-03-17T00:00:00.000Z");
    prismaMock.scenario.findMany.mockResolvedValue([
      {
        id: "scenario-4",
        name: "Example",
        description: "Example scenario",
        currency: "USD",
        seedDefault: 123,
        updatedAt
      }
    ]);

    await expect(listScenarioSummaries()).resolves.toEqual([
      {
        id: "scenario-4",
        name: "Example",
        description: "Example scenario",
        currency: "USD",
        seedDefault: 123,
        updatedAt
      }
    ]);
  });

  test("loads run history for a scenario with metrics", async () => {
    const runs = [{ id: "run-1", metrics: [{ metricName: "actualRevenue", metricValue: 1000 }] }];
    prismaMock.simulationRun.findMany.mockResolvedValue(runs);

    await expect(listRunsForScenario("scenario-4")).resolves.toBe(runs);
    expect(prismaMock.simulationRun.findMany).toHaveBeenCalledWith({
      where: { scenarioId: "scenario-4" },
      orderBy: { startedAt: "desc" },
      include: {
        metrics: true
      }
    });
  });
});
