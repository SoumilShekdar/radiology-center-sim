import { runSimulation } from "@/lib/simulator";
import type { ScenarioInput, SimulationSummary } from "@/lib/types";

export type OptimiserConstraint = {
  maxWaitMinutes: number; // P90 wait time ceiling
};

export type KnobDelta = {
  xRayMachines: number;
  ctMachines: number;
  mriMachines: number;
  portableXRayMachines: number;
  ultrasoundMachines: number;
  technicians: number;
  radiologists: number;
  supportStaff: number;
};

export type CandidateResult = {
  delta: KnobDelta;
  resourceConfig: ScenarioInput["resourceConfig"];
  summary: SimulationSummary;
  score: number;
  feasible: boolean; // meets wait constraint
};

// Knob definitions: [min delta, max delta]
type KnobSpec = { key: keyof KnobDelta; min: number; max: number };

const KNOB_SPECS: KnobSpec[] = [
  { key: "xRayMachines", min: -2, max: 3 },
  { key: "ctMachines", min: -1, max: 2 },
  { key: "mriMachines", min: -1, max: 2 },
  { key: "portableXRayMachines", min: -1, max: 2 },
  { key: "ultrasoundMachines", min: -1, max: 2 },
  { key: "technicians", min: -3, max: 4 },
  { key: "radiologists", min: -2, max: 3 },
  { key: "supportStaff", min: -2, max: 3 },
];

// All knob keys — used as default when no subset is specified
export type KnobKey = keyof KnobDelta;

/**
 * Latin Hypercube Sampling: generates `n` stratified samples in [0,1]^dims.
 * Each dimension is divided into n equal intervals, with exactly one sample per interval.
 */
function latinHypercubeSample(n: number, dims: number, rng: () => number): number[][] {
  const samples: number[][] = Array.from({ length: n }, () => new Array(dims).fill(0));

  for (let d = 0; d < dims; d++) {
    // Create shuffled interval indices
    const intervals = Array.from({ length: n }, (_, i) => i);
    for (let i = intervals.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [intervals[i], intervals[j]] = [intervals[j], intervals[i]];
    }
    // Sample one point per interval
    for (let i = 0; i < n; i++) {
      samples[i][d] = (intervals[i] + rng()) / n;
    }
  }

  return samples;
}

/** Seeded PRNG (xorshift32) — keeps sampling deterministic for a given seed */
function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return (state >>> 0) / 0xffffffff;
  };
}

/** Map a [0,1] LHS value to an integer delta within [min, max] */
function mapToInt(unit: number, min: number, max: number): number {
  return Math.round(min + unit * (max - min));
}

/** Apply a delta to the baseline resource config, clamping to non-negative values */
function applyDelta(baseline: ScenarioInput["resourceConfig"], delta: KnobDelta): ScenarioInput["resourceConfig"] {
  return {
    ...baseline,
    xRayMachines: Math.max(0, baseline.xRayMachines + delta.xRayMachines),
    ctMachines: Math.max(0, baseline.ctMachines + delta.ctMachines),
    mriMachines: Math.max(0, baseline.mriMachines + delta.mriMachines),
    portableXRayMachines: Math.max(0, baseline.portableXRayMachines + delta.portableXRayMachines),
    ultrasoundMachines: Math.max(0, baseline.ultrasoundMachines + delta.ultrasoundMachines),
    technicians: Math.max(1, baseline.technicians + delta.technicians),
    radiologists: Math.max(1, baseline.radiologists + delta.radiologists),
    supportStaff: Math.max(1, baseline.supportStaff + delta.supportStaff),
  };
}

/** Score a candidate: feasible = meets BOTH wait constraint AND minimum throughput */
function scoreResult(
  summary: SimulationSummary,
  constraint: OptimiserConstraint,
  baselineCompletedPatients: number
): { score: number; feasible: boolean } {
  // Minimum throughput: must serve at least 60% of baseline patients
  // This prevents degenerate "remove all machines → 0 wait → trivially feasible" solutions
  const minPatients = Math.max(1, baselineCompletedPatients * 0.6);
  const meetsWait = summary.p90WaitMinutes <= constraint.maxWaitMinutes;
  const meetsThroughput = summary.completedPatients >= minPatients;
  const feasible = meetsWait && meetsThroughput;

  // Base score is net profit (or revenue if profit not available)
  let score = summary.totalProfit ?? summary.actualRevenue;

  // Penalty for wait time violation (proportional to overshoot)
  if (!meetsWait) {
    const waitOvershoot = summary.p90WaitMinutes - constraint.maxWaitMinutes;
    score -= waitOvershoot * 300;
  }

  // Heavy penalty for throughput loss — serving fewer patients is almost always wrong
  if (!meetsThroughput) {
    const patientShortfall = minPatients - summary.completedPatients;
    score -= patientShortfall * 2000;
  }

  return { score, feasible };
}

