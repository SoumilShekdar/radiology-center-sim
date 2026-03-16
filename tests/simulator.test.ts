import { describe, expect, test } from "vitest";
import { DEFAULT_SCENARIO } from "../lib/sample-scenarios";
import { runSimulation } from "../lib/simulator";
import { scenarioSchema } from "../lib/validation";

function cloneScenario() {
  return structuredClone(DEFAULT_SCENARIO);
}

describe("scenario validation", () => {
  test("accepts the default scenario", () => {
    expect(() => scenarioSchema.parse(cloneScenario())).not.toThrow();
  });

  test("rejects invalid service mix totals", () => {
    const scenario = cloneScenario();
    scenario.serviceMix[0].weight = 0.9;
    scenario.serviceMix[1].weight = 0.9;

    expect(() => scenarioSchema.parse(scenario)).toThrow(/Service distribution must sum to 1/);
  });

  test("rejects invalid hourly arrival totals", () => {
    const scenario = cloneScenario();
    scenario.demandProfile.hourlyDistribution[0] = 0.6;

    expect(() => scenarioSchema.parse(scenario)).toThrow(/Hourly patient distribution must sum to 1/);
  });
});

describe("radiology simulator", () => {
  test("is deterministic for a fixed seed", () => {
    const first = runSimulation(cloneScenario(), 7, 2024);
    const second = runSimulation(cloneScenario(), 7, 2024);

    expect(first.summary).toEqual(second.summary);
    expect(first.metrics).toEqual(second.metrics);
    expect(first.snapshots).toEqual(second.snapshots);
  });

  test("adding imaging machines reduces average wait", () => {
    const baseline = cloneScenario();
    const expanded = cloneScenario();
    expanded.resourceConfig.xRayMachines += 2;
    expanded.resourceConfig.ctMachines += 1;
    expanded.resourceConfig.mriMachines += 1;
    expanded.resourceConfig.ultrasoundMachines += 1;

    const baselineRun = runSimulation(baseline, 7, 42);
    const expandedRun = runSimulation(expanded, 7, 42);

    expect(expandedRun.summary.averageWaitMinutes).toBeLessThanOrEqual(baselineRun.summary.averageWaitMinutes);
  });

  test("adding radiologists reduces result turnaround time", () => {
    const baseline = cloneScenario();
    baseline.resourceConfig.radiologists = 1;
    const expanded = cloneScenario();
    expanded.resourceConfig.radiologists = 5;

    const baselineRun = runSimulation(baseline, 30, 52);
    const expandedRun = runSimulation(expanded, 30, 52);

    expect(expandedRun.summary.averageResultMinutes).toBeLessThan(baselineRun.summary.averageResultMinutes);
  });

  test("higher unexpected leave rate increases lost revenue from unexpected leaves", () => {
    const lowLeave = cloneScenario();
    lowLeave.demandProfile.unexpectedLeaveRate = 0;

    const highLeave = cloneScenario();
    highLeave.demandProfile.unexpectedLeaveRate = 0.2;

    const lowRun = runSimulation(lowLeave, 30, 123);
    const highRun = runSimulation(highLeave, 30, 123);

    expect(highRun.summary.lostRevenueDueToUnexpectedLeave).toBeGreaterThan(lowRun.summary.lostRevenueDueToUnexpectedLeave);
    expect(highRun.summary.actualRevenue).toBeLessThanOrEqual(lowRun.summary.actualRevenue);
  });

  test("shorter operating hours increase deferred patients", () => {
    const baseline = cloneScenario();
    const reducedHours = cloneScenario();
    reducedHours.operatingHours = reducedHours.operatingHours.map((entry, index) =>
      index === 0 ? entry : { ...entry, openHour: 9, closeHour: 15 }
    );

    const baselineRun = runSimulation(baseline, 30, 91);
    const reducedRun = runSimulation(reducedHours, 30, 91);

    expect(reducedRun.summary.deferredPatients).toBeGreaterThan(baselineRun.summary.deferredPatients);
  });

  test("higher inpatient share improves inpatient waits relative to outpatient waits", () => {
    const mixed = cloneScenario();
    mixed.demandProfile.inpatientFraction = 0.45;

    const run = runSimulation(mixed, 7, 66);
    const inpatientWait = run.metrics.find((metric) => metric.metricName === "inpatientAverageWaitMinutes")?.metricValue ?? 0;
    const outpatientWait = run.metrics.find((metric) => metric.metricName === "outpatientAverageWaitMinutes")?.metricValue ?? 0;

    expect(inpatientWait).toBeLessThanOrEqual(outpatientWait);
  });
});
