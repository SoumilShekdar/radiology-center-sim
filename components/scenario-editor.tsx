"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { DAY_NAMES, HORIZON_OPTIONS, MODALITY_LABELS } from "@/lib/constants";
import { runMonteCarloAction, runSimulationAction, saveScenarioAction } from "@/lib/actions";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import { DEFAULT_SCENARIO, SAMPLE_SCENARIOS } from "@/lib/sample-scenarios";
import type { ScenarioInput } from "@/lib/types";

type Props = {
  initialScenario: ScenarioInput;
  mode: "create" | "edit";
  viewMode: "basic" | "advanced";
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalize(values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0) {
    return values;
  }
  return values.map((value) => Number((value / total).toFixed(4)));
}

function buildExpectedHourlyDistribution(openHour: number, closeHour: number, peakHour: number, spread: number) {
  const raw = Array.from({ length: 24 }, (_, hour) => {
    if (hour < openHour || hour >= closeHour) {
      return 0;
    }

    const distance = (hour - peakHour) / Math.max(spread, 0.5);
    return Math.exp(-0.5 * distance * distance);
  });

  return normalize(raw);
}

function averageOpenWindow(scenario: ScenarioInput) {
  const enabled = scenario.operatingHours.filter((day) => day.enabled);
  if (enabled.length === 0) {
    return { openHour: 8, closeHour: 18 };
  }

  return {
    openHour: Math.round(enabled.reduce((sum, day) => sum + day.openHour, 0) / enabled.length),
    closeHour: Math.round(enabled.reduce((sum, day) => sum + day.closeHour, 0) / enabled.length)
  };
}

function buildShiftedCounts(totalOnShiftTarget: number, openHour: number, closeHour: number, edgeCoverage: number) {
  return Array.from({ length: 24 }, (_, hour) => {
    if (hour < openHour || hour >= closeHour) {
      return 0;
    }

    if (hour === openHour || hour === closeHour - 1) {
      return Math.min(totalOnShiftTarget, Math.max(1, Math.round(totalOnShiftTarget * edgeCoverage)));
    }

    return totalOnShiftTarget;
  });
}

function coverageFromCounts(counts: number[], total: number) {
  const safeTotal = Math.max(total, 1);
  return counts.map((count, hour) => ({
    hour,
    coverage: total === 0 ? 0 : clamp(count, 0, total) / safeTotal
  }));
}

function syncRoomConfigs(current: ScenarioInput["workflowConfig"]["roomConfigs"], nextCount: number) {
  const trimmed = current.slice(0, nextCount);
  if (trimmed.length === nextCount) {
    return trimmed;
  }

  const additions = Array.from({ length: nextCount - trimmed.length }, (_, index) => ({
    id: `room-${trimmed.length + index + 1}`,
    name: `Room ${trimmed.length + index + 1}`,
    supportedModalities: ["XRAY", "CT", "MRI", "ULTRASOUND"] as ScenarioInput["workflowConfig"]["roomConfigs"][number]["supportedModalities"],
    dedicatedModality: "NONE" as const
  }));

  return [...trimmed, ...additions];
}

function syncChangingRoomConfigs(current: ScenarioInput["workflowConfig"]["changingRoomConfigs"], nextCount: number) {
  const trimmed = current.slice(0, nextCount);
  if (trimmed.length === nextCount) {
    return trimmed;
  }

  const additions = Array.from({ length: nextCount - trimmed.length }, (_, index) => ({
    id: `changing-room-${trimmed.length + index + 1}`,
    name: `Changing Room ${trimmed.length + index + 1}`,
    gender: "UNISEX" as const
  }));

  return [...trimmed, ...additions];
}

function HourlyDemandChart({
  values,
  onChange
}: {
  values: number[];
  onChange: (next: number[]) => void;
}) {
  const maxValue = Math.max(...values, 0.01);

  return (
    <div className="stack">
      <div className="demand-chart">
        {values.map((value, index) => (
          <div className="demand-bar-group" key={`bar-${index}`}>
            <button
              type="button"
              className="demand-bar-button"
              onClick={() => {
                const next = [...values];
                next[index] = Number((next[index] + 0.01).toFixed(4));
                onChange(next);
              }}
              aria-label={`Increase demand for hour ${index}`}
            >
              <div className="demand-bar-fill" style={{ height: `${Math.max(6, (value / maxValue) * 100)}%` }} />
            </button>
            <span className="demand-bar-label">{index}</span>
          </div>
        ))}
      </div>
      <div className="muted">Each bar is an hour of the day. Click a bar to bump that hour up, or edit the exact values below.</div>
    </div>
  );
}

function SectionBlock({
  kicker,
  title,
  description,
  defaultOpen = false,
  children
}: {
  kicker: string;
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className="config-section" open={defaultOpen}>
      <summary className="config-summary">
        <div>
          <div className="eyebrow">{kicker}</div>
          <h3 className="section-title">{title}</h3>
          <p className="muted">{description}</p>
        </div>
        <span className="tag config-toggle" />
      </summary>
      <div className="section-body">{children}</div>
    </details>
  );
}

