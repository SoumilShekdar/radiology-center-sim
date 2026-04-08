import Link from "next/link";
import { ScenarioEditor } from "@/components/scenario-editor";
import { duplicateScenarioAction } from "@/lib/actions";
import { formatCurrency } from "@/lib/currency";
import { getScenario, listRunsForScenario } from "@/lib/scenario-store";
import { ActionButton } from "@/components/action-button";
import { OptimizerPanel } from "@/components/optimizer-panel";
import { prisma } from "@/lib/prisma";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import CardActionArea from "@mui/material/CardActionArea";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";

export default async function ScenarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = await getScenario(id);
  const runs = await listRunsForScenario(id);
  const optimiserRuns = await prisma.$queryRaw<Array<{
    id: string; status: string; horizonDays: number;
    constraint: { maxWaitMinutes: number };
    startedAt: Date; completedAt: Date | null;
    results: { advice?: { narrative?: string } } | null;
  }>>`
    SELECT "id", "status", "horizonDays", "constraint", "startedAt", "completedAt", "results"
    FROM "OptimiserRun"
    WHERE "scenarioId" = ${id}
    ORDER BY "startedAt" DESC
    LIMIT 5
  `;

  const handleDuplicate = async () => {
    "use server";
    const formData = new FormData();
    formData.set("scenarioId", scenario.id ?? "");
    await duplicateScenarioAction(formData);
  };

  return (
    <Container maxWidth="xl" sx={{ py: 6 }}>
      <Grid container spacing={6}>
        {/* Left Column: Sticky Sidebar for Scenario Tuning */}
        <Grid 
          size={{ xs: 12, lg: 4 }} 
          sx={{ 
            position: { lg: 'sticky' }, 
            top: { lg: 32 }, 
            height: { lg: 'calc(100vh - 64px)' }, 
            overflowY: { lg: 'auto' },
            pr: { lg: 2 },
            pb: { lg: 4 }
          }}
        >
          <Card elevation={0} variant="outlined" sx={{ p: 4, mb: 4 }}>
            <Typography variant="overline" color="secondary" gutterBottom>Scenario Config</Typography>
            <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2rem', md: '2.5rem' } }}>{scenario.name}</Typography>
            <Typography variant="body1" color="text.secondary" paragraph>{scenario.description}</Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 3, flexWrap: "wrap", gap: 2 }}>
              <Button component={Link} href="/" variant="outlined">
                Back to home
              </Button>
              <ActionButton
                variant="outlined"
                serverAction={handleDuplicate}
                loadingText="Duplicating..."
                successText="Scenario duplicated successfully."
              >
                Duplicate scenario
              </ActionButton>
            </Stack>
          </Card>

          {/* Goal-Seeking Optimiser */}
          {scenario.id && (
            <Box sx={{ mb: 4 }}>
              <OptimizerPanel scenarioId={scenario.id} seedDefault={scenario.seedDefault} />
            </Box>
          )}

          {/* Scenario config editor */}
          <Divider sx={{ my: 4 }} />
          <Typography variant="h3" gutterBottom>Edit Parameters</Typography>
          <ScenarioEditor initialScenario={scenario} mode="edit" viewMode="basic" />
        </Grid>

        {/* Right Column: Massive data canvas */}
        <Grid size={{ xs: 12, lg: 8 }}>
          {/* Simulation + Optimiser runs */}
          <Card elevation={0} variant="outlined" sx={{ p: 4, bgcolor: 'background.default' }}>
            <Typography variant="overline" color="secondary" gutterBottom>Saved runs</Typography>
            {runs.length === 0 ? (
              <Box sx={{ p: 4, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center', mt: 2 }}>
                <Typography color="text.secondary" variant="body2">No runs yet for this scenario. Save your parameters in the left sidebar to simulate.</Typography>
              </Box>
            ) : (
              <Stack spacing={2} sx={{ mt: 2 }}>
                {runs.slice(0, 10).map((run) => {
                  const summary = run.summary as { actualRevenue?: number; p90WaitMinutes?: number; lostRevenue?: number } | null;
                  return (
                    <Card key={run.id} elevation={0} variant="outlined">
                      <CardActionArea component={Link} href={`/runs/${run.id}`} sx={{ p: 2 }}>
                        <Typography variant="subtitle1" fontWeight="600">{run.horizonDays === 1 ? "1 day" : `${run.horizonDays} day`} simulation run</Typography>
                        <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
                          <Typography variant="caption" color="text.secondary">
                            {run.status === "COMPLETED"
                              ? `Seed ${run.seed} • P90 wait ${Math.round(summary?.p90WaitMinutes ?? 0)} min`
                              : `${run.status} • Seed ${run.seed}`}
                          </Typography>
                          <Chip
                            label={run.status === "COMPLETED"
                              ? `Actual ${formatCurrency(summary?.actualRevenue ?? 0, scenario.currency)}`
                              : "Running..."}
                            size="small"
                            color={run.status === "COMPLETED" ? "default" : "primary"}
                            variant="outlined"
                          />
                        </Stack>
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Stack>
            )}

            {/* Optimizer runs */}
            {optimiserRuns.length > 0 && (
              <>
                <Divider sx={{ my: 4 }} />
                <Typography variant="overline" color="secondary" gutterBottom>Optimiser runs</Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  {optimiserRuns.map((opt) => {
                    const feasibleCount = (() => {
                      try {
                        const r = opt.results as { candidates?: Array<{ feasible: boolean }> } | null;
                        return r?.candidates?.filter(c => c.feasible).length ?? null;
                      } catch { return null; }
                    })();
                    return (
                      <Card key={opt.id} elevation={0} variant="outlined" sx={{ borderColor: opt.status === "COMPLETED" ? "primary.light" : undefined }}>
                        <CardActionArea
                          component={opt.status === "COMPLETED" ? Link : "div"}
                          href={opt.status === "COMPLETED" ? `/scenarios/${id}/optimize/${opt.id}` : undefined}
                          sx={{ p: 2 }}
                        >
                          <Typography variant="subtitle1" fontWeight="600">
                            {opt.horizonDays}d optimiser • ≤{opt.constraint.maxWaitMinutes} min P90
                          </Typography>
                          <Stack direction="row" spacing={2} alignItems="center" sx={{ mt: 1 }}>
                            <Typography variant="caption" color="text.secondary">
                              Status: {opt.status}
                            </Typography>
                            {opt.status === "COMPLETED" && feasibleCount !== null && (
                              <Chip label={`${feasibleCount} feasible configs`} size="small" color="primary" variant="outlined" />
                            )}
                            {opt.status === "RUNNING" && (
                              <Chip label="Processing..." size="small" color="warning" variant="outlined" />
                            )}
                          </Stack>
                        </CardActionArea>
                      </Card>
                    );
                  })}
                </Stack>
              </>
            )}
          </Card>
        </Grid>
      </Grid>
    </Container>
  );
}
