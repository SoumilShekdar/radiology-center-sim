"use client";

import { useState } from "react";
import { 
  Box, Typography, Button, Stack, Stepper, Step, StepLabel, 
  TextField, FormControl, InputLabel, Select, MenuItem
} from "@mui/material";
import { Activity, Magnet, Radio, Tablets, Wind, DoorOpen, BedDouble } from "lucide-react";
import Grid from "@mui/material/Grid";
import { StaffingGrid } from "@/components/staffing-grid";
import { SAMPLE_SCENARIOS } from "@/lib/sample-scenarios";
import { SUPPORTED_CURRENCIES } from "@/lib/currency";
import type { ScenarioInput } from "@/lib/types";

type Props = {
  scenario: ScenarioInput;
  updateScenario: <K extends keyof ScenarioInput>(key: K, value: ScenarioInput[K]) => void;
  applyScenarioPreset: (preset: typeof SAMPLE_SCENARIOS[number]) => void;
  applyEightHourShiftPreset: () => void;
  updateOnShiftCount: (group: keyof ScenarioInput["staffRotation"], index: number, onShiftCount: number) => void;
  goToAdvanced: () => void;
  submitScenario: () => void;
  isSaving: boolean;
  openWindow: { openHour: number; closeHour: number };
  demandPeakHour: number;
};

