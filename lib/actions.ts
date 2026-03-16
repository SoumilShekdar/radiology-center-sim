"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SCENARIO, SAMPLE_SCENARIOS } from "@/lib/sample-scenarios";
import { duplicateScenario, getScenario, upsertScenario } from "@/lib/scenario-store";
import { runSimulation } from "@/lib/simulator";
import type { ScenarioInput } from "@/lib/types";
import { scenarioSchema } from "@/lib/validation";

function parseScenarioPayload(payload: FormDataEntryValue | null) {
  if (!payload || typeof payload !== "string") {
    throw new Error("Missing scenario payload.");
  }

  const parsed = JSON.parse(payload) as ScenarioInput;
  return scenarioSchema.parse(parsed);
}

export async function saveScenarioAction(formData: FormData) {
  const scenario = parseScenarioPayload(formData.get("scenario"));
  const id = await upsertScenario(scenario);
  revalidatePath("/");
  revalidatePath(`/scenarios/${id}`);
  return { id };
}

export async function seedSampleScenariosAction() {
  const count = await prisma.scenario.count();
  if (count === 0) {
    for (const scenario of SAMPLE_SCENARIOS) {
      await upsertScenario(scenario);
    }
  }

  revalidatePath("/");
}

export async function createDefaultScenarioAction() {
  await upsertScenario(DEFAULT_SCENARIO);
  revalidatePath("/");
}

export async function duplicateScenarioAction(formData: FormData) {
  const idValue = formData.get("scenarioId");
  if (typeof idValue !== "string") {
    throw new Error("Scenario id is required.");
  }
  await duplicateScenario(idValue);
  revalidatePath("/");
}

export async function runSimulationAction(formData: FormData) {
  const scenarioId = formData.get("scenarioId");
  const horizon = formData.get("horizonDays");
  const seed = formData.get("seed");

  if (typeof scenarioId !== "string" || typeof horizon !== "string" || typeof seed !== "string") {
    throw new Error("Scenario id, horizon, and seed are required.");
  }

  const scenario = await getScenario(scenarioId);
  const result = runSimulation(scenario, Number(horizon), Number(seed));

  const run = await prisma.simulationRun.create({
    data: {
      scenarioId,
      horizonDays: Number(horizon),
      seed: Number(seed),
      status: "COMPLETED",
      completedAt: new Date(),
      summary: result.summary,
      metrics: {
        createMany: {
          data: result.metrics.map((metric) => ({
            modality: metric.modality,
            metricName: metric.metricName,
            metricValue: metric.metricValue
          }))
        }
      },
      snapshots: {
        createMany: {
          data: result.snapshots.map((snapshot) => ({
            dayIndex: snapshot.dayIndex,
            modality: snapshot.modality,
            throughput: snapshot.throughput,
            completedPatients: snapshot.completedPatients,
            deferredPatients: snapshot.deferredPatients,
            revenue: snapshot.revenue,
            averageWaitMinutes: snapshot.averageWaitMinutes,
            averageResultMinutes: snapshot.averageResultMinutes,
            p90WaitMinutes: snapshot.p90WaitMinutes,
            queuePeak: snapshot.queuePeak,
            machineUtilization: snapshot.machineUtilization,
            technicianUtilization: snapshot.technicianUtilization,
            radiologistUtilization: snapshot.radiologistUtilization,
            roomUtilization: snapshot.roomUtilization,
            changingRoomUtilization: snapshot.changingRoomUtilization
          }))
        }
      }
    }
  });

  revalidatePath("/");
  revalidatePath(`/runs/${run.id}`);
  revalidatePath(`/scenarios/${scenarioId}`);
  return { runId: run.id };
}
