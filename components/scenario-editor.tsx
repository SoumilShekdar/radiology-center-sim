"use client";

import { 
  Button, 
  Accordion, 
  AccordionSummary, 
  AccordionDetails, 
  Typography, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Box, 
  Stack, 
  Paper
} from "@mui/material";
import Grid from "@mui/material/Grid";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { DAY_NAMES, HORIZON_OPTIONS, MODALITY_LABELS } from "@/lib/constants";
import { runMonteCarloAction, runSimulationAction, saveScenarioAction } from "@/lib/actions";
import { GuidedScenarioEditor } from "@/components/guided-scenario-editor";
import { DEFAULT_SCENARIO } from "@/lib/sample-scenarios";
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


function HourlyDemandChart({
  values,
  onChange
}: {
  values: number[];
  onChange: (next: number[]) => void;
}) {
  const maxValue = Math.max(...values, 0.01);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120, width: "100%" }}>
        {values.map((value, index) => (
          <div
            key={`bar-${index}`}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1, minWidth: 0, height: "100%" }}
          >
            <button
              type="button"
              title={`Hour ${index}: ${(value * 100).toFixed(1)}%`}
              onClick={() => {
                const next = [...values];
                next[index] = Number((next[index] + 0.01).toFixed(4));
                onChange(next);
              }}
              aria-label={`Increase demand for hour ${index}`}
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "flex-end",
                width: "100%",
                flex: 1,
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(4, (value / maxValue) * 100)}%`,
                  background: value > 0 ? "var(--mui-palette-primary-main, #1976d2)" : "var(--mui-palette-divider, #e0e0e0)",
                  borderRadius: "2px 2px 0 0",
                  transition: "height 0.15s ease",
                  opacity: value > 0 ? 0.7 + (value / maxValue) * 0.3 : 0.2,
                }}
              />
            </button>
            <span style={{ fontSize: 9, color: "#888", marginTop: 2, lineHeight: 1 }}>{index}</span>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 12, color: "#888" }}>Each bar is an hour of the day. Click a bar to bump that hour up, or edit the exact values below.</div>
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
    <Accordion defaultExpanded={defaultOpen} disableGutters elevation={0} variant="outlined" sx={{ borderLeft: 0, borderRight: 0, borderTop: 0, '&:last-child': { borderBottom: 0 } }}>
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ py: 2 }}>
        <Box>
          <Typography variant="overline" color="secondary" sx={{ display: 'block' }}>{kicker}</Typography>
          <Typography variant="h3">{title}</Typography>
          <Typography variant="body2" color="text.secondary">{description}</Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ py: 3, borderTop: '1px solid', borderColor: 'divider', bgcolor: 'background.default' }}>
        {children}
      </AccordionDetails>
    </Accordion>
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

  const updateScenario = useCallback(<K extends keyof ScenarioInput>(key: K, value: ScenarioInput[K]) => {
    setScenario((current) => ({ ...current, [key]: value }));
  }, []);

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

  const updateOnShiftCount = useCallback((group: keyof ScenarioInput["staffRotation"], index: number, onShiftCount: number) => {
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
  }, [scenario.resourceConfig, scenario.staffRotation, updateScenario]);

  const applyEightHourShiftPreset = useCallback(() => {
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
  }, [openWindow.closeHour, openWindow.openHour, scenario.resourceConfig.technicians, scenario.resourceConfig.supportStaff, scenario.resourceConfig.radiologists, updateScenario]);

  const applyScenarioPreset = useCallback((preset: ScenarioInput) => {
    setScenario({ ...preset, id: scenario.id });
    setRunSeedManuallyEdited(false);
    setRunConfig((current) => ({ ...current, seed: preset.seedDefault }));
  }, [scenario.id]);

  const submitScenario = useCallback(async (nextScenario = scenario) => {
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
  }, [mode, router, scenario, viewMode]);

  const generateRandomSeed = useCallback(() => {
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return Math.max(1, values[0]);
    }
    return Math.max(1, Math.floor(Math.random() * 2147483647));
  }, []);

  const saveAndRun = useCallback(async (seedToUse: number) => {
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
  }, [runConfig.horizonDays, scenario.id, submitScenario, router]);

  const saveAndRunMonteCarlo = useCallback(async (seedToUse: number) => {
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
  }, [runConfig.horizonDays, runConfig.monteCarloIterations, scenario.id, submitScenario, router]);

  const goToAdvanced = useCallback(async () => {
    if (mode === "create") {
      const scenarioId = scenario.id ?? (await submitScenario());
      if (!scenarioId) {
        return;
      }
      router.push(`/scenarios/${scenarioId}/advanced`);
      return;
    }
    router.push(`/scenarios/${scenario.id}/advanced`);
  }, [mode, router, scenario, submitScenario]);

  const goToBasic = useCallback(() => {
    if (mode === "create") {
      router.push("/scenarios/new");
      return;
    }
    router.push(`/scenarios/${scenario.id}`);
  }, [mode, router, scenario.id]);


  const advancedSections = useMemo(() => (
    <>

      <SectionBlock
        kicker="Section 4"
        title="Operating Hours"
        description="Department-level availability for rooms, machines, and scheduled staff."
        defaultOpen
      >
        <Stack spacing={3}>
          <Typography variant="body2" color="text.secondary">
            If a day is closed, no scans or prep happen that day. Open and close hours define when the department can actually process work.
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              color="secondary"
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
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() =>
                updateScenario(
                  "operatingHours",
                  scenario.operatingHours.map(() => ({ enabled: true, openHour: 6, closeHour: 22 }))
                )
              }
            >
              Open all week
            </Button>
          </Stack>
          <Stack spacing={2}>
            {scenario.operatingHours.map((entry, index) => (
              <Grid container spacing={2} key={DAY_NAMES[index]} alignItems="center">
                <Grid size={{ xs: 12, sm: 4 }}>
                  <FormControl fullWidth size="small">
                    <InputLabel>{DAY_NAMES[index]}</InputLabel>
                    <Select
                      value={String(entry.enabled)}
                      label={DAY_NAMES[index]}
                      onChange={(event) =>
                        updateScenario("operatingHours", scenario.operatingHours.map((item, itemIndex) =>
                          itemIndex === index ? { ...item, enabled: event.target.value === "true" } : item
                        ))
                      }
                    >
                      <MenuItem value="true">Open</MenuItem>
                      <MenuItem value="false">Closed</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    label="Open hour"
                    fullWidth
                    size="small"
                    type="number"
                    slotProps={{ htmlInput: { min: 0, max: 23 } }}
                    value={entry.openHour}
                    onChange={(event) =>
                      updateScenario("operatingHours", scenario.operatingHours.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, openHour: Number(event.target.value) } : item
                      ))
                    }
                  />
                </Grid>
                <Grid size={{ xs: 6, sm: 4 }}>
                  <TextField
                    label="Close hour"
                    fullWidth
                    size="small"
                    type="number"
                    slotProps={{ htmlInput: { min: 1, max: 24 } }}
                    value={entry.closeHour}
                    onChange={(event) =>
                      updateScenario("operatingHours", scenario.operatingHours.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, closeHour: Number(event.target.value) } : item
                      ))
                    }
                  />
                </Grid>
              </Grid>
            ))}
          </Stack>
        </Stack>
      </SectionBlock>

      <SectionBlock
        kicker="Section 5"
        title="Staff Rotation"
        description="Plan how many people are on shift by hour, or auto-fill from a simple staffing heuristic."
        defaultOpen
      >
        <Stack spacing={3}>
          <Paper elevation={0} variant="outlined" sx={{ p: 2, bgcolor: 'rgba(181, 93, 56, 0.08)', color: 'text.secondary' }}>
            <Typography variant="body2">
              Auto-fill uses a simple planning rule: 8-hour shifts and 6 working days per week for each team member, spread across the open day.
            </Typography>
          </Paper>
          <Typography variant="body2" color="text.secondary">
            Radiologists are allowed to report outside scan operating hours if you staff them in those hours, which lets the model represent evening or overnight reporting backlogs being cleared.
          </Typography>
          <Stack direction="row" spacing={2}>
            <Button variant="outlined" color="secondary" onClick={applyEightHourShiftPreset}>
              Auto-fill 8h / 6d shifts
            </Button>
            <Button
              variant="outlined"
              color="secondary"
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
            </Button>
          </Stack>
          <Typography variant="body2" color="text.secondary">
            Total team size stays in Basic Options. Here you only set how many are actually present each hour.
          </Typography>
          {(["technicians", "supportStaff", "radiologists"] as const).map((group) => (
            <Stack key={group} spacing={2} sx={{ p: 2, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="overline" color="primary">{group}</Typography>
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                {(group === "technicians"
                  ? technicianSchedulePreview
                  : group === "supportStaff"
                    ? supportSchedulePreview
                    : radiologistSchedulePreview
                )
                  .map((count, index) => `${index}:00 ${count}`)
                  .slice(openWindow.openHour, Math.min(openWindow.closeHour + 2, 24))
                  .join(" • ")}
              </Typography>
              <Grid container spacing={2}>
                {scenario.staffRotation[group].map((point, index) => (
                  <Grid size={{ xs: 6, sm: 3, md: 2 }} key={`${group}-${point.hour}`}>
                    <TextField
                      label={`${point.hour}:00`}
                      fullWidth
                      size="small"
                      type="number"
                      slotProps={{ 
                        htmlInput: { 
                          min: 0, 
                          step: 1, 
                          max: group === "technicians" ? scenario.resourceConfig.technicians : group === "supportStaff" ? scenario.resourceConfig.supportStaff : scenario.resourceConfig.radiologists 
                        } 
                      }}
                      value={
                        group === "technicians"
                          ? technicianSchedulePreview[index]
                          : group === "supportStaff"
                            ? supportSchedulePreview[index]
                            : radiologistSchedulePreview[index]
                      }
                      onChange={(event) => updateOnShiftCount(group, index, Number(event.target.value))}
                      helperText={`Coverage: ${(group === "technicians" ? scenario.staffRotation.technicians[index].coverage : group === "supportStaff" ? scenario.staffRotation.supportStaff[index].coverage : scenario.staffRotation.radiologists[index].coverage).toFixed(2)}`}
                    />
                  </Grid>
                ))}
              </Grid>
            </Stack>
          ))}
        </Stack>
      </SectionBlock>

      <SectionBlock
        kicker="Section 6"
        title="Demand Profile"
        description="Define weighted arrival patterns and weekly demand shifts. The simulator still samples patients probabilistically around those weights."
      >
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={3}>
              <Grid container spacing={2}>
                {[
                  ["baseDailyPatients", "Base daily patients", 1, undefined, 1],
                  ["inpatientFraction", "Inpatient fraction", 0, 1, 0.01],
                  ["femaleFraction", "Female patient fraction", 0, 1, 0.01],
                  ["urgentFraction", "Urgent fraction", 0, 1, 0.01],
                  ["noShowRate", "No-show rate", 0, 1, 0.01],
                  ["unexpectedLeaveRate", "Unexpected leave rate", 0, 1, 0.01],
                  ["repeatScanRate", "Repeat scan rate", 0, 1, 0.01],
                  ["resultCommunicationMinutes", "Result communication minutes", 0, undefined, 1]
                ].map(([key, label, min, max, step]) => (
                  <Grid size={{ xs: 6 }} key={key as string}>
                    <TextField
                      label={label as string}
                      fullWidth
                      size="small"
                      type="number"
                      slotProps={{ htmlInput: { min, max, step } }}
                      value={scenario.demandProfile[key as keyof typeof scenario.demandProfile]}
                      onChange={(event) =>
                        updateScenario("demandProfile", {
                          ...scenario.demandProfile,
                          [key as string]: Number(event.target.value)
                        })
                      }
                    />
                  </Grid>
                ))}
              </Grid>
              <Stack direction="row" spacing={2}>
                <Button
                  variant="outlined"
                  color="secondary"
                  size="small"
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
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  size="small"
                  onClick={() =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      hourlyDistribution: normalize(scenario.demandProfile.hourlyDistribution)
                    })
                  }
                >
                  Normalize distribution
                </Button>
              </Stack>
              <Paper elevation={0} variant="outlined" sx={{ p: 2 }}>
                <HourlyDemandChart
                  key={`demand-chart-${scenario.demandProfile.hourlyDistribution.reduce((a, b) => a + b, 0).toFixed(4)}`}
                  values={scenario.demandProfile.hourlyDistribution}
                  onChange={(hourlyDistribution) =>
                    updateScenario("demandProfile", {
                      ...scenario.demandProfile,
                      hourlyDistribution
                    })
                  }
                />
              </Paper>
            </Stack>

            <Paper variant="outlined" sx={{ p: 2, mt: 3, borderColor: 'error.light', bgcolor: 'error.lighter' }}>
              <Typography variant="subtitle2" color="error.main" sx={{ mb: 2 }}>Trauma & Emergencies</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Spike Probability (daily)"
                    fullWidth
                    size="small"
                    type="number"
                    slotProps={{ htmlInput: { min: 0, max: 1, step: 0.01 } }}
                    value={scenario.demandProfile.traumaSpikeProbability}
                    onChange={(event) =>
                      updateScenario("demandProfile", {
                        ...scenario.demandProfile,
                        traumaSpikeProbability: Number(event.target.value)
                      })
                    }
                  />
                </Grid>
                <Grid size={{ xs: 6 }}>
                  <TextField
                    label="Demand Multiplier"
                    fullWidth
                    size="small"
                    type="number"
                    slotProps={{ htmlInput: { min: 1, step: 0.1 } }}
                    value={scenario.demandProfile.traumaSpikeMultiplier}
                    onChange={(event) =>
                      updateScenario("demandProfile", {
                        ...scenario.demandProfile,
                        traumaSpikeMultiplier: Number(event.target.value)
                      })
                    }
                    helperText="On spike days, volume is multiplied."
                  />
                </Grid>
              </Grid>
            </Paper>

          </Grid>
          <Grid size={{ xs: 12, md: 6 }}>
            <Stack spacing={2}>
              <Typography variant="subtitle2">Day-of-Week Demand</Typography>
              <Grid container spacing={2}>
                {DAY_NAMES.map((day, index) => (
                  <Grid size={{ xs: 6, sm: 4 }} key={day}>
                    <TextField
                      label={day}
                      fullWidth
                      size="small"
                      type="number"
                      slotProps={{ htmlInput: { min: 0, step: 0.05 } }}
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
                  </Grid>
                ))}
              </Grid>
            </Stack>
          </Grid>
        </Grid>
      </SectionBlock>

      <SectionBlock
        kicker="Section 7"
        title="Service Mix"
        description="Control weighted modality demand. Each arriving patient is assigned a service probabilistically from these weights."
      >
        <Stack spacing={3}>
          <Stack direction="row" spacing={2}>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() =>
                updateScenario("serviceMix", scenario.serviceMix.map((item, index, list) => ({
                  ...item,
                  weight: Number((1 / list.length).toFixed(4))
                })))
              }
            >
              Even split
            </Button>
            <Button
              variant="outlined"
              color="secondary"
              onClick={() => updateScenario("serviceMix", normalize(scenario.serviceMix.map((item) => item.weight)).map((weight, index) => ({
                ...scenario.serviceMix[index],
                weight
              })))}
            >
              Normalize mix
            </Button>
          </Stack>
          <Grid container spacing={2}>
            {scenario.serviceMix.map((item, index) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={item.modality}>
                <TextField
                  label={item.modality === "PORTABLE_XRAY" ? "Portable X-Ray requests" : MODALITY_LABELS[item.modality]}
                  fullWidth
                  type="number"
                  slotProps={{ htmlInput: { min: 0, step: 0.01 } }}
                  value={item.weight}
                  onChange={(event) =>
                    updateScenario("serviceMix", scenario.serviceMix.map((mix, mixIndex) =>
                      mixIndex === index ? { ...mix, weight: Number(event.target.value) } : mix
                    ))
                  }
                />
              </Grid>
            ))}
          </Grid>
        </Stack>
      </SectionBlock>

      <SectionBlock
        kicker="Section 8"
        title="Service Configuration"
        description="Tune prep, exam, cleanup, and report times. Defaults are meant to feel like industry-style operational baselines."
      >
        <Paper elevation={0} variant="outlined" sx={{ p: 2, bgcolor: 'rgba(37,99,235,0.04)', color: 'text.secondary', mb: 3 }}>
          <Typography variant="body2">
            Workflow in this version: support staff greet and route the patient, only CT requires a changing room, technicians perform one scan at a time, and radiologist report time is configurable per modality. Prep, cleanup, reporting, and exam times are treated as averages, and the engine samples patient-level variation around them during each run.
          </Typography>
        </Paper>
        <Grid container spacing={3}>
          {scenario.serviceConfigs.map((service, index) => (
            <Grid size={{ xs: 12, md: 6, lg: 4 }} key={service.modality}>
              <Paper variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{MODALITY_LABELS[service.modality]}</Typography>
                <TextField
                  label="Charge"
                  fullWidth
                  size="small"
                  type="number"
                  slotProps={{ htmlInput: { min: 0 } }}
                  value={service.charge}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, charge: Number(event.target.value) } : item
                    ))
                  }
                />
                <TextField
                  label="Consumable Cost"
                  fullWidth
                  size="small"
                  type="number"
                  slotProps={{ htmlInput: { min: 0 } }}
                  value={service.consumableCost}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, consumableCost: Number(event.target.value) } : item
                    ))
                  }
                  helperText="Fixed cost incurred per scan (e.g. contrast, supplies)."
                />
                <TextField
                  label="Exam duration minutes"
                  fullWidth
                  size="small"
                  type="number"
                  slotProps={{ htmlInput: { min: 5 } }}
                  value={service.examDurationMinutes}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, examDurationMinutes: Number(event.target.value) } : item
                    ))
                  }
                />
                <TextField
                  label="Prep minutes"
                  fullWidth
                  size="small"
                  type="number"
                  slotProps={{ htmlInput: { min: 0 } }}
                  value={service.prepDurationMinutes}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, prepDurationMinutes: Number(event.target.value) } : item
                    ))
                  }
                  helperText={service.modality === "CT" ? "Uses support staff plus changing room." : "Uses support staff only."}
                />
                <TextField
                  label="Cleanup minutes"
                  fullWidth
                  size="small"
                  type="number"
                  slotProps={{ htmlInput: { min: 0 } }}
                  value={service.cleanupMinutes}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, cleanupMinutes: Number(event.target.value) } : item
                    ))
                  }
                />
                <TextField
                  label="Reporting minutes"
                  fullWidth
                  size="small"
                  type="number"
                  slotProps={{ htmlInput: { min: 1 } }}
                  value={service.reportingMinutes}
                  onChange={(event) =>
                    updateScenario("serviceConfigs", scenario.serviceConfigs.map((item, itemIndex) =>
                      itemIndex === index ? { ...item, reportingMinutes: Number(event.target.value) } : item
                    ))
                  }
                  helperText="Time radiologists spend producing the report for this modality."
                />
              </Paper>
            </Grid>
          ))}
        </Grid>
      </SectionBlock>

      <SectionBlock
        kicker="Section 9"
        title="Workflow Routing"
        description="Define which rooms can host each modality, which modalities require changing rooms, and how changing rooms are gender-assigned."
      >
        <Stack spacing={4}>
          <Paper elevation={0} variant="outlined" sx={{ p: 2, bgcolor: 'rgba(37,99,235,0.04)', color: 'text.secondary' }}>
            <Typography variant="body2">
              Portable X-Ray is modeled as a bedside/mobile workflow by default and does not consume a procedure room. All other modalities must route through a compatible room definition below.
            </Typography>
          </Paper>
          
          <Grid container spacing={3}>
            {scenario.workflowConfig.roomConfigs.map((room, index) => (
              <Grid size={{ xs: 12, md: 6 }} key={room.id}>
                <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{room.name}</Typography>
                  <TextField
                    label="Room name"
                    fullWidth
                    size="small"
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
                  <FormControl fullWidth size="small">
                    <InputLabel>Dedicated modality</InputLabel>
                    <Select
                      value={room.dedicatedModality}
                      label="Dedicated modality"
                      onChange={(event) =>
                        updateScenario("workflowConfig", {
                          ...scenario.workflowConfig,
                          roomConfigs: scenario.workflowConfig.roomConfigs.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, dedicatedModality: event.target.value as typeof item.dedicatedModality } : item
                          )
                        })
                      }
                    >
                      <MenuItem value="NONE">Flexible</MenuItem>
                      {Object.entries(MODALITY_LABELS)
                        .filter(([modality]) => modality !== "PORTABLE_XRAY")
                        .map(([modality, label]) => (
                          <MenuItem key={modality} value={modality}>
                            {label}
                          </MenuItem>
                        ))}
                    </Select>
                  </FormControl>
                  <Box>
                    <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>Compatible modalities</Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                      {Object.entries(MODALITY_LABELS)
                        .filter(([modality]) => modality !== "PORTABLE_XRAY")
                        .map(([modality, label]) => {
                          const typedModality = modality as ScenarioInput["serviceMix"][number]["modality"];
                          const enabled = room.supportedModalities.includes(typedModality);
                          return (
                            <Button
                              key={`${room.id}-${modality}`}
                              variant={enabled ? "contained" : "outlined"}
                              color={enabled ? "primary" : "secondary"}
                              size="small"
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
                              {enabled ? `✓ ${label}` : label}
                            </Button>
                          );
                        })}
                    </Stack>
                  </Box>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={3}>
            {scenario.workflowConfig.changingRoomConfigs.map((room, index) => (
              <Grid size={{ xs: 12, md: 4 }} key={room.id}>
                <Paper variant="outlined" sx={{ p: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{room.name}</Typography>
                  <TextField
                    label="Changing room name"
                    fullWidth
                    size="small"
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
                  <FormControl fullWidth size="small">
                    <InputLabel>Assigned gender</InputLabel>
                    <Select
                      value={room.gender}
                      label="Assigned gender"
                      onChange={(event) =>
                        updateScenario("workflowConfig", {
                          ...scenario.workflowConfig,
                          changingRoomConfigs: scenario.workflowConfig.changingRoomConfigs.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, gender: event.target.value as typeof item.gender } : item
                          )
                        })
                      }
                    >
                      <MenuItem value="FEMALE">Female</MenuItem>
                      <MenuItem value="MALE">Male</MenuItem>
                      <MenuItem value="UNISEX">Unisex</MenuItem>
                    </Select>
                  </FormControl>
                </Paper>
              </Grid>
            ))}
          </Grid>

          <Grid container spacing={2}>
            {Object.entries(MODALITY_LABELS).map(([modality, label]) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={`changing-rule-${modality}`}>
                <FormControl fullWidth size="small">
                  <InputLabel>{label} requires changing room</InputLabel>
                  <Select
                    value={String(scenario.workflowConfig.changingRoomByModality[modality as ScenarioInput["serviceMix"][number]["modality"]])}
                    label={`${label} requires changing room`}
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
                    <MenuItem value="false">No</MenuItem>
                    <MenuItem value="true">Yes</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            ))}
          </Grid>
        </Stack>
      </SectionBlock>

      <SectionBlock
        kicker="Section 10"
        title="Appointments"
        description="Toggle scheduled outpatient appointments versus pure walk-in demand."
      >
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Scheduled outpatient appointments</InputLabel>
              <Select
                value={String(scenario.appointmentPolicy.enabled)}
                label="Scheduled outpatient appointments"
                onChange={(event) =>
                  updateScenario("appointmentPolicy", {
                    ...scenario.appointmentPolicy,
                    enabled: event.target.value === "true"
                  })
                }
              >
                <MenuItem value="false">Off</MenuItem>
                <MenuItem value="true">On</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Scheduled fraction of outpatients"
              fullWidth
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 0, max: 1, step: 0.01 } }}
              value={scenario.appointmentPolicy.outpatientScheduledFraction}
              onChange={(event) =>
                updateScenario("appointmentPolicy", {
                  ...scenario.appointmentPolicy,
                  outpatientScheduledFraction: Number(event.target.value)
                })
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Early arrival minutes"
              fullWidth
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 0, max: 120 } }}
              value={scenario.appointmentPolicy.earlyArrivalMinutes}
              onChange={(event) =>
                updateScenario("appointmentPolicy", {
                  ...scenario.appointmentPolicy,
                  earlyArrivalMinutes: Number(event.target.value)
                })
              }
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Appointment arrival variance minutes"
              fullWidth
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 0, max: 180 } }}
              value={scenario.appointmentPolicy.arrivalVarianceMinutes}
              onChange={(event) =>
                updateScenario("appointmentPolicy", {
                  ...scenario.appointmentPolicy,
                  arrivalVarianceMinutes: Number(event.target.value)
                })
              }
            />
          </Grid>
        </Grid>
      </SectionBlock>

      <SectionBlock
        kicker="Section 11"
        title="Financial Fixed Costs"
        description="Daily staffing and machine lease costs. These costs are scaled out over the full simulation horizon automatically."
      >
        <Stack spacing={4}>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="overline" color="text.secondary">Staff Salaries (Daily per FTE)</Typography>
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Radiologist Daily Salary"
                fullWidth size="small" type="number"
                slotProps={{ htmlInput: { min: 0 } }}
                value={scenario.resourceConfig.radiologistSalaryDaily}
                onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, radiologistSalaryDaily: Number(e.target.value) })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Technician Daily Salary"
                fullWidth size="small" type="number"
                slotProps={{ htmlInput: { min: 0 } }}
                value={scenario.resourceConfig.technicianSalaryDaily}
                onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, technicianSalaryDaily: Number(e.target.value) })}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Support Staff Daily Salary"
                fullWidth size="small" type="number"
                slotProps={{ htmlInput: { min: 0 } }}
                value={scenario.resourceConfig.supportStaffSalaryDaily}
                onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, supportStaffSalaryDaily: Number(e.target.value) })}
              />
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12 }}>
              <Typography variant="overline" color="text.secondary">Machine Ownership</Typography>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <FormControl fullWidth size="small">
                <InputLabel>Machine Cost Model</InputLabel>
                <Select
                  value={scenario.resourceConfig.machineCostModel}
                  label="Machine Cost Model"
                  onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, machineCostModel: e.target.value as "LEASED" | "OWNED" })}
                >
                  <MenuItem value="OWNED">Fully Owned (No Daily Cost)</MenuItem>
                  <MenuItem value="LEASED">Leased (Incurs Daily Cost)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            {scenario.resourceConfig.machineCostModel === "LEASED" && (
              <>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField label="X-Ray Daily Lease" fullWidth size="small" type="number" value={scenario.resourceConfig.xRayLeaseCostDaily} onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, xRayLeaseCostDaily: Number(e.target.value) })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField label="CT Daily Lease" fullWidth size="small" type="number" value={scenario.resourceConfig.ctLeaseCostDaily} onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, ctLeaseCostDaily: Number(e.target.value) })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField label="MRI Daily Lease" fullWidth size="small" type="number" value={scenario.resourceConfig.mriLeaseCostDaily} onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, mriLeaseCostDaily: Number(e.target.value) })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField label="Ultrasound Daily Lease" fullWidth size="small" type="number" value={scenario.resourceConfig.ultrasoundLeaseCostDaily} onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, ultrasoundLeaseCostDaily: Number(e.target.value) })} />
                </Grid>
                <Grid size={{ xs: 12, sm: 6, md: 4 }}>
                  <TextField label="Portable X-Ray Daily Lease" fullWidth size="small" type="number" value={scenario.resourceConfig.portableXRayLeaseCostDaily} onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, portableXRayLeaseCostDaily: Number(e.target.value) })} />
                </Grid>
              </>
            )}
          </Grid>
        </Stack>
      </SectionBlock>
    </>
  ), [scenario, openWindow, demandPeakHour, technicianSchedulePreview, supportSchedulePreview, radiologistSchedulePreview, applyEightHourShiftPreset, updateOnShiftCount, updateScenario]);

  return (
    <Stack spacing={4}>
      {flash ? (
        <Paper elevation={0} variant="outlined" sx={{ p: 2, bgcolor: 'primary.main', color: 'primary.contrastText' }}>
          <Stack spacing={2}>
            <Typography variant="body1">{flash}</Typography>
            {queuedRunId ? (
              <Box>
                <Button variant="contained" color="secondary" component={Link} href={`/runs/${queuedRunId}`}>
                  Open run status
                </Button>
              </Box>
            ) : null}
          </Stack>
        </Paper>
      ) : null}
      
      {viewMode === "basic" ? (
        <GuidedScenarioEditor
          scenario={scenario}
          updateScenario={updateScenario}
          applyScenarioPreset={applyScenarioPreset}
          applyEightHourShiftPreset={applyEightHourShiftPreset}
          updateOnShiftCount={updateOnShiftCount}
          goToAdvanced={goToAdvanced}
          submitScenario={() => void submitScenario()}
          isSaving={isSaving}
          openWindow={openWindow}
          demandPeakHour={demandPeakHour}
        />
      ) : (
        advancedSections
      )}

      <Paper variant="outlined" sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <Box>
          <Typography variant="overline" color="primary">Run Simulation</Typography>
          <Typography variant="h5" sx={{ mt: 1, mb: 1, fontWeight: 600 }}>Configure and Start Engine</Typography>
          <Typography variant="body2" color="text.secondary">
            Primary outputs are wait to perform the service and time from completed service to results, with revenue and utilization as supporting context.
          </Typography>
        </Box>

        <Grid container spacing={3}>
          <Grid size={{ xs: 12, md: 4 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Horizon</InputLabel>
              <Select
                value={runConfig.horizonDays}
                label="Horizon"
                onChange={(event) => setRunConfig((current) => ({ ...current, horizonDays: Number(event.target.value) }))}
              >
                {HORIZON_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option === 1 ? "1 day" : `${option} days`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Seed"
              fullWidth
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 1 } }}
              value={runConfig.seed}
              onChange={(event) => {
                setRunSeedManuallyEdited(true);
                setRunConfig((current) => ({ ...current, seed: Math.max(1, Number(event.target.value) || 1) }));
              }}
              helperText="Use this for reproducible runs."
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <TextField
              label="Monte Carlo iterations"
              fullWidth
              size="small"
              type="number"
              slotProps={{ htmlInput: { min: 5, max: 250, step: 5 } }}
              value={runConfig.monteCarloIterations}
              onChange={(event) =>
                setRunConfig((current) => ({
                  ...current,
                  monteCarloIterations: Math.max(5, Number(event.target.value) || 25)
                }))
              }
              helperText="Runs a sweep from the base seed."
            />
          </Grid>
        </Grid>

        <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap>
          {viewMode === "basic" ? (
            <Button variant="outlined" color="secondary" disabled={isSaving} onClick={() => void goToAdvanced()}>
              Advanced Options
            </Button>
          ) : (
            <Button variant="outlined" color="secondary" onClick={goToBasic}>
              Basic Options
            </Button>
          )}
          <Button variant="contained" color="primary" disabled={isSaving} onClick={() => void submitScenario()}>
            {mode === "create" ? "Create scenario" : "Save scenario"}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            disabled={isSaving || isRunPending}
            onClick={() => {
              setActiveRunKind("seed");
              void saveAndRun(runConfig.seed);
            }}
          >
            {isRunPending && activeRunKind === "seed" ? "Queueing Seeded Run..." : "Start Seeded Run"}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            disabled={isSaving || isRunPending}
            onClick={() => {
              setActiveRunKind("montecarlo");
              void saveAndRunMonteCarlo(runConfig.seed);
            }}
          >
            {isRunPending && activeRunKind === "montecarlo" ? "Queueing Monte Carlo..." : "Start Monte Carlo"}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            disabled={isSaving || isRunPending}
            onClick={() => {
              setActiveRunKind("random");
              const randomSeed = generateRandomSeed();
              void saveAndRun(randomSeed);
            }}
          >
            {isRunPending && activeRunKind === "random" ? "Queueing Random Run..." : "Start Random Run"}
          </Button>
          <Button variant="outlined" color="secondary" onClick={() => setScenario(DEFAULT_SCENARIO)}>
            Reset to sample baseline
          </Button>
          <Button variant="outlined" color="secondary" component={Link} href="/">
            Back to scenarios
          </Button>
        </Stack>
      </Paper>
    </Stack>
  );
}
