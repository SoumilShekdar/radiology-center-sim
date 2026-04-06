"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { DEFAULT_SCENARIO, SAMPLE_SCENARIOS } from "@/lib/sample-scenarios";
import { duplicateScenario, getScenario, upsertScenario } from "@/lib/scenario-store";
import { runMonteCarlo, runSimulation } from "@/lib/simulator";
import { runOptimizer } from "@/lib/optimizer";
import { getOptimizerAdvice } from "@/lib/llm-advisor";
import type { ScenarioInput } from "@/lib/types";
import { scenarioSchema } from "@/lib/validation";

function parseScenarioPayload(payload: FormDataEntryValue | null) {
  if (!payload || typeof payload !== "string") {
    throw new Error("Missing scenario payload.");
  }

  const parsed = JSON.parse(payload) as ScenarioInput;
  return scenarioSchema.parse(parsed) as ScenarioInput;
}

async function persistRunResult(runId: string, result: ReturnType<typeof runSimulation> | ReturnType<typeof runMonteCarlo>) {
  await prisma.simulationRun.update({
    where: { id: runId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      summary: result.summary,
      metrics: {
        deleteMany: {},
        createMany: {
          data: result.metrics.map((metric) => ({
            modality: metric.modality,
            metricName: metric.metricName,
            metricValue: metric.metricValue
          }))
        }
      },
      snapshots: {
        deleteMany: {},
        createMany: {
          data: result.snapshots.map((snapshot) => ({
            dayIndex: snapshot.dayIndex,
            modality: snapshot.modality,
            throughput: snapshot.throughput,
            completedPatients: snapshot.completedPatients,
            deferredPatients: snapshot.deferredPatients,
            revenue: snapshot.revenue,
            profit: snapshot.profit ?? 0,
            totalCost: snapshot.totalCost ?? 0,
            consumableCost: snapshot.consumableCost ?? 0,
            machineCost: snapshot.machineCost ?? 0,
            staffCost: snapshot.staffCost ?? 0,
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
}

function queueSimulationProcessing(params: {
  runId: string;
  scenarioId: string;
  horizonDays: number;
  seed: number;
  mode: "SINGLE" | "MONTE_CARLO";
  iterations?: number;
}) {
  setTimeout(() => {
    void (async () => {
      try {
        await prisma.simulationRun.update({
          where: { id: params.runId },
          data: { status: "RUNNING" }
        });

        const scenario = await getScenario(params.scenarioId);
        const result =
          params.mode === "MONTE_CARLO"
            ? runMonteCarlo(scenario, params.horizonDays, params.seed, params.iterations ?? 25)
            : runSimulation(scenario, params.horizonDays, params.seed);

        await persistRunResult(params.runId, result);
      } catch (error) {
        await prisma.simulationRun.update({
          where: { id: params.runId },
          data: {
            status: "FAILED",
            completedAt: new Date(),
            summary: {
              mode: params.mode,
              error: error instanceof Error ? error.message : "Simulation failed."
            }
          }
        });
      } finally {
        // In Next.js 15, revalidatePath cannot be used in background timeouts 
        // that might outlive the render/action cycle.
      }
    })();
  }, 0);
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

  const run = await prisma.simulationRun.create({
    data: {
      scenarioId,
      horizonDays: Number(horizon),
      seed: Number(seed),
      status: "QUEUED",
      summary: {
        mode: "SINGLE",
        queuedAt: new Date().toISOString()
      }
    }
  });

  queueSimulationProcessing({
    runId: run.id,
    scenarioId,
    horizonDays: Number(horizon),
    seed: Number(seed),
    mode: "SINGLE"
  });

  revalidatePath("/");
  revalidatePath(`/runs/${run.id}`);
  revalidatePath(`/scenarios/${scenarioId}`);
  return { runId: run.id };
}

export async function runMonteCarloAction(formData: FormData) {
  const scenarioId = formData.get("scenarioId");
  const horizon = formData.get("horizonDays");
  const seed = formData.get("seed");
  const iterations = formData.get("iterations");

  if (typeof scenarioId !== "string" || typeof horizon !== "string" || typeof seed !== "string" || typeof iterations !== "string") {
    throw new Error("Scenario id, horizon, seed, and iterations are required.");
  }

  const run = await prisma.simulationRun.create({
    data: {
      scenarioId,
      horizonDays: Number(horizon),
      seed: Number(seed),
      status: "QUEUED",
      summary: {
        mode: "MONTE_CARLO",
        iterations: Number(iterations),
        queuedAt: new Date().toISOString()
      }
    }
  });

  queueSimulationProcessing({
    runId: run.id,
    scenarioId,
    horizonDays: Number(horizon),
    seed: Number(seed),
    mode: "MONTE_CARLO",
    iterations: Number(iterations)
  });

  revalidatePath("/");
  revalidatePath(`/runs/${run.id}`);
  revalidatePath(`/scenarios/${scenarioId}`);
  return { runId: run.id };
}

export async function runOptimizerAction(formData: FormData) {
  const scenarioId = formData.get("scenarioId");
  const horizonDays = formData.get("horizonDays");
  const seed = formData.get("seed");
  const maxWaitMinutes = formData.get("maxWaitMinutes");
  const enabledKnobsRaw = formData.get("enabledKnobs");

  if (
    typeof scenarioId !== "string" ||
    typeof horizonDays !== "string" ||
    typeof seed !== "string" ||
    typeof maxWaitMinutes !== "string"
  ) {
    throw new Error("scenarioId, horizonDays, seed, and maxWaitMinutes are required.");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const enabledKnobs: any[] = typeof enabledKnobsRaw === "string"
    ? JSON.parse(enabledKnobsRaw)
    : null;

  // Use cuid-style id manually since we bypass the Prisma client
  const runId = `opt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const constraint = JSON.stringify({ maxWaitMinutes: Number(maxWaitMinutes), enabledKnobs });

  await prisma.$executeRaw`
    INSERT INTO "OptimiserRun" ("id", "scenarioId", "status", "horizonDays", "seed", "constraint", "startedAt")
    VALUES (${runId}, ${scenarioId}, 'QUEUED', ${Number(horizonDays)}, ${Number(seed)}, ${constraint}::jsonb, NOW())
  `;

  setTimeout(() => {
    void (async () => {
      try {
        await prisma.$executeRaw`
          UPDATE "OptimiserRun" SET "status" = 'RUNNING' WHERE "id" = ${runId}
        `;

        const scenario = await getScenario(scenarioId);
        const baselineResult = runSimulation(scenario, Number(horizonDays), Number(seed));
        const optimizerConstraint = { maxWaitMinutes: Number(maxWaitMinutes) };

        const candidates = runOptimizer(scenario, Number(horizonDays), Number(seed), optimizerConstraint, 220, enabledKnobs ?? undefined);

        const advice = await getOptimizerAdvice({
          scenarioName: scenario.name,
          currency: scenario.currency,
          constraint: optimizerConstraint,
          baseline: baselineResult.summary,
          topCandidates: candidates,
          baseline_config: scenario.resourceConfig,
        });

        const results = JSON.stringify({
          baseline: baselineResult.summary,
          candidates: candidates.map((c) => ({
            delta: c.delta,
            resourceConfig: c.resourceConfig,
            summary: c.summary,
            score: c.score,
            feasible: c.feasible,
          })),
          advice,
        });

        await prisma.$executeRaw`
          UPDATE "OptimiserRun"
          SET "status" = 'COMPLETED', "completedAt" = NOW(), "results" = ${results}::jsonb
          WHERE "id" = ${runId}
        `;
      } catch (error) {
        const errResults = JSON.stringify({ error: error instanceof Error ? error.message : "Optimiser failed." });
        await prisma.$executeRaw`
          UPDATE "OptimiserRun"
          SET "status" = 'FAILED', "completedAt" = NOW(), "results" = ${errResults}::jsonb
          WHERE "id" = ${runId}
        `;
      }
    })();
  }, 0);

  return { runId };
}

export async function listOptimizerRunsAction(scenarioId: string) {
  const rows = await prisma.$queryRaw<Array<{
    id: string;
    status: string;
    horizonDays: number;
    seed: number;
    constraint: { maxWaitMinutes: number };
    startedAt: Date;
    completedAt: Date | null;
    results: Record<string, unknown> | null;
  }>>`
    SELECT "id", "status", "horizonDays", "seed", "constraint", "startedAt", "completedAt", "results"
    FROM "OptimiserRun"
    WHERE "scenarioId" = ${scenarioId}
    ORDER BY "startedAt" DESC
    LIMIT 10
  `;
  return rows;
}