export function GuidedScenarioEditor({
  scenario,
  updateScenario,
  applyScenarioPreset,
  applyEightHourShiftPreset,
  updateOnShiftCount,
  goToAdvanced,
  submitScenario,
  isSaving,
  openWindow,
  demandPeakHour
}: Props) {
  const [activeStep, setActiveStep] = useState(0);
  const steps = ["Welcome & Presets", "Facility Setup", "Staffing", "Review & Demand"];

  // Helper function for building the default demand curve
  const buildExpectedHourlyDistribution = (openHour: number, closeHour: number, peakHour: number, spread: number) => {
    const raw = Array.from({ length: 24 }, (_, hour) => {
      if (hour < openHour || hour >= closeHour) return 0;
      const distance = Math.abs(hour - peakHour);
      return Math.exp(-(distance * distance) / (2 * spread * spread));
    });
    const total = raw.reduce((sum, value) => sum + value, 0);
    return raw.map((value) => Number((value / (total || 1)).toFixed(4)));
  };

  const handleNext = () => setActiveStep((prev) => prev + 1);
  const handleBack = () => setActiveStep((prev) => prev - 1);

  return (
    <Box sx={{ width: '100%', mb: 4 }}>
      <Stepper activeStep={activeStep} alternativeLabel sx={{ mb: 6 }}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {/* Step 0: Welcome & Presets */}
      {activeStep === 0 && (
        <Stack spacing={4}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Quick Start</Typography>
            <Typography variant="body2" color="text.secondary">
              Pick a preset configuration to quickly load a baseline scenario, or just click Next to build yours from scratch.
            </Typography>
          </Box>
          <Grid container spacing={2}>
            {SAMPLE_SCENARIOS.map((preset) => (
              <Grid size={{ xs: 12, sm: 6, lg: 3 }} key={preset.name}>
                <Button
                  variant="outlined"
                  color="secondary"
                  fullWidth
                  onClick={() => {
                    applyScenarioPreset(preset);
                    handleNext();
                  }}
                  sx={{
                    display: "flex", flexDirection: "column", alignItems: "flex-start", textAlign: "left",
                    py: 2, px: 2, gap: 1, minHeight: 140, borderColor: "divider",
                    "&:hover": { borderColor: "primary.main", background: "rgba(37,99,235,0.04)" }
                  }}
                >
                  <Typography variant="subtitle2" component="strong" sx={{ fontWeight: 600 }}>{preset.name}</Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary", whiteSpace: "normal" }}>{preset.description}</Typography>
                </Button>
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}

      {/* Step 1: Facility Setup */}
      {activeStep === 1 && (
        <Stack spacing={4}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Facility Setup</Typography>
            <Typography variant="body2" color="text.secondary">
              Name your scenario and configure the available infrastructure (machines and rooms).
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Scenario name" fullWidth
                value={scenario.name}
                onChange={(e) => updateScenario("name", e.target.value)}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <FormControl fullWidth>
                <InputLabel>Currency</InputLabel>
                <Select
                  value={scenario.currency} label="Currency"
                  onChange={(e) => updateScenario("currency", e.target.value)}
                >
                  {SUPPORTED_CURRENCIES.map((currency) => (
                    <MenuItem key={currency} value={currency}>{currency}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid size={{ xs: 12 }}>
              <TextField
                label="Description" fullWidth multiline rows={2}
                value={scenario.description}
                onChange={(e) => updateScenario("description", e.target.value)}
              />
            </Grid>
          </Grid>

          <Typography variant="subtitle2" sx={{ mt: 2 }}>Physical Infrastructure Counts</Typography>
          <Grid container spacing={3}>
            {[
              ["xRayMachines", "X-Ray machines", <Wind size={18} key="xray" />],
              ["ctMachines", "CT scanners", <Radio size={18} key="ct" />],
              ["mriMachines", "MRI scanners", <Magnet size={18} key="mri" />],
              ["portableXRayMachines", "Portable X-Ray machines", <Tablets size={18} key="portable" />],
              ["ultrasoundMachines", "Ultrasounds", <Activity size={18} key="us" />],
              ["rooms", "Procedure rooms", <BedDouble size={18} key="rooms" />],
              ["changingRooms", "Changing rooms", <DoorOpen size={18} key="cr" />]
            ].map(([key, label, icon]) => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={key as string}>
                <Stack direction="row" alignItems="flex-end" spacing={1}>
                  <Box sx={{ mb: 1, color: 'text.secondary' }}>{icon}</Box>
                  <TextField
                    label={label as string} fullWidth type="number"
                    inputProps={{ min: 0 }}
                    value={scenario.resourceConfig[key as keyof ScenarioInput["resourceConfig"]]}
                    onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, [key as string]: Number(e.target.value) })}
                  />
                </Stack>
              </Grid>
            ))}
          </Grid>
        </Stack>
      )}

      {/* Step 2: Staffing */}
      {activeStep === 2 && (
        <Stack spacing={4}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Staffing & Coverage</Typography>
            <Typography variant="body2" color="text.secondary">
              Define the total number of staff on payroll and map out their 24-hour shift schedule.
            </Typography>
          </Box>

          <Typography variant="subtitle2">Total Staff Headcount</Typography>
          <Grid container spacing={3}>
            {[
              ["technicians", "Technicians"],
              ["supportStaff", "Support staff"],
              ["radiologists", "Radiologists"]
            ].map(([key, label]) => (
              <Grid size={{ xs: 12, sm: 4 }} key={key}>
                <TextField
                  label={label} fullWidth type="number"
                  inputProps={{ min: 0 }}
                  value={scenario.resourceConfig[key as keyof ScenarioInput["resourceConfig"]]}
                  onChange={(e) => updateScenario("resourceConfig", { ...scenario.resourceConfig, [key]: Number(e.target.value) })}
                />
              </Grid>
            ))}
          </Grid>

          <Stack direction="row" spacing={2} sx={{ mt: 2, mb: 1 }}>
            <Button variant="outlined" color="primary" onClick={applyEightHourShiftPreset}>
              Auto-fill 8h shifts
            </Button>
            <Button variant="outlined" color="secondary" onClick={() => goToAdvanced()}>
              Configure Advanced Salaries
            </Button>
          </Stack>

          <StaffingGrid
            technicians={scenario.staffRotation.technicians}
            supportStaff={scenario.staffRotation.supportStaff}
            radiologists={scenario.staffRotation.radiologists}
            techTotal={scenario.resourceConfig.technicians}
            supportTotal={scenario.resourceConfig.supportStaff}
            radTotal={scenario.resourceConfig.radiologists}
            onChange={(role, index, coverage) => updateOnShiftCount(role, index, coverage * scenario.resourceConfig[role === "supportStaff" ? "supportStaff" : role])}
          />
        </Stack>
      )}

      {/* Step 3: Review & Demand */}
      {activeStep === 3 && (
        <Stack spacing={4}>
          <Box>
            <Typography variant="h5" sx={{ fontWeight: 600 }}>Review & Demand</Typography>
            <Typography variant="body2" color="text.secondary">
              Configure expected daily patient load and basic demand heuristics before saving.
            </Typography>
          </Box>

          <Grid container spacing={3}>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                label="Base daily patients" fullWidth type="number"
                inputProps={{ min: 1 }}
                value={scenario.demandProfile.baseDailyPatients}
                onChange={(e) => updateScenario("demandProfile", { ...scenario.demandProfile, baseDailyPatients: Number(e.target.value) })}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <TextField
                label="No-show rate (0-1)" fullWidth type="number"
                inputProps={{ min: 0, max: 1, step: 0.01 }}
                value={scenario.demandProfile.noShowRate}
                onChange={(e) => updateScenario("demandProfile", { ...scenario.demandProfile, noShowRate: Number(e.target.value) })}
              />
            </Grid>
          </Grid>

          <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
            <Button
              variant="outlined" color="secondary"
              onClick={() => updateScenario("demandProfile", {
                ...scenario.demandProfile,
                hourlyDistribution: buildExpectedHourlyDistribution(
                  openWindow.openHour, openWindow.closeHour, demandPeakHour,
                  Math.max(2, Math.round((openWindow.closeHour - openWindow.openHour) / 4))
                )
              })}
            >
              Set expected demand curve
            </Button>
            <Button
              variant="outlined" color="secondary"
              onClick={() => updateScenario("serviceMix", scenario.serviceMix.map((item, index, list) => ({
                ...item, weight: Number((1 / list.length).toFixed(4))
              })))}
            >
              Even service mix
            </Button>
          </Stack>
        </Stack>
      )}

      {/* Navigation Controls */}
      <Box sx={{ display: 'flex', flexDirection: 'row', pt: 6 }}>
        <Button
          color="inherit"
          disabled={activeStep === 0}
          onClick={handleBack}
          sx={{ mr: 1 }}
        >
          Back
        </Button>
        <Box sx={{ flex: '1 1 auto' }} />
        {activeStep === steps.length - 1 ? (
          <Button variant="contained" onClick={submitScenario} disabled={isSaving}>
            Finish & Save
          </Button>
        ) : (
          <Button variant="contained" onClick={handleNext}>
            Next
          </Button>
        )}
      </Box>
    </Box>
  );
}