export function ScenarioEditor({ initialScenario, mode, viewMode }: Props) {
  const router = useRouter();
  const [scenario, setScenario] = useState<ScenarioInput>(initialScenario);
  const [isSaving, setIsSaving] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [queuedRunId, setQueuedRunId] = useState<string | null>(null);
  const [runSeedManuallyEdited, setRunSeedManuallyEdited] = useState(false);
  const [activeRunKind, setActiveRunKind] = useState<"seed" | "random" | "montecarlo" | null>(null);
  const [isRunPending, startRunTransition] = useTransition();
  const [runConfig, setRunConfig] = useState({
    horizonDays: 7,
    seed: initialScenario.seedDefault,
    monteCarloIterations: 25
  });

  useEffect(() => {
    if (!runSeedManuallyEdited) {
      setRunConfig((current) => ({ ...current, seed: scenario.seedDefault }));
    }
  }, [runSeedManuallyEdited, scenario.seedDefault]);

  const updateScenario = <K extends keyof ScenarioInput>(key: K, value: ScenarioInput[K]) => {
    setScenario((current) => ({ ...current, [key]: value }));
  };

  const openWindow = averageOpenWindow(scenario);
  const demandPeakHour = clamp(Math.round((openWindow.openHour + openWindow.closeHour) / 2), 0, 23);
  const technicianSchedulePreview = scenario.staffRotation.technicians.map((point) =>
    Math.round(point.coverage * scenario.resourceConfig.technicians)
  );
  const supportSchedulePreview = scenario.staffRotation.supportStaff.map((point) =>
    Math.round(point.coverage * scenario.resourceConfig.supportStaff)
  );
  const radiologistSchedulePreview = scenario.staffRotation.radiologists.map((point) =>
    Math.round(point.coverage * scenario.resourceConfig.radiologists)
  );

  const updateOnShiftCount = (group: keyof ScenarioInput["staffRotation"], index: number, onShiftCount: number) => {
    const total =
      group === "technicians"
        ? scenario.resourceConfig.technicians
        : group === "supportStaff"
          ? scenario.resourceConfig.supportStaff
          : scenario.resourceConfig.radiologists;

    const safeTotal = Math.max(total, 1);
    const safeCount = clamp(Math.round(onShiftCount), 0, total);

    updateScenario("staffRotation", {
      ...scenario.staffRotation,
      [group]: scenario.staffRotation[group].map((item, itemIndex) =>
        itemIndex === index ? { ...item, coverage: safeCount / safeTotal } : item
      )
    });
  };

  const applyEightHourShiftPreset = () => {
    const staffedHours = Math.max(openWindow.closeHour - openWindow.openHour, 8);
    const expectedTechniciansOnShift = Math.min(
      scenario.resourceConfig.technicians,
      Math.max(1, Math.round((scenario.resourceConfig.technicians * 8 * 6) / staffedHours))
    );
    const expectedSupportOnShift = Math.min(
      scenario.resourceConfig.supportStaff,
      Math.max(1, Math.round((scenario.resourceConfig.supportStaff * 8 * 6) / staffedHours))
    );
    const expectedRadiologistsOnShift = Math.min(
      scenario.resourceConfig.radiologists,
      Math.max(1, Math.round((scenario.resourceConfig.radiologists * 8 * 6) / staffedHours))
    );

    updateScenario("staffRotation", {
      technicians: coverageFromCounts(
        buildShiftedCounts(expectedTechniciansOnShift, openWindow.openHour, openWindow.closeHour, 0.6),
        scenario.resourceConfig.technicians
      ),
      supportStaff: coverageFromCounts(
        buildShiftedCounts(expectedSupportOnShift, openWindow.openHour, openWindow.closeHour, 0.6),
        scenario.resourceConfig.supportStaff
      ),
      radiologists: coverageFromCounts(
        buildShiftedCounts(expectedRadiologistsOnShift, openWindow.openHour + 1, openWindow.closeHour, 0.5),
        scenario.resourceConfig.radiologists
      )
    });
  };

  const applyScenarioPreset = (preset: ScenarioInput) => {
    setScenario({ ...preset, id: scenario.id });
    setRunSeedManuallyEdited(false);
    setRunConfig((current) => ({ ...current, seed: preset.seedDefault }));
  };

  const submitScenario = async (nextScenario = scenario) => {
    setIsSaving(true);
    setFlash(null);
    const formData = new FormData();
    formData.set("scenario", JSON.stringify(nextScenario));

    try {
      const result = await saveScenarioAction(formData);
      setScenario((current) => ({ ...current, id: result.id }));
      setFlash("Scenario saved.");
      if (mode === "create") {
        router.replace(viewMode === "advanced" ? `/scenarios/${result.id}/advanced` : `/scenarios/${result.id}`);
      } else {
        router.refresh();
      }
      return result.id;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save scenario.";
      setFlash(message);
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const generateRandomSeed = () => {
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return Math.max(1, values[0]);
    }
    return Math.max(1, Math.floor(Math.random() * 2147483647));
  };

  const saveAndRun = async (seedToUse: number) => {
    const scenarioId = scenario.id ?? (await submitScenario());
    if (!scenarioId) {
      return;
    }

    const formData = new FormData();
    formData.set("scenarioId", scenarioId);
    formData.set("horizonDays", String(runConfig.horizonDays));
    formData.set("seed", String(seedToUse));

    startRunTransition(async () => {
      const result = await runSimulationAction(formData);
      setQueuedRunId(result.runId);
      setFlash("Simulation started in the background.");
      setActiveRunKind(null);
      router.refresh();
    });
  };

  const saveAndRunMonteCarlo = async (seedToUse: number) => {
    const scenarioId = scenario.id ?? (await submitScenario());
    if (!scenarioId) {
      return;
    }

    const formData = new FormData();
    formData.set("scenarioId", scenarioId);
    formData.set("horizonDays", String(runConfig.horizonDays));
    formData.set("seed", String(seedToUse));
    formData.set("iterations", String(runConfig.monteCarloIterations));

    startRunTransition(async () => {
      const result = await runMonteCarloAction(formData);
      setQueuedRunId(result.runId);
      setFlash("Monte Carlo run started in the background.");
      setActiveRunKind(null);
      router.refresh();
    });
  };

  const goToAdvanced = async () => {
    if (mode === "create") {
      const scenarioId = scenario.id ?? (await submitScenario());
      if (!scenarioId) {
        return;
      }
      router.push(`/scenarios/${scenarioId}/advanced`);
      return;
    }
    router.push(`/scenarios/${scenario.id}/advanced`);
  };

  const goToBasic = () => {
    if (mode === "create") {
      router.push("/scenarios/new");
      return;
    }
    router.push(`/scenarios/${scenario.id}`);
  };

  const basicSections = (
    <>
      <section className="panel stack">
        <div>
          <div className="eyebrow">Quick Start</div>
          <h2 className="section-title">Build a scenario without filling every field first</h2>
          <p className="muted">Pick a preset, auto-fill staffing, and generate an expected demand curve. Demand and service mix are used as probabilistic weights, not fixed schedules.</p>
        </div>
        <div className="preset-grid">
          {SAMPLE_SCENARIOS.map((preset) => (
            <button key={preset.name} type="button" className="preset-card" onClick={() => applyScenarioPreset(preset)}>
              <strong>{preset.name}</strong>
              <span>{preset.description}</span>
            </button>
          ))}
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={applyEightHourShiftPreset}>
            Auto-fill 8h / 6d shifts
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              updateScenario("demandProfile", {
                ...scenario.demandProfile,
                hourlyDistribution: buildExpectedHourlyDistribution(
                  openWindow.openHour,
                  openWindow.closeHour,
                  demandPeakHour,
                  Math.max(2, Math.round((openWindow.closeHour - openWindow.openHour) / 4))
                )
              })
            }
          >
            Use expected demand curve
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              updateScenario("serviceMix", scenario.serviceMix.map((item, index, list) => ({
                ...item,
                weight: Number((1 / list.length).toFixed(4))
              })))
            }
          >
            Even service mix
          </button>
        </div>
      </section>

      <SectionBlock
        kicker="Section 1"
        title="Scenario Description"
        description="Name the scenario, choose a seed, currency, downtime rate, and capture the planning context in plain language."
        defaultOpen
      >
        <div className="field-grid">
          <div className="field">
            <label htmlFor="name">Scenario name</label>
            <input id="name" value={scenario.name} onChange={(event) => updateScenario("name", event.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="currency">Currency</label>
            <select id="currency" value={scenario.currency} onChange={(event) => updateScenario("currency", event.target.value)}>
              {SUPPORTED_CURRENCIES.map((currency) => (
                <option key={currency} value={currency}>
                  {currency}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="seed">Default seed</label>
            <input id="seed" type="number" value={scenario.seedDefault} onChange={(event) => updateScenario("seedDefault", Number(event.target.value))} />
          </div>
          <div className="field">
            <label htmlFor="downtime">Equipment downtime rate</label>
            <input
              id="downtime"
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={scenario.downtimeRate}
              onChange={(event) => updateScenario("downtimeRate", Number(event.target.value))}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="description">Description</label>
          <textarea id="description" value={scenario.description} onChange={(event) => updateScenario("description", event.target.value)} />
        </div>
      </SectionBlock>

      <SectionBlock
        kicker="Section 2"
        title="Infrastructure Setup"
        description="Configure machine counts and physical spaces. Portable X-Ray machines act as flexible X-Ray capacity for immobile patients."
        defaultOpen
      >
        <div className="flash" style={{ background: "rgba(53, 108, 92, 0.08)", color: "var(--ink)" }}>
          Portable X-Ray is a special X-Ray path for immobile patients, but standard X-Ray requests can still spill over to portable machines when needed.
        </div>
        <div className="field-grid">
          {[
            ["xRayMachines", "X-Ray machines"],
            ["ctMachines", "CT scanners"],
            ["mriMachines", "MRI scanners"],
            ["portableXRayMachines", "Portable X-Ray machines"],
            ["ultrasoundMachines", "Ultrasounds"],
            ["rooms", "Procedure rooms"],
            ["changingRooms", "Changing rooms"]
          ].map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="number"
                min="0"
                value={scenario.resourceConfig[key as keyof ScenarioInput["resourceConfig"]]}
                onChange={(event) => {
                  const nextValue = Number(event.target.value);
                  updateScenario("resourceConfig", {
                    ...scenario.resourceConfig,
                    [key]: nextValue
                  });

                  if (key === "rooms") {
                    updateScenario("workflowConfig", {
                      ...scenario.workflowConfig,
                      roomConfigs: syncRoomConfigs(scenario.workflowConfig.roomConfigs, nextValue)
                    });
                  }

                  if (key === "changingRooms") {
                    updateScenario("workflowConfig", {
                      ...scenario.workflowConfig,
                      changingRoomConfigs: syncChangingRoomConfigs(scenario.workflowConfig.changingRoomConfigs, nextValue)
                    });
                  }
                }}
              />
            </div>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock
        kicker="Section 3"
        title="Staff Setup"
        description="Set total team size first. Hourly on-shift staffing is configured in Advanced Options."
        defaultOpen
      >
        <div className="field-grid">
          {[
            ["technicians", "Technicians"],
            ["supportStaff", "Support staff"],
            ["radiologists", "Radiologists"]
          ].map(([key, label]) => (
            <div className="field" key={key}>
              <label>{label}</label>
              <input
                type="number"
                min="0"
                value={scenario.resourceConfig[key as keyof ScenarioInput["resourceConfig"]]}
                onChange={(event) =>
                  updateScenario("resourceConfig", {
                    ...scenario.resourceConfig,
                    [key]: Number(event.target.value)
                  })
                }
              />
            </div>
          ))}
        </div>
      </SectionBlock>
    </>
  );

  const advancedSections = (
    <>
      <section className="panel stack">
        <div>
          <div className="eyebrow">Advanced Options</div>
          <h2 className="section-title">Tune the detailed operating model</h2>
          <p className="muted">This page is for department-level assumptions like operating hours, staffing by hour, demand curves, service mix, and average modality timings. The simulator samples patient-level duration variability around those averages.</p>
        </div>
        <div className="button-row">
          <button type="button" className="secondary-button" onClick={goToBasic}>
            Back to Basic Options
          </button>
        </div>
      </section>

      <SectionBlock
        kicker="Section 4"
        title="Operating Hours"
        description="Department-level availability for rooms, machines, and scheduled staff."
        defaultOpen
      >
        <div className="stack">
          <p className="muted">If a day is closed, no scans or prep happen that day. Open and close hours define when the department can actually process work.</p>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                updateScenario(
                  "operatingHours",
                  scenario.operatingHours.map((day, index) =>
                    index === 0 ? { ...day, enabled: false } : { enabled: true, openHour: 7, closeHour: 18 }
                  )
                )
              }
            >
              Apply weekday 7-18
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                updateScenario(
                  "operatingHours",
                  scenario.operatingHours.map(() => ({ enabled: true, openHour: 6, closeHour: 22 }))
                )
              }
            >
              Open all week
            </button>
          </div>
          <div className="hours-grid">
            {scenario.operatingHours.map((entry, index) => (
              <div className="field-grid compact-grid hours-row" key={DAY_NAMES[index]}>
                <div className="field">
                  <label>{DAY_NAMES[index]}</label>
                  <select
                    value={String(entry.enabled)}
                    onChange={(event) =>
                      updateScenario("operatingHours", scenario.operatingHours.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, enabled: event.target.value === "true" } : item
                      ))
                    }
                  >
                    <option value="true">Open</option>
                    <option value="false">Closed</option>
                  </select>
                </div>
                <div className="field">
                  <label>Open hour</label>
                  <input
                    type="number"
                    min="0"
                    max="23"
                    value={entry.openHour}
                    onChange={(event) =>
                      updateScenario("operatingHours", scenario.operatingHours.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, openHour: Number(event.target.value) } : item
                      ))
                    }
                  />
                </div>
                <div className="field">
                  <label>Close hour</label>
                  <input
                    type="number"
                    min="1"
                    max="24"
                    value={entry.closeHour}
                    onChange={(event) =>
                      updateScenario("operatingHours", scenario.operatingHours.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, closeHour: Number(event.target.value) } : item
                      ))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </SectionBlock>

      <SectionBlock
        kicker="Section 5"
        title="Staff Rotation"
        description="Plan how many people are on shift by hour, or auto-fill from a simple staffing heuristic."
        defaultOpen
      >
        <div className="stack">
          <div className="flash" style={{ background: "rgba(181, 93, 56, 0.08)", color: "var(--ink)" }}>
            Auto-fill uses a simple planning rule: 8-hour shifts and 6 working days per week for each team member, spread across the open day.
          </div>
          <p className="muted">Radiologists are allowed to report outside scan operating hours if you staff them in those hours, which lets the model represent evening or overnight reporting backlogs being cleared.</p>
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={applyEightHourShiftPreset}>
              Auto-fill 8h / 6d shifts
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                updateScenario("staffRotation", {
                  technicians: scenario.staffRotation.technicians.map((point) => ({
                    ...point,
                    coverage:
                      point.hour >= openWindow.openHour && point.hour < openWindow.closeHour
                        ? 1
                        : scenario.resourceConfig.technicians === 0
                          ? 0
                          : 1 / Math.max(scenario.resourceConfig.technicians, 1)
                  })),
                  supportStaff: scenario.staffRotation.supportStaff.map((point) => ({
                    ...point,
                    coverage:
                      point.hour >= openWindow.openHour && point.hour < openWindow.closeHour
                        ? 1
                        : scenario.resourceConfig.supportStaff === 0
                          ? 0
                          : 1 / Math.max(scenario.resourceConfig.supportStaff, 1)
                  })),
                  radiologists: scenario.staffRotation.radiologists.map((point) => ({
                    ...point,
                    coverage:
                      point.hour >= openWindow.openHour + 1 && point.hour < openWindow.closeHour - 1
                        ? 1
                        : scenario.resourceConfig.radiologists === 0
                          ? 0
                          : 1 / Math.max(scenario.resourceConfig.radiologists, 1)
                  }))
                })
              }
            >
              Match operating hours
            </button>
          </div>
          <p className="muted">Total team size stays in Basic Options. Here you only set how many are actually present each hour.</p>
          {(["technicians", "supportStaff", "radiologists"] as const).map((group) => (
            <div key={group} className="stack rotation-group">
              <div className="eyebrow">{group}</div>
              <div className="shift-summary">
                {(group === "technicians"
                  ? technicianSchedulePreview
                  : group === "supportStaff"
                    ? supportSchedulePreview
                    : radiologistSchedulePreview
                )
                  .map((count, index) => `${index}:00 ${count}`)
                  .slice(openWindow.openHour, Math.min(openWindow.closeHour + 2, 24))
                  .join(" • ")}
              </div>
              <div className="staff-grid">
                {scenario.staffRotation[group].map((point, index) => (
                  <div className="field" key={`${group}-${point.hour}`}>
                    <label>{point.hour}:00</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      max={
                        group === "technicians"
                          ? scenario.resourceConfig.technicians
                          : group === "supportStaff"
                            ? scenario.resourceConfig.supportStaff
                            : scenario.resourceConfig.radiologists
                      }
                      value={
                        group === "technicians"
                          ? technicianSchedulePreview[index]
                          : group === "supportStaff"
                            ? supportSchedulePreview[index]
                            : radiologistSchedulePreview[index]
                      }
                      onChange={(event) => updateOnShiftCount(group, index, Number(event.target.value))}
                    />
                    <div className="helper-copy">
                      Team coverage:{" "}
                      {group === "technicians"
                        ? scenario.staffRotation.technicians[index].coverage.toFixed(2)
                        : group === "supportStaff"
                          ? scenario.staffRotation.supportStaff[index].coverage.toFixed(2)
                          : scenario.staffRotation.radiologists[index].coverage.toFixed(2)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock
        kicker="Section 6"
        title="Demand Profile + Day of Week Demand"
        description="Define weighted arrival patterns and weekly demand shifts. The simulator still samples patients probabilistically around those weights."
      >
        <div className="grid-2">
          <div className="stack">
            <div className="field-grid">
              <div className="field">
                <label>Base daily patients</label>
                <input
                  type="number"
                  min="1"
                  value={scenario.demandProfile.baseDailyPatients}
                  onChange={(event) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      baseDailyPatients: Number(event.target.value)
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Inpatient fraction</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scenario.demandProfile.inpatientFraction}
                  onChange={(event) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      inpatientFraction: Number(event.target.value)
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Female patient fraction</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scenario.demandProfile.femaleFraction}
                  onChange={(event) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      femaleFraction: Number(event.target.value)
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Urgent fraction</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scenario.demandProfile.urgentFraction}
                  onChange={(event) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      urgentFraction: Number(event.target.value)
                    })
                  }
                />
              </div>
              <div className="field">
                <label>No-show rate</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scenario.demandProfile.noShowRate}
                  onChange={(event) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      noShowRate: Number(event.target.value)
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Unexpected leave rate</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scenario.demandProfile.unexpectedLeaveRate}
                  onChange={(event) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      unexpectedLeaveRate: Number(event.target.value)
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Repeat scan rate</label>
                <input
                  type="number"
                  min="0"
                  max="1"
                  step="0.01"
                  value={scenario.demandProfile.repeatScanRate}
                  onChange={(event) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      repeatScanRate: Number(event.target.value)
                    })
                  }
                />
              </div>
              <div className="field">
                <label>Result communication minutes</label>
                <input
                  type="number"
                  min="0"
                  value={scenario.demandProfile.resultCommunicationMinutes}
                  onChange={(event) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      resultCommunicationMinutes: Number(event.target.value)
                    })
                  }
                />
              </div>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  updateScenario("demandProfile", {
                    ...scenario.demandProfile,
                    hourlyDistribution: buildExpectedHourlyDistribution(
                      openWindow.openHour,
                      openWindow.closeHour,
                      demandPeakHour,
                      Math.max(2, Math.round((openWindow.closeHour - openWindow.openHour) / 4))
                    )
                  })
                }
              >
                Expected bell curve
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  updateScenario("demandProfile", {
                    ...scenario.demandProfile,
                    hourlyDistribution: normalize(scenario.demandProfile.hourlyDistribution)
                  })
                }
              >
                Normalize hourly distribution
              </button>
            </div>
            <HourlyDemandChart
              values={scenario.demandProfile.hourlyDistribution}
              onChange={(hourlyDistribution) =>
                updateScenario("demandProfile", {
                  ...scenario.demandProfile,
                  hourlyDistribution
                })
              }
            />
            <div className="field-grid micro-grid">
              {scenario.demandProfile.hourlyDistribution.map((value, index) => (
                <div className="field" key={`hour-${index}`}>
                  <label>{index}:00</label>
                  <div className="demand-input-stack">
                    <input
                      type="range"
                      min="0"
                      max="0.2"
                      step="0.005"
                      value={value}
                      onChange={(event) =>
                        updateScenario("demandProfile", {
                          ...scenario.demandProfile,
                          hourlyDistribution: scenario.demandProfile.hourlyDistribution.map((item, itemIndex) =>
                            itemIndex === index ? Number(event.target.value) : item
                          )
                        })
                      }
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={value}
                      onChange={(event) =>
                        updateScenario("demandProfile", {
                          ...scenario.demandProfile,
                          hourlyDistribution: scenario.demandProfile.hourlyDistribution.map((item, itemIndex) =>
                            itemIndex === index ? Number(event.target.value) : item
                          )
                        })
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="stack">
            <h3 className="section-title">Day-of-Week Demand</h3>
            <div className="field-grid">
              {DAY_NAMES.map((day, index) => (
                <div className="field" key={day}>
                  <label>{day}</label>
                  <input
                    type="number"
                    min="0"
                    step="0.05"
                    value={scenario.demandProfile.dayOfWeekMultiplier[index]}
                    onChange={(event) =>
                      updateScenario("demandProfile", {
                        ...scenario.demandProfile,
                        dayOfWeekMultiplier: scenario.demandProfile.dayOfWeekMultiplier.map((item, itemIndex) =>
                          itemIndex === index ? Number(event.target.value) : item
                        )
                      })
                    }
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </SectionBlock>

          <SectionBlock
        kicker="Section 7"
        title="Service Mix"
        description="Control weighted modality demand. Each arriving patient is assigned a service probabilistically from these weights."
      >
        <div className="button-row">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              updateScenario("serviceMix", scenario.serviceMix.map((item, index, list) => ({
                ...item,
                weight: Number((1 / list.length).toFixed(4))
              })))
            }
          >
            Even split
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => updateScenario("serviceMix", normalize(scenario.serviceMix.map((item) => item.weight)).map((weight, index) => ({
              ...scenario.serviceMix[index],
              weight
            })))}
          >
            Normalize mix
          </button>
        </div>
        <div className="field-grid">
          {scenario.serviceMix.map((item, index) => (
            <div className="field" key={item.modality}>
              <label>{item.modality === "PORTABLE_XRAY" ? "Portable X-Ray requests" : MODALITY_LABELS[item.modality]}</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={item.weight}
                onChange={(event) =>
                  updateScenario("serviceMix", scenario.serviceMix.map((mix, mixIndex) =>
                    mixIndex === index ? { ...mix, weight: Number(event.target.value) } : mix
                  ))
                }
              />
            </div>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock
        kicker="Section 8"
        title="Service Configuration"
        description="Tune prep, exam, cleanup, and report times. Defaults are meant to feel like industry-style operational baselines."
      >
        <div className="flash" style={{ background: "rgba(53, 108, 92, 0.08)", color: "var(--ink)" }}>
          Workflow in this version: support staff greet and route the patient, only CT requires a changing room, technicians perform one scan at a time, and radiologist report time is configurable per modality. Prep, cleanup, reporting, and exam times are treated as averages, and the engine samples patient-level variation around them during each run.
        </div>
        <div className="service-config-grid">
          {scenario.serviceConfigs.map((service, index) => (
            <div className="scenario-card stack" key={service.modality}>
              <strong>{MODALITY_LABELS[service.modality]}</strong>
              <div className="field">
                <label>Charge</label>
                <input
                  type="number"
                  min="0"
                  value={service.charge}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, charge: Number(event.target.value) } : item
                    ))
                  }
                />
              </div>
              <div className="field">
                <label>Exam duration minutes</label>
                <input
                  type="number"
                  min="5"
                  value={service.examDurationMinutes}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, examDurationMinutes: Number(event.target.value) } : item
                    ))
                  }
                />
              </div>
              <div className="field">
                <label>Prep minutes</label>
                <input
                  type="number"
                  min="0"
                  value={service.prepDurationMinutes}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, prepDurationMinutes: Number(event.target.value) } : item
                    ))
                  }
                />
                <div className="helper-copy">{service.modality === "CT" ? "Uses support staff plus changing room." : "Uses support staff only."}</div>
              </div>
              <div className="field">
                <label>Cleanup minutes</label>
                <input
                  type="number"
                  min="0"
                  value={service.cleanupMinutes}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, cleanupMinutes: Number(event.target.value) } : item
                    ))
                  }
                />
              </div>
              <div className="field">
                <label>Reporting minutes</label>
                <input
                  type="number"
                  min="1"
                  value={service.reportingMinutes}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, reportingMinutes: Number(event.target.value) } : item
                    ))
                  }
                />
                <div className="helper-copy">Time radiologists spend producing the report for this modality.</div>
              </div>
            </div>
          ))}
        </div>
      </SectionBlock>

      <SectionBlock
        kicker="Section 9"
        title="Workflow Routing"
        description="Define which rooms can host each modality, which modalities require changing rooms, and how changing rooms are gender-assigned."
      >
        <div className="stack">
          <div className="flash" style={{ background: "rgba(53, 108, 92, 0.08)", color: "var(--ink)" }}>
            Portable X-Ray is modeled as a bedside/mobile workflow by default and does not consume a procedure room. All other modalities must route through a compatible room definition below.
          </div>
          <div className="service-config-grid">
            {scenario.workflowConfig.roomConfigs.map((room, index) => (
              <div className="scenario-card stack" key={room.id}>
                <strong>{room.name}</strong>
                <div className="field">
                  <label>Room name</label>
                  <input
                    value={room.name}
                    onChange={(event) =>
                      updateScenario("workflowConfig", {
                        ...scenario.workflowConfig,
                        roomConfigs: scenario.workflowConfig.roomConfigs.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item
                        )
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Dedicated modality</label>
                  <select
                    value={room.dedicatedModality}
                    onChange={(event) =>
                      updateScenario("workflowConfig", {
                        ...scenario.workflowConfig,
                        roomConfigs: scenario.workflowConfig.roomConfigs.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, dedicatedModality: event.target.value as typeof item.dedicatedModality } : item
                        )
                      })
                    }
                  >
                    <option value="NONE">Flexible</option>
                    {Object.entries(MODALITY_LABELS)
                      .filter(([modality]) => modality !== "PORTABLE_XRAY")
                      .map(([modality, label]) => (
                        <option key={modality} value={modality}>
                          {label}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <label>Compatible modalities</label>
                  <div className="button-row">
                    {Object.entries(MODALITY_LABELS)
                      .filter(([modality]) => modality !== "PORTABLE_XRAY")
                      .map(([modality, label]) => {
                        const typedModality = modality as ScenarioInput["serviceMix"][number]["modality"];
                        const enabled = room.supportedModalities.includes(typedModality);
                        return (
                          <button
                            key={`${room.id}-${modality}`}
                            type="button"
                            className="secondary-button"
                            onClick={() =>
                              updateScenario("workflowConfig", {
                                ...scenario.workflowConfig,
                                roomConfigs: scenario.workflowConfig.roomConfigs.map((item, itemIndex) =>
                                  itemIndex === index
                                    ? {
                                        ...item,
                                        supportedModalities: enabled
                                          ? item.supportedModalities.filter((value) => value !== modality)
                                          : [...item.supportedModalities, typedModality]
                                      }
                                    : item
                                )
                              })
                            }
                          >
                            {enabled ? `On: ${label}` : `Off: ${label}`}
                          </button>
                        );
                      })}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="service-config-grid">
            {scenario.workflowConfig.changingRoomConfigs.map((room, index) => (
              <div className="scenario-card stack" key={room.id}>
                <strong>{room.name}</strong>
                <div className="field">
                  <label>Changing room name</label>
                  <input
                    value={room.name}
                    onChange={(event) =>
                      updateScenario("workflowConfig", {
                        ...scenario.workflowConfig,
                        changingRoomConfigs: scenario.workflowConfig.changingRoomConfigs.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, name: event.target.value } : item
                        )
                      })
                    }
                  />
                </div>
                <div className="field">
                  <label>Assigned gender</label>
                  <select
                    value={room.gender}
                    onChange={(event) =>
                      updateScenario("workflowConfig", {
                        ...scenario.workflowConfig,
                        changingRoomConfigs: scenario.workflowConfig.changingRoomConfigs.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, gender: event.target.value as typeof item.gender } : item
                        )
                      })
                    }
                  >
                    <option value="FEMALE">Female</option>
                    <option value="MALE">Male</option>
                    <option value="UNISEX">Unisex</option>
                  </select>
                </div>
              </div>
            ))}
          </div>

          <div className="field-grid">
            {Object.entries(MODALITY_LABELS).map(([modality, label]) => (
              <div className="field" key={`changing-rule-${modality}`}>
                <label>{label} requires changing room</label>
                <select
                  value={String(scenario.workflowConfig.changingRoomByModality[modality as ScenarioInput["serviceMix"][number]["modality"]])}
                  onChange={(event) =>
                    updateScenario("workflowConfig", {
                      ...scenario.workflowConfig,
                      changingRoomByModality: {
                        ...scenario.workflowConfig.changingRoomByModality,
                        [modality]: event.target.value === "true"
                      }
                    })
                  }
                >
                  <option value="false">No</option>
                  <option value="true">Yes</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </SectionBlock>

      <SectionBlock
        kicker="Section 10"
        title="Appointments"
        description="Toggle scheduled outpatient appointments versus pure walk-in demand."
      >
        <div className="field-grid">
          <div className="field">
            <label>Scheduled outpatient appointments</label>
            <select
              value={String(scenario.appointmentPolicy.enabled)}
              onChange={(event) =>
                updateScenario("appointmentPolicy", {
                  ...scenario.appointmentPolicy,
                  enabled: event.target.value === "true"
                })
              }
            >
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          </div>
          <div className="field">
            <label>Scheduled fraction of outpatients</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={scenario.appointmentPolicy.outpatientScheduledFraction}
              onChange={(event) =>
                updateScenario("appointmentPolicy", {
                  ...scenario.appointmentPolicy,
                  outpatientScheduledFraction: Number(event.target.value)
                })
              }
            />
          </div>
          <div className="field">
            <label>Early arrival minutes</label>
            <input
              type="number"
              min="0"
              max="120"
              value={scenario.appointmentPolicy.earlyArrivalMinutes}
              onChange={(event) =>
                updateScenario("appointmentPolicy", {
                  ...scenario.appointmentPolicy,
                  earlyArrivalMinutes: Number(event.target.value)
                })
              }
            />
          </div>
          <div className="field">
            <label>Appointment arrival variance minutes</label>
            <input
              type="number"
              min="0"
              max="180"
              value={scenario.appointmentPolicy.arrivalVarianceMinutes}
              onChange={(event) =>
                updateScenario("appointmentPolicy", {
                  ...scenario.appointmentPolicy,
                  arrivalVarianceMinutes: Number(event.target.value)
                })
              }
            />
          </div>
        </div>
      </SectionBlock>
    </>
  );

  return (
    <div className="stack">
      {flash ? (
        <div className="flash">
          <div>{flash}</div>
          {queuedRunId ? (
            <div className="button-row" style={{ marginTop: 8 }}>
              <Link className="secondary-button" href={`/runs/${queuedRunId}`}>
                Open run status
              </Link>
            </div>
          ) : null}
        </div>
      ) : null}
      {viewMode === "basic" ? basicSections : advancedSections}

      <section className="panel stack">
        <div className="eyebrow">Run</div>
        <h3 className="section-title">Run Simulation</h3>
        <p className="muted">Primary outputs are wait to perform the service and time from completed service to results, with revenue and utilization as supporting context.</p>
        <div className="field-grid">
          <div className="field">
            <label>Horizon</label>
            <select
              value={runConfig.horizonDays}
              onChange={(event) => setRunConfig((current) => ({ ...current, horizonDays: Number(event.target.value) }))}
            >
              {HORIZON_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === 1 ? "1 day" : `${option} days`}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label>Seed</label>
            <input
              type="number"
              min="1"
              value={runConfig.seed}
              onChange={(event) => {
                setRunSeedManuallyEdited(true);
                setRunConfig((current) => ({ ...current, seed: Math.max(1, Number(event.target.value) || 1) }));
              }}
            />
            <div className="helper-copy">Use this for reproducible runs. The same scenario and seed will produce the same result.</div>
          </div>
          <div className="field">
            <label>Monte Carlo iterations</label>
            <input
              type="number"
              min="5"
              max="250"
              step="5"
              value={runConfig.monteCarloIterations}
              onChange={(event) =>
                setRunConfig((current) => ({
                  ...current,
                  monteCarloIterations: Math.max(5, Number(event.target.value) || 25)
                }))
              }
            />
            <div className="helper-copy">Runs a seed sweep from the base seed to show percentile bands instead of a single-seed point estimate.</div>
          </div>
        </div>
        <div className="button-row">
          {viewMode === "basic" ? (
            <button type="button" className="secondary-button" disabled={isSaving} onClick={() => void goToAdvanced()}>
              Advanced Options
            </button>
          ) : (
            <button type="button" className="secondary-button" onClick={goToBasic}>
              Basic Options
            </button>
          )}
          <button type="button" className="button" disabled={isSaving} onClick={() => void submitScenario()}>
            {mode === "create" ? "Create scenario" : "Save scenario"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving || isRunPending}
            onClick={() => {
              setActiveRunKind("seed");
              void saveAndRun(runConfig.seed);
            }}
          >
            {isRunPending && activeRunKind === "seed" ? "Queueing Seeded Run..." : "Start Seeded Run"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving || isRunPending}
            onClick={() => {
              setActiveRunKind("montecarlo");
              void saveAndRunMonteCarlo(runConfig.seed);
            }}
          >
            {isRunPending && activeRunKind === "montecarlo" ? "Queueing Monte Carlo..." : "Start Monte Carlo"}
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving || isRunPending}
            onClick={() => {
              setActiveRunKind("random");
              const randomSeed = generateRandomSeed();
              void saveAndRun(randomSeed);
            }}
          >
            {isRunPending && activeRunKind === "random" ? "Queueing Random Run..." : "Start Random Run"}
          </button>
          <button type="button" className="secondary-button" onClick={() => setScenario(DEFAULT_SCENARIO)}>
            Reset to sample baseline
          </button>
          <Link className="secondary-button" href="/">
            Back to scenarios
          </Link>
        </div>
      </section>
    </div>
  );
}
