import { beforeEach, describe, expect, test, vi } from "vitest";

const mockedModules = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
  upsertScenario: vi.fn(),
  duplicateScenario: vi.fn(),
  getScenario: vi.fn(),
  runSimulation: vi.fn(),
  prismaMock: {
    scenario: {
      count: vi.fn()
    },
    simulationRun: {
      create: vi.fn(),
      update: vi.fn()
    }
  }
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockedModules.revalidatePath
}));

vi.mock("@/lib/scenario-store", () => ({
  duplicateScenario: mockedModules.duplicateScenario,
  getScenario: mockedModules.getScenario,
  upsertScenario: mockedModules.upsertScenario
}));

vi.mock("@/lib/simulator", () => ({
  runSimulation: mockedModules.runSimulation
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mockedModules.prismaMock
}));

import { DEFAULT_SCENARIO, SAMPLE_SCENARIOS } from "@/lib/sample-scenarios";
import {
  createDefaultScenarioAction,
  duplicateScenarioAction,
  runSimulationAction,
  saveScenarioAction,
  seedSampleScenariosAction
} from "@/lib/actions";

function buildScenarioFormData() {
  const formData = new FormData();
  formData.set("scenario", JSON.stringify(structuredClone(DEFAULT_SCENARIO)));
  return formData;
}

describe("server actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("saveScenarioAction validates, stores, and revalidates", async () => {
    mockedModules.upsertScenario.mockResolvedValue("scenario-1");

    const result = await saveScenarioAction(buildScenarioFormData());

    expect(result).toEqual({ id: "scenario-1" });
    expect(mockedModules.upsertScenario).toHaveBeenCalledWith(expect.objectContaining({ name: DEFAULT_SCENARIO.name }));
    expect(mockedModules.revalidatePath).toHaveBeenCalledWith("/");
    expect(mockedModules.revalidatePath).toHaveBeenCalledWith("/scenarios/scenario-1");
  });

  test("seedSampleScenariosAction only inserts samples when the database is empty", async () => {
    mockedModules.prismaMock.scenario.count.mockResolvedValue(0);

    await seedSampleScenariosAction();

    expect(mockedModules.upsertScenario).toHaveBeenCalledTimes(SAMPLE_SCENARIOS.length);
    expect(mockedModules.revalidatePath).toHaveBeenCalledWith("/");
  });

  test("createDefaultScenarioAction stores the starter scenario", async () => {
    await createDefaultScenarioAction();

    expect(mockedModules.upsertScenario).toHaveBeenCalledWith(DEFAULT_SCENARIO);
    expect(mockedModules.revalidatePath).toHaveBeenCalledWith("/");
  });

  test("duplicateScenarioAction rejects missing ids", async () => {
    const formData = new FormData();

    await expect(duplicateScenarioAction(formData)).rejects.toThrow("Scenario id is required.");
  });

  test("duplicateScenarioAction duplicates and revalidates", async () => {
    const formData = new FormData();
    formData.set("scenarioId", "scenario-2");

    await duplicateScenarioAction(formData);

    expect(mockedModules.duplicateScenario).toHaveBeenCalledWith("scenario-2");
    expect(mockedModules.revalidatePath).toHaveBeenCalledWith("/");
  });

  test("runSimulationAction persists the generated run payload", async () => {
    mockedModules.prismaMock.simulationRun.create.mockResolvedValue({ id: "run-1" });

    const formData = new FormData();
    formData.set("scenarioId", "scenario-2");
    formData.set("horizonDays", "7");
    formData.set("seed", "44");

    const result = await runSimulationAction(formData);

    expect(result).toEqual({ runId: "run-1" });
    expect(mockedModules.prismaMock.simulationRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scenarioId: "scenario-2",
        horizonDays: 7,
        seed: 44,
        status: "QUEUED"
      })
    });
    expect(mockedModules.revalidatePath).toHaveBeenCalledWith("/");
    expect(mockedModules.revalidatePath).toHaveBeenCalledWith("/runs/run-1");
    expect(mockedModules.revalidatePath).toHaveBeenCalledWith("/scenarios/scenario-2");
  });
});
