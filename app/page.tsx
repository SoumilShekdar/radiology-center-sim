import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { createDefaultScenarioAction, seedSampleScenariosAction } from "@/lib/actions";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { listScenarioSummaries } from "@/lib/scenario-store";
import { ActionButton } from "@/components/action-button";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import CardActionArea from "@mui/material/CardActionArea";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";

export const dynamic = "force-dynamic";

type HomeRun = Prisma.SimulationRunGetPayload<{
  include: {
    scenario: true;
  };
}>;

export default async function HomePage() {
  let scenarios: Awaited<ReturnType<typeof listScenarioSummaries>> = [];
  let recentRuns: HomeRun[] = [];
  let databaseSetupNeeded = false;

  try {
    scenarios = await listScenarioSummaries();
    recentRuns = await prisma.simulationRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { scenario: true }
    });
  } catch {
    databaseSetupNeeded = true;
  }

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {/* Hero Section */}
      <Grid container spacing={4} sx={{ mb: 6 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card elevation={0} variant="outlined" sx={{ p: 4, height: '100%' }}>
            <Typography variant="overline" color="secondary" gutterBottom>Radiology Ops Lab</Typography>
            <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
              Model capacity, queues, and reporting lag.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              Build scenarios for staffing and machine mix, then simulate radiology demand over a day, week, month, or year.
              Saved runs keep a reusable history of throughput, waits, utilization, and revenue.
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap" useFlexGap sx={{ mt: 3 }}>
              <Button component={Link} href="/scenarios/new" variant="contained" size="large">
                Create scenario
              </Button>
              <Button component={Link} href="/how-it-works" variant="outlined" size="large">
                How it works
              </Button>
              <ActionButton 
                variant="outlined" 
                size="large"
                serverAction={seedSampleScenariosAction}
                loadingText="Seeding..."
                successText="Sample scenarios seeded."
              >
                Seed sample scenarios
              </ActionButton>
              <ActionButton 
                variant="outlined" 
                size="large"
                serverAction={createDefaultScenarioAction}
                loadingText="Adding..."
                successText="Starter scenario added."
              >
                Add starter scenario
              </ActionButton>
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card elevation={0} variant="outlined" sx={{ p: 4, height: '100%', bgcolor: 'background.default' }}>
            <Typography variant="overline" color="secondary" gutterBottom>What this captures</Typography>
            <Typography variant="body2" color="text.secondary" paragraph>
              Machines, rooms, changing rooms, technicians, support staff, radiologists, reporting delays, patient mix,
              time-of-day arrivals, service distribution, downtime, and shift coverage.
            </Typography>
            
            {databaseSetupNeeded && (
              <Box sx={{ p: 3, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center', mb: 3 }}>
                <Typography color="text.secondary">
                  Database setup is still needed. Add `DATABASE_URL`, run the Prisma migration, and then the simulator will be ready to save scenarios and runs.
                </Typography>
              </Box>
            )}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Card elevation={0} variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="overline" color="secondary">Scenarios</Typography>
                  <Typography variant="h3">{scenarios.length}</Typography>
                  <Typography variant="caption" color="text.secondary">Reusable models</Typography>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Card elevation={0} variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="overline" color="secondary">Saved runs</Typography>
                  <Typography variant="h3">{recentRuns.length}</Typography>
                  <Typography variant="caption" color="text.secondary">Latest results</Typography>
                </Card>
              </Grid>
              <Grid size={{ xs: 12, sm: 4 }}>
                <Card elevation={0} variant="outlined" sx={{ p: 2, textAlign: 'center' }}>
                  <Typography variant="overline" color="secondary">Horizons</Typography>
                  <Typography variant="h3">4</Typography>
                  <Typography variant="caption" color="text.secondary">Day, week, month</Typography>
                </Card>
              </Grid>
            </Grid>
          </Card>
        </Grid>
      </Grid>

      <Grid container spacing={4}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Box mb={3}>
            <Typography variant="overline" color="secondary">Scenarios</Typography>
            <Typography variant="h2">Saved planning scenarios</Typography>
          </Box>
          {scenarios.length === 0 ? (
            <Box sx={{ p: 4, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
              <Typography color="text.secondary">
                No scenarios yet. Seed the sample set or create a custom radiology department to get started.
              </Typography>
            </Box>
          ) : (
            <Grid container spacing={2}>
              {scenarios.map((scenario) => (
                <Grid size={{ xs: 12, sm: 6 }} key={scenario.id}>
                  <Card elevation={0} variant="outlined" sx={{ height: '100%' }}>
                    <CardActionArea component={Link} href={`/scenarios/${scenario.id}`} sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <Typography variant="overline" color="secondary" gutterBottom>
                        Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(scenario.updatedAt)}
                      </Typography>
                      <Typography variant="h3" gutterBottom>{scenario.name}</Typography>
                      <Typography variant="body2" color="text.secondary" paragraph sx={{ flexGrow: 1 }}>
                        {scenario.description}
                      </Typography>
                      <Chip label={`Seed ${scenario.seedDefault}`} size="small" />
                    </CardActionArea>
                  </Card>
                </Grid>
              ))}
            </Grid>
          )}
        </Grid>

        <Grid size={{ xs: 12, md: 5 }}>
          <Box mb={3}>
            <Typography variant="overline" color="secondary">Run history</Typography>
            <Typography variant="h2">Recent simulations</Typography>
          </Box>
          {recentRuns.length === 0 ? (
            <Box sx={{ p: 4, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center' }}>
              <Typography color="text.secondary">Run a scenario to see results history here.</Typography>
            </Box>
          ) : (
            <Stack spacing={2}>
              {recentRuns.map((run) => {
                const summary = run.summary as { actualRevenue?: number; lostRevenue?: number; p90WaitMinutes?: number; bottleneck?: string } | null;
                return (
                  <Card key={run.id} elevation={0} variant="outlined">
                    <CardActionArea component={Link} href={`/runs/${run.id}`} sx={{ p: 3 }}>
                      <Typography variant="overline" color="secondary" gutterBottom>{run.scenario.name}</Typography>
                      <Typography variant="subtitle1" fontWeight="600" gutterBottom>
                        {run.horizonDays === 1 ? "1 day" : `${run.horizonDays} day`} simulation
                      </Typography>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {run.status === "COMPLETED"
                          ? `P90 wait ${Math.round(summary?.p90WaitMinutes ?? 0)} min • Actual ${formatCurrency(summary?.actualRevenue ?? 0, run.scenario.currency)}`
                          : `${run.status} • Seed ${run.seed}`}
                      </Typography>
                      <Chip 
                        label={run.status === "COMPLETED"
                          ? `Lost ${formatCurrency(summary?.lostRevenue ?? 0, run.scenario.currency)} • ${summary?.bottleneck ?? "n/a"}`
                          : "Open run status"}
                        size="small"
                        color={run.status === "COMPLETED" ? "default" : "primary"}
                        variant="outlined"
                        sx={{ mt: 1 }}
                      />
                    </CardActionArea>
                  </Card>
                );
              })}
            </Stack>
          )}
        </Grid>
      </Grid>
    </Container>
  );
}
