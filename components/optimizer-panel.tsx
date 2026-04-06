"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runOptimizerAction } from "@/lib/actions";
import { HORIZON_OPTIONS } from "@/lib/constants";

import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Select from "@mui/material/Select";
import MenuItem from "@mui/material/MenuItem";
import FormControl from "@mui/material/FormControl";
import InputLabel from "@mui/material/InputLabel";
import Box from "@mui/material/Box";
import Grid from "@mui/material/Grid";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Collapse from "@mui/material/Collapse";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

type KnobKey =
  | "xRayMachines" | "ctMachines" | "mriMachines"
  | "portableXRayMachines" | "ultrasoundMachines"
  | "technicians" | "radiologists" | "supportStaff";

const MACHINE_KNOBS: { key: KnobKey; label: string }[] = [
  { key: "xRayMachines", label: "X-Ray Machines" },
  { key: "ctMachines", label: "CT Scanners" },
  { key: "mriMachines", label: "MRI Scanners" },
  { key: "portableXRayMachines", label: "Portable X-Ray" },
  { key: "ultrasoundMachines", label: "Ultrasound" },
];

const STAFF_KNOBS: { key: KnobKey; label: string }[] = [
  { key: "technicians", label: "Technicians" },
  { key: "radiologists", label: "Radiologists" },
  { key: "supportStaff", label: "Support Staff" },
];

const ALL_KNOB_KEYS: KnobKey[] = [
  ...MACHINE_KNOBS.map(k => k.key),
  ...STAFF_KNOBS.map(k => k.key),
];

export function OptimizerPanel({
  scenarioId,
  seedDefault,
}: {
  scenarioId: string;
  seedDefault: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [maxWaitMinutes, setMaxWaitMinutes] = useState(45);
  const [horizonDays, setHorizonDays] = useState(14);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [enabledKnobs, setEnabledKnobs] = useState<Set<KnobKey>>(
    new Set(ALL_KNOB_KEYS)
  );

  const toggleKnob = (key: KnobKey) => {
    setEnabledKnobs(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toggleGroup = (keys: KnobKey[]) => {
    const allEnabled = keys.every(k => enabledKnobs.has(k));
    setEnabledKnobs(prev => {
      const next = new Set(prev);
      if (allEnabled) {
        keys.forEach(k => next.delete(k));
      } else {
        keys.forEach(k => next.add(k));
      }
      return next;
    });
  };

  const handleRun = () => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("scenarioId", scenarioId);
      formData.set("horizonDays", String(horizonDays));
      formData.set("seed", String(seedDefault));
      formData.set("maxWaitMinutes", String(maxWaitMinutes));
      formData.set("enabledKnobs", JSON.stringify([...enabledKnobs]));

      const result = await runOptimizerAction(formData);
      router.push(`/scenarios/${scenarioId}/optimize/${result.runId}`);
    });
  };

  const enabledCount = enabledKnobs.size;

  return (
    <Card
      elevation={0}
      variant="outlined"
      sx={{
        p: 4,
        background: "linear-gradient(135deg, rgba(37,99,235,0.03) 0%, rgba(124,58,237,0.05) 100%)",
        borderColor: "primary.main",
        borderStyle: "dashed",
      }}
    >
      <Typography variant="overline" color="primary" gutterBottom>
        Goal-Seeking Optimiser
      </Typography>
      <Typography variant="h3" gutterBottom sx={{ mt: 1 }}>
        Find the optimal config
      </Typography>
      <Typography variant="body2" color="text.secondary" paragraph>
        Explores 220 configurations using Latin Hypercube Sampling to maximise net profit
        subject to your wait time constraint. The baseline is your current saved scenario
        run with the selected seed and horizon. An AI advisor interprets the top results.
      </Typography>

      <Stack spacing={2.5} sx={{ mt: 3 }}>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6 }}>
            <TextField
              label="Max P90 wait (minutes)"
              type="number"
              fullWidth
              size="small"
              value={maxWaitMinutes}
              onChange={(e) => setMaxWaitMinutes(Number(e.target.value))}
              slotProps={{ htmlInput: { min: 5, max: 240, step: 5 } }}
              helperText="P90 wait ceiling for feasibility"
            />
          </Grid>
          <Grid size={{ xs: 12, sm: 6 }}>
            <FormControl fullWidth size="small">
              <InputLabel>Horizon</InputLabel>
              <Select
                value={horizonDays}
                label="Horizon"
                onChange={(e) => setHorizonDays(Number(e.target.value))}
              >
                {HORIZON_OPTIONS.map((opt) => (
                  <MenuItem key={opt} value={opt}>
                    {opt === 1 ? "1 day" : `${opt} days`}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
        </Grid>

        {/* Search space configuration */}
        <Box>
          <Button
            variant="text"
            size="small"
            color="inherit"
            onClick={() => setShowAdvanced(v => !v)}
            endIcon={showAdvanced ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
            sx={{ color: "text.secondary", px: 0, fontWeight: 400, fontSize: 12 }}
          >
            Search space: {enabledCount}/{ALL_KNOB_KEYS.length} parameters active
          </Button>
          <Collapse in={showAdvanced}>
            <Box sx={{
              mt: 1.5, p: 2,
              border: "1px solid", borderColor: "divider",
              borderRadius: 1, bgcolor: "background.paper"
            }}>
              {/* Machines group */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Machines
                </Typography>
                <Button size="small" variant="text" sx={{ fontSize: 11, py: 0, minWidth: 0 }}
                  onClick={() => toggleGroup(MACHINE_KNOBS.map(k => k.key))}>
                  {MACHINE_KNOBS.every(k => enabledKnobs.has(k.key)) ? "None" : "All"}
                </Button>
              </Stack>
              <Grid container>
                {MACHINE_KNOBS.map(({ key, label }) => (
                  <Grid key={key} size={{ xs: 6 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={enabledKnobs.has(key)}
                          onChange={() => toggleKnob(key)}
                          size="small"
                        />
                      }
                      label={<Typography variant="body2">{label}</Typography>}
                    />
                  </Grid>
                ))}
              </Grid>

              {/* Staff group */}
              <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.5, mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Staffing
                </Typography>
                <Button size="small" variant="text" sx={{ fontSize: 11, py: 0, minWidth: 0 }}
                  onClick={() => toggleGroup(STAFF_KNOBS.map(k => k.key))}>
                  {STAFF_KNOBS.every(k => enabledKnobs.has(k.key)) ? "None" : "All"}
                </Button>
              </Stack>
              <Grid container>
                {STAFF_KNOBS.map(({ key, label }) => (
                  <Grid key={key} size={{ xs: 6 }}>
                    <FormControlLabel
                      control={
                        <Checkbox
                          checked={enabledKnobs.has(key)}
                          onChange={() => toggleKnob(key)}
                          size="small"
                        />
                      }
                      label={<Typography variant="body2">{label}</Typography>}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          </Collapse>
        </Box>

        <Button
          variant="contained"
          color="primary"
          fullWidth
          size="large"
          disabled={isPending || enabledCount === 0}
          onClick={handleRun}
          sx={{ fontWeight: 700, mt: 1 }}
        >
          {isPending ? "Starting optimiser…" : `Run Optimiser (${enabledCount} params) →`}
        </Button>
        <Typography variant="caption" color="text.secondary">
          Runs in ~15&ndash;30s in the background. You&apos;ll be taken to the results page automatically.
        </Typography>
      </Stack>
    </Card>
  );
}
