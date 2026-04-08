"use client";

import { useState, useTransition } from "react";
import Grid from "@mui/material/Grid";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Slider from "@mui/material/Slider";
import Stack from "@mui/material/Stack";
import CircularProgress from "@mui/material/CircularProgress";
import Button from "@mui/material/Button";
import { SimpleLineChart } from "@/components/simple-chart";
import { runQuickSimulationAction } from "@/lib/actions";
import { formatCurrency } from "@/lib/currency";
import type { ScenarioInput } from "@/lib/types";

import { useRouter } from "next/navigation";

export function InteractiveCharts({
  baseScenario,
  allSnapshots,
  currency,
}: {
  baseScenario: ScenarioInput;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  allSnapshots: any[];
  currency: string;
}) {
  const router = useRouter();
  const [techDiff, setTechDiff] = useState(0);
  const [radDiff, setRadDiff] = useState(0);
  const [supportDiff, setSupportDiff] = useState(0);
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [ghostSnapshots, setGhostSnapshots] = useState<any[] | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [calculatedScenario, setCalculatedScenario] = useState<ScenarioInput | null>(null);

  const modifiedScenario = {
    ...baseScenario,
    resourceConfig: {
      ...baseScenario.resourceConfig,
      technicians: Math.max(1, baseScenario.resourceConfig.technicians + techDiff),
      radiologists: Math.max(1, baseScenario.resourceConfig.radiologists + radDiff),
      supportStaff: Math.max(1, baseScenario.resourceConfig.supportStaff + supportDiff),
    }
  };

  const handleCalculate = () => {
    if (techDiff === 0 && radDiff === 0 && supportDiff === 0) {
      setGhostSnapshots(null);
      setCalculatedScenario(null);
      return;
    }
    startTransition(async () => {
      try {
        const result = await runQuickSimulationAction(modifiedScenario, allSnapshots.length);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setGhostSnapshots(result.snapshots.filter((s: any) => s.modality === "ALL"));
        setCalculatedScenario(modifiedScenario);
      } catch (e) {
        console.error(e);
      }
    });
  };

  const handleSaveAndRun = () => {
    if (!calculatedScenario) return;
    startSaving(async () => {
      try {
        const { saveScenarioAction, runSimulationAction } = await import("@/lib/actions");
        
        const scenarioFormData = new FormData();
        const newScenarioState = { 
          ...calculatedScenario, 
          id: undefined, 
          name: calculatedScenario.name + " (What-If)" 
        };
        scenarioFormData.set("scenario", JSON.stringify(newScenarioState));
        
        const { id } = await saveScenarioAction(scenarioFormData);
        
        const runFormData = new FormData();
        runFormData.set("scenarioId", id);
        runFormData.set("horizonDays", String(allSnapshots.length));
        runFormData.set("seed", String(calculatedScenario.seedDefault));
        
        const { runId } = await runSimulationAction(runFormData);
        router.push(`/runs/${runId}`);
      } catch (e) {
        console.error(e);
      }
    });
  };

  return (
    <Box>
      <Card elevation={0} variant="outlined" sx={{ p: 3, mb: 4, bgcolor: 'background.default' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Box>
            <Typography variant="overline" color="secondary" gutterBottom>What-If Scenarios</Typography>
            <Typography variant="h4" sx={{ mt: 0.5 }}>Quick Staffing Adjustments</Typography>
            <Typography variant="body2" color="text.secondary">Move sliders and click Calculate to preview the estimated impact (dashed lines) on the charts below.</Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center">
            {isPending && <CircularProgress size={24} />}
            <Button variant="contained" onClick={handleCalculate} disabled={isPending || isSaving}>
              {isPending ? "Calculating..." : "Calculate What-If"}
            </Button>
            {ghostSnapshots && (
              <Button variant="outlined" color="primary" onClick={handleSaveAndRun} disabled={isSaving || isPending}>
                {isSaving ? "Saving..." : "Save & Run Full Simulation"}
              </Button>
            )}
          </Stack>
        </Stack>
        <Grid container spacing={4}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="body2" gutterBottom>Technicians ({baseScenario.resourceConfig.technicians + techDiff})</Typography>
            <Slider
              value={techDiff}
              min={-5}
              max={5}
              step={1}
              marks
              onChange={(_, value) => setTechDiff(value as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(val) => (val > 0 ? `+${val}` : val)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="body2" gutterBottom>Radiologists ({baseScenario.resourceConfig.radiologists + radDiff})</Typography>
            <Slider
              value={radDiff}
              min={-5}
              max={5}
              step={1}
              marks
              color="secondary"
              onChange={(_, value) => setRadDiff(value as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(val) => (val > 0 ? `+${val}` : val)}
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <Typography variant="body2" gutterBottom>Support Staff ({baseScenario.resourceConfig.supportStaff + supportDiff})</Typography>
            <Slider
              value={supportDiff}
              min={-5}
              max={5}
              step={1}
              marks
              color="warning"
              onChange={(_, value) => setSupportDiff(value as number)}
              valueLabelDisplay="auto"
              valueLabelFormat={(val) => (val > 0 ? `+${val}` : val)}
            />
          </Grid>
        </Grid>
      </Card>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box mb={2}>
            <Typography variant="h2" gutterBottom>Daily revenue</Typography>
          </Box>
          <Card elevation={0} variant="outlined" sx={{ p: 3, pt: 4, height: 300 }}>
            <SimpleLineChart
              title="Revenue by day"
              valueFormatter={(value) => formatCurrency(value, currency)}
              points={allSnapshots.map((snapshot) => ({
                label: `D${snapshot.dayIndex + 1}`,
                value: snapshot.revenue
              }))}
              ghostPoints={ghostSnapshots ? ghostSnapshots.map((snapshot) => ({
                label: `D${snapshot.dayIndex + 1}`,
                value: snapshot.revenue
              })) : undefined}
            />
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Box mb={2}>
            <Typography variant="h2" gutterBottom>Daily average wait</Typography>
          </Box>
          <Card elevation={0} variant="outlined" sx={{ p: 3, pt: 4, height: 300 }}>
            <SimpleLineChart
              title="Wait by day"
              color="#356c5c"
              valueFormatter={(value) => `${Math.round(value)}m`}
              points={allSnapshots.map((snapshot) => ({
                label: `D${snapshot.dayIndex + 1}`,
                value: snapshot.averageWaitMinutes
              }))}
              ghostPoints={ghostSnapshots ? ghostSnapshots.map((snapshot) => ({
                label: `D${snapshot.dayIndex + 1}`,
                value: snapshot.averageWaitMinutes
              })) : undefined}
            />
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}
