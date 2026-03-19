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

  test("different seeds produce different outcomes once stochastic durations are sampled", () => {
    const scenario = cloneScenario();
    const first = runSimulation(scenario, 7, 9001);
    const second = runSimulation(scenario, 7, 9002);

    expect(first.summary).not.toEqual(second.summary);
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

  test("inpatient priority reduces inpatient waits under congestion", () => {
    const congested = cloneScenario();
    congested.demandProfile.baseDailyPatients = 180;
    congested.demandProfile.inpatientFraction = 0.5;
    congested.demandProfile.urgentFraction = 0;
    congested.demandProfile.repeatScanRate = 0;
    congested.resourceConfig.xRayMachines = 1;
    congested.resourceConfig.ctMachines = 0;
    congested.resourceConfig.mriMachines = 0;
    congested.resourceConfig.portableXRayMachines = 0;
    congested.resourceConfig.ultrasoundMachines = 0;
    congested.resourceConfig.rooms = 1;
    congested.resourceConfig.technicians = 1;
    congested.resourceConfig.supportStaff = 2;
    congested.resourceConfig.radiologists = 1;
    congested.serviceMix = congested.serviceMix.map((item) => ({
      ...item,
      weight: item.modality === "XRAY" ? 1 : 0
    }));

    const run = runSimulation(congested, 7, 66);
    const inpatientWait = run.metrics.find((metric) => metric.metricName === "inpatientAverageWaitMinutes")?.metricValue ?? 0;
    const outpatientWait = run.metrics.find((metric) => metric.metricName === "outpatientAverageWaitMinutes")?.metricValue ?? 0;

    expect(inpatientWait).toBeLessThanOrEqual(outpatientWait);
  });

  test("zero result communication minutes removes communication delay without breaking completion", () => {
    const scenario = cloneScenario();
    scenario.demandProfile.resultCommunicationMinutes = 0;

    const run = runSimulation(scenario, 7, 333);

    expect(run.summary.completedPatients).toBeGreaterThan(0);
    expect(run.summary.averageResultMinutes).toBeGreaterThanOrEqual(0);
  });

  test("daily snapshots keep day-specific queue and utilization values", () => {
    const scenario = cloneScenario();
    const run = runSimulation(scenario, 7, 444);
    const allSnapshots = run.snapshots.filter((snapshot) => snapshot.modality === "ALL");

    expect(allSnapshots).toHaveLength(7);
    expect(new Set(allSnapshots.map((snapshot) => snapshot.dayIndex)).size).toBe(7);
    expect(allSnapshots.every((snapshot) => snapshot.queuePeak >= 0)).toBe(true);
    expect(allSnapshots.every((snapshot) => snapshot.machineUtilization >= 0 && snapshot.machineUtilization <= 100)).toBe(true);
  });

  test("after-hours radiologist coverage can reduce lost revenue from result backlogs", () => {
    const baseline = cloneScenario();
    baseline.operatingHours = baseline.operatingHours.map((entry, index) =>
      index === 0 ? entry : { ...entry, openHour: 8, closeHour: 16 }
    );
    baseline.demandProfile.baseDailyPatients = 150;
    baseline.resourceConfig.radiologists = 1;
    baseline.demandProfile.resultCommunicationMinutes = 0;
    baseline.serviceConfigs = baseline.serviceConfigs.map((service) => ({
      ...service,
      reportingMinutes: Math.round(service.reportingMinutes * 1.8)
    }));
    baseline.staffRotation.radiologists = baseline.staffRotation.radiologists.map((point) => ({
      ...point,
      coverage: point.hour >= 8 && point.hour < 16 ? 1 : 0
    }));

    const overnightReporting = cloneScenario();
    overnightReporting.operatingHours = overnightReporting.operatingHours.map((entry, index) =>
      index === 0 ? entry : { ...entry, openHour: 8, closeHour: 16 }
    );
    overnightReporting.demandProfile.baseDailyPatients = 150;
    overnightReporting.resourceConfig.radiologists = 1;
    overnightReporting.demandProfile.resultCommunicationMinutes = 0;
    overnightReporting.serviceConfigs = overnightReporting.serviceConfigs.map((service) => ({
      ...service,
      reportingMinutes: Math.round(service.reportingMinutes * 1.8)
    }));
    overnightReporting.staffRotation.radiologists = overnightReporting.staffRotation.radiologists.map((point) => ({
      ...point,
      coverage: point.hour >= 8 && point.hour < 22 ? 1 : 0
    }));

    const baselineRun = runSimulation(baseline, 7, 717);
    const overnightRun = runSimulation(overnightReporting, 7, 717);

    expect(overnightRun.summary.lostRevenueDueToResult).toBeLessThanOrEqual(baselineRun.summary.lostRevenueDueToResult);
  });
});