/** Whether two configs produce the same resource allocation (dedup) */
function configKey(config: ScenarioInput["resourceConfig"]): string {
  return [
    config.xRayMachines, config.ctMachines, config.mriMachines,
    config.portableXRayMachines, config.ultrasoundMachines,
    config.technicians, config.radiologists, config.supportStaff
  ].join(",");
}

/**
 * Main optimizer entry point.
 * Uses Latin Hypercube Sampling to generate `numSamples` candidate configurations,
 * runs each through the simulator, and returns the top 5 ranked by score.
 */
export function runOptimizer(
  scenario: ScenarioInput,
  horizonDays: number,
  seed: number,
  constraint: OptimiserConstraint,
  numSamples = 220,
  enabledKnobKeys?: KnobKey[]
): CandidateResult[] {
  const rng = makeRng(seed + 9999);

  // Filter knob specs to only the enabled knobs; disabled knobs stay at baseline (delta = 0)
  const activeSpecs = enabledKnobKeys && enabledKnobKeys.length > 0
    ? KNOB_SPECS.filter(s => enabledKnobKeys.includes(s.key))
    : KNOB_SPECS;
  const dims = activeSpecs.length;

  // Run baseline first to establish the throughput reference point
  const baselineResult = runSimulation(scenario, horizonDays, seed);
  const baselineCompletedPatients = baselineResult.summary.completedPatients;

  // Generate LHS samples
  const lhsSamples = latinHypercubeSample(numSamples, dims, rng);

  const baselineDelta: KnobDelta = { xRayMachines: 0, ctMachines: 0, mriMachines: 0, portableXRayMachines: 0, ultrasoundMachines: 0, technicians: 0, radiologists: 0, supportStaff: 0 };

  const seen = new Set<string>();
  const candidates: CandidateResult[] = [];

  // Include baseline itself
  const baselineKey = configKey(scenario.resourceConfig);
  seen.add(baselineKey);
  const bScore = scoreResult(baselineResult.summary, constraint, baselineCompletedPatients);
  candidates.push({ delta: baselineDelta, resourceConfig: scenario.resourceConfig, summary: baselineResult.summary, ...bScore });

  // Run all LHS candidates
  for (let i = 0; i < numSamples; i++) {
    const delta: KnobDelta = {
      xRayMachines: 0, ctMachines: 0, mriMachines: 0,
      portableXRayMachines: 0, ultrasoundMachines: 0,
      technicians: 0, radiologists: 0, supportStaff: 0,
    };

    activeSpecs.forEach((spec, d) => {
      delta[spec.key] = mapToInt(lhsSamples[i][d], spec.min, spec.max);
    });

    const resourceConfig = applyDelta(scenario.resourceConfig, delta);
    const key = configKey(resourceConfig);
    if (seen.has(key)) continue;
    seen.add(key);

    const candidateScenario: ScenarioInput = { ...scenario, resourceConfig };
    const result = runSimulation(candidateScenario, horizonDays, seed);
    const { score, feasible } = scoreResult(result.summary, constraint, baselineCompletedPatients);

    candidates.push({ delta, resourceConfig, summary: result.summary, score, feasible });
  }

  // Sort: feasible first (by profit desc), then infeasible (by score desc, so near-misses rank above disasters)
  candidates.sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    return b.score - a.score;
  });

  // Return top 5
  return candidates.slice(0, 5);
}

/** Produce a human-readable diff between baseline and a candidate */
export function describeChanges(baseline: ScenarioInput["resourceConfig"], candidate: ScenarioInput["resourceConfig"]): string[] {
  const changes: string[] = [];
  const fields: Array<[keyof typeof baseline, string]> = [
    ["xRayMachines", "X-Ray machines"],
    ["ctMachines", "CT scanners"],
    ["mriMachines", "MRI scanners"],
    ["portableXRayMachines", "Portable X-Ray machines"],
    ["ultrasoundMachines", "Ultrasound machines"],
    ["technicians", "Technicians"],
    ["radiologists", "Radiologists"],
    ["supportStaff", "Support staff"],
  ];

  for (const [key, label] of fields) {
    const diff = (candidate[key] as number) - (baseline[key] as number);
    if (diff !== 0) {
      changes.push(`${diff > 0 ? "+" : ""}${diff} ${label} (${baseline[key] as number} → ${candidate[key] as number})`);
    }
  }

  return changes.length > 0 ? changes : ["No changes from baseline"];
}
