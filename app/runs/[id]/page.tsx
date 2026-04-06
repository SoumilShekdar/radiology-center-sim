import Link from "next/link";
import { RunStatusPoller } from "@/components/run-status-poller";
import { RunCompareSelector } from "@/components/run-compare-selector";
import { SimpleLineChart } from "@/components/simple-chart";
import { MODALITY_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";

function formatMinutes(value: number) {
  return `${Math.round(value)} min`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export default async function RunDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await prisma.simulationRun.findUniqueOrThrow({
    where: { id },
    include: {
      scenario: {
        include: {
          resourceConfig: true,
          demandProfile: true,
          serviceMix: true
        }
      },
      metrics: true,
      snapshots: {
        orderBy: [{ dayIndex: "asc" }, { modality: "asc" }]
      }
    }
  });

  const otherRuns = await prisma.simulationRun.findMany({
    where: { scenarioId: run.scenarioId, id: { not: run.id }, status: 'COMPLETED' },
    orderBy: { startedAt: 'desc' },
    take: 5
  });

  const summary = (run.summary ?? {}) as {
    mode?: "SINGLE" | "MONTE_CARLO";
    seed: number;
    possibleRevenue: number;
    maximumRevenue: number;
    actualRevenue: number;
    totalProfit: number;
    consumableCost: number;
    machineCost: number;
    staffCost: number;
    lostRevenue: number;
    lostRevenueDueToWait: number;
    lostRevenueDueToResult: number;
    averageWaitMinutes: number;
    averageResultMinutes: number;
    completedPatients: number;
    deferredPatients: number;
    bottleneck: string;
    machineUtilization: number;
    technicianUtilization: number;
    radiologistUtilization: number;
    roomUtilization: number;
    changingRoomUtilization: number;
    p50WaitMinutes: number;
    p90WaitMinutes: number;
    p50ResultMinutes: number;
    p90ResultMinutes: number;
    iterations?: number;
    seedStart?: number;
    seedEnd?: number;
    p10ActualRevenue?: number;
    p50ActualRevenue?: number;
    p90ActualRevenue?: number;
    p10P90WaitMinutes?: number;
    p50P90WaitMinutes?: number;
    p90P90WaitMinutes?: number;
    p10CompletedPatients?: number;
    p50CompletedPatients?: number;
    p90CompletedPatients?: number;
    error?: string;
  };

  const allSnapshots = run.snapshots.filter((snapshot) => snapshot.modality === "ALL");
  const modalityMetrics = run.metrics.filter((metric) => metric.modality !== "ALL");
  const currency = run.scenario.currency;
  const isPending = run.status === "QUEUED" || run.status === "RUNNING";
  const isFailed = run.status === "FAILED";

  const modalityRows = Object.entries(MODALITY_LABELS).map(([modality, label]) => {
    const throughputMetric = modalityMetrics.find((metric) => metric.modality === modality && metric.metricName === "throughput");
    const revenueMetric = modalityMetrics.find((metric) => metric.modality === modality && metric.metricName === "revenue");
    const avgWaitMetric = modalityMetrics.find((metric) => metric.modality === modality && metric.metricName === "averageWaitMinutes");
    const machineUtilMetric = modalityMetrics.find((metric) => metric.modality === modality && metric.metricName === "machineUtilization");
    const modalitySnapshots = run.snapshots.filter((snapshot) => snapshot.modality === modality);

    const throughputFallback = modalitySnapshots.reduce((sum, snapshot) => sum + snapshot.throughput, 0);
    const revenueFallback = modalitySnapshots.reduce((sum, snapshot) => sum + snapshot.revenue, 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profitFallback = modalitySnapshots.reduce((sum, snapshot) => sum + ((snapshot as any).profit || 0), 0);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const totalCostFallback = modalitySnapshots.reduce((sum, snapshot) => sum + ((snapshot as any).totalCost || 0), 0);
    const waitFallback =
      modalitySnapshots.length === 0 ? 0 : modalitySnapshots.reduce((sum, snapshot) => sum + snapshot.averageWaitMinutes, 0) / modalitySnapshots.length;
    const machineUtilFallback =
      modalitySnapshots.length === 0 ? 0 : modalitySnapshots.reduce((sum, snapshot) => sum + snapshot.machineUtilization, 0) / modalitySnapshots.length;

    return {
      modality,
      label,
      throughput: throughputMetric?.metricValue ?? throughputFallback,
      revenue: revenueMetric?.metricValue ?? revenueFallback,
      profit: profitFallback,
      totalCost: totalCostFallback,
      averageWaitMinutes: avgWaitMetric?.metricValue ?? waitFallback,
      machineUtilization: machineUtilMetric?.metricValue ?? machineUtilFallback
    };
  });


  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {isPending && <RunStatusPoller active={isPending} />}
      
      <Card elevation={0} variant="outlined" sx={{ p: 4, mb: 4 }}>
        <Typography variant="overline" color="secondary" gutterBottom>
          {isPending || isFailed ? 'Simulation run' : 'Simulation result'}
        </Typography>
        <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2.5rem', md: '3rem' } }}>{run.scenario.name}</Typography>
        
        <Typography variant="body1" color="text.secondary" paragraph>
          {isPending || isFailed ? (
            run.status === "QUEUED" ? "The simulation is queued and will start shortly." :
            run.status === "RUNNING" ? "The simulation is running in the background. You can leave this page and come back later." :
            summary.error ?? "The simulation failed before completing."
          ) : (
            <>{summary.mode === "MONTE_CARLO" ? "Monte Carlo" : "Simulation"} • Horizon {run.horizonDays === 1 ? "1 day" : `${run.horizonDays} days`} • Seed {run.seed} • Completed {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(run.completedAt ?? run.startedAt)}</>
          )}
        </Typography>

        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button component={Link} href={`/scenarios/${run.scenarioId}`} variant="outlined">
            Back to scenario
          </Button>
          <RunCompareSelector baseRunId={run.id} otherRuns={otherRuns} />
          <Button component={Link} href="/" variant="contained">
            Home
          </Button>
        </Stack>
      </Card>

      {(isPending || isFailed) ? (
        <Grid container spacing={3}>
          <Grid size={{ xs: 12, sm: 4 }}>
            <MetricCard title="Status" value={run.status} subtitle={isPending ? "This page refreshes automatically while the job is active." : "Open the scenario and try again if needed."} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <MetricCard title="Run type" value={summary.mode === "MONTE_CARLO" ? "Monte Carlo" : "Single run"} subtitle={`Horizon ${run.horizonDays === 1 ? "1 day" : `${run.horizonDays} days`}`} />
          </Grid>
          <Grid size={{ xs: 12, sm: 4 }}>
            <MetricCard title="Seed" value={run.seed} subtitle={summary.mode === "MONTE_CARLO" ? `Iterations ${summary.iterations ?? "pending"}` : "Reproducible run seed"} />
          </Grid>
        </Grid>
      ) : (
        <Stack spacing={4}>
          <Card elevation={0} variant="outlined" sx={{ p: 3, bgcolor: 'background.default' }}>
            <Typography variant="overline" color="secondary" gutterBottom>Bottleneck signal</Typography>
            <Typography variant="h3" sx={{ mt: 1, mb: 1 }}>{summary.bottleneck}</Typography>
            <Typography variant="body2" color="text.secondary">Most common delaying or blocking resource observed in the run.</Typography>
          </Card>

          {summary.mode === "MONTE_CARLO" && (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <MetricCard title="Iterations" value={summary.iterations ?? 0} subtitle={`Seeds ${summary.seedStart} to ${summary.seedEnd}`} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <MetricCard title="Actual Revenue Band" value={formatCurrency(summary.p50ActualRevenue ?? summary.actualRevenue, currency)} subtitle={`P10 ${formatCurrency(summary.p10ActualRevenue ?? 0, currency)} • P90 ${formatCurrency(summary.p90ActualRevenue ?? 0, currency)}`} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <MetricCard title="P90 Wait Band" value={formatMinutes(summary.p50P90WaitMinutes ?? summary.p90WaitMinutes)} subtitle={`P10 ${formatMinutes(summary.p10P90WaitMinutes ?? 0)} • P90 ${formatMinutes(summary.p90P90WaitMinutes ?? 0)}`} />
              </Grid>
              <Grid size={{ xs: 12, sm: 6, md: 3 }}>
                <MetricCard title="Completed Patients Band" value={Math.round(summary.p50CompletedPatients ?? summary.completedPatients)} subtitle={`P10 ${Math.round(summary.p10CompletedPatients ?? 0)} • P90 ${Math.round(summary.p90CompletedPatients ?? 0)}`} />
              </Grid>
            </Grid>
          )}

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard title="Net Profit" value={formatCurrency(summary.totalProfit ?? 0, currency)} subtitle={`Margin ${formatPercent(summary.actualRevenue ? ((summary.totalProfit ?? 0) / summary.actualRevenue) * 100 : 0)}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard title="Consumables" value={formatCurrency(summary.consumableCost ?? 0, currency)} subtitle="Variable scan costs" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard title="Machine Lease" value={formatCurrency(summary.machineCost ?? 0, currency)} subtitle="Fixed setup costs" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard title="Staff Expenses" value={formatCurrency(summary.staffCost ?? 0, currency)} subtitle="Total payroll costs" />
            </Grid>

            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard title="Run Seed" value={summary.mode === "MONTE_CARLO" ? `${summary.seedStart}-${summary.seedEnd}` : run.seed} subtitle={summary.mode === "MONTE_CARLO" ? "Seed range used for sensitivity run." : "Reuse this seed to reproduce."} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard title="Possible Revenue" value={formatCurrency(summary.possibleRevenue, currency)} subtitle="Demand-based if everyone retained" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard title="Maximum Revenue" value={formatCurrency(summary.maximumRevenue, currency)} subtitle="Machine ceiling at full util" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <MetricCard title="Actual Revenue" value={formatCurrency(summary.actualRevenue, currency)} subtitle={`Completed patients ${summary.completedPatients}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <MetricCard title="Lost Revenue" value={formatCurrency(summary.lostRevenue, currency)} subtitle="Possible minus actual" />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <MetricCard title="Wait to Perform" value={formatMinutes(summary.p50WaitMinutes)} subtitle={`P90 ${formatMinutes(summary.p90WaitMinutes)}`} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 4 }}>
              <MetricCard title="Time to Result" value={formatMinutes(summary.p50ResultMinutes)} subtitle={`P90 ${formatMinutes(summary.p90ResultMinutes)}`} />
            </Grid>
          </Grid>

          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box mb={2}>
                <Typography variant="h2" gutterBottom>Model assumptions</Typography>
              </Box>
              <Card elevation={0} variant="outlined" sx={{ p: 3, height: '100%', bgcolor: 'background.default' }}>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">• Rooms are explicit compatibility-controlled resources, not a pooled room count.</Typography>
                  <Typography variant="body2" color="text.secondary">• Portable X-Ray is modeled as a bedside workflow and does not require a room.</Typography>
                  <Typography variant="body2" color="text.secondary">• Changing-room use is modality-driven, with male, female, and unisex room pools.</Typography>
                  <Typography variant="body2" color="text.secondary">• Outpatient appointments: {run.scenario.appointmentPolicy && typeof run.scenario.appointmentPolicy === "object" && "enabled" in run.scenario.appointmentPolicy && run.scenario.appointmentPolicy.enabled ? "On" : "Off"}.</Typography>
                  <Typography variant="body2" color="text.secondary">• Service durations are sampled stochastically around configured average times.</Typography>
                </Stack>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box mb={2}>
                <Typography variant="h2" gutterBottom>Workflow summary</Typography>
              </Box>
              <Card elevation={0} variant="outlined" sx={{ p: 3, height: '100%', bgcolor: 'background.default' }}>
                <Stack spacing={2}>
                  <Typography variant="body2" color="text.secondary">• Configured rooms: {run.scenario.resourceConfig?.rooms ?? 0}</Typography>
                  <Typography variant="body2" color="text.secondary">• Configured changing rooms: {run.scenario.resourceConfig?.changingRooms ?? 0}</Typography>
                  <Typography variant="body2" color="text.secondary">• Portable X-Ray machines: {run.scenario.resourceConfig?.portableXRayMachines ?? 0}</Typography>
                  <Typography variant="body2" color="text.secondary">• Radiologists can report outside scan hours if their shift coverage is present.</Typography>
                </Stack>
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 4 }}>
              <MetricCard title="Lost due to wait" value={formatCurrency(summary.lostRevenueDueToWait, currency)} subtitle="Patient abandonment window or missed same-day exam" />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <MetricCard title="Lost due to results" value={formatCurrency(summary.lostRevenueDueToResult, currency)} subtitle="Results not available within 24 hours of arrival" />
            </Grid>
            <Grid size={{ xs: 12, sm: 4 }}>
              <MetricCard title="Utilization snapshot" value={formatPercent(summary.machineUtilization)} subtitle={`Tech ${formatPercent(summary.technicianUtilization)} • Rad ${formatPercent(summary.radiologistUtilization)}`} />
            </Grid>
          </Grid>

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
                />
              </Card>
            </Grid>
          </Grid>

          <Grid container spacing={4}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Box mb={2}>
                <Typography variant="h2" gutterBottom>Modality performance</Typography>
              </Box>
              <TableContainer component={Card} elevation={0} variant="outlined">
                <Table>
                  <TableHead sx={{ bgcolor: 'background.default' }}>
                    <TableRow>
                      <TableCell>Modality</TableCell>
                      <TableCell align="right">Throughput</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                      <TableCell align="right">Profit</TableCell>
                      <TableCell align="right">Margin</TableCell>
                      <TableCell align="right">Avg wait</TableCell>
                      <TableCell align="right">Machine util</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(MODALITY_LABELS).map(([modality, label]) => {
                      const row = modalityRows.find((item) => item.modality === modality);
                      const rowProfit = row?.profit ?? 0;
                      const rowRevenue = row?.revenue ?? 0;
                      const rowMargin = rowRevenue > 0 ? (rowProfit / rowRevenue) * 100 : 0;
                      return (
                        <TableRow key={modality} hover>
                          <TableCell component="th" scope="row">{label}</TableCell>
                          <TableCell align="right">{Math.round(row?.throughput ?? 0)}</TableCell>
                          <TableCell align="right">{formatCurrency(rowRevenue, currency)}</TableCell>
                          <TableCell align="right">{formatCurrency(rowProfit, currency)}</TableCell>
                          <TableCell align="right">{formatPercent(rowMargin)}</TableCell>
                          <TableCell align="right">{formatMinutes(row?.averageWaitMinutes ?? 0)}</TableCell>
                          <TableCell align="right">{formatPercent(row?.machineUtilization ?? 0)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>

            <Grid size={{ xs: 12, md: 6 }}>
              <Box mb={2}>
                <Typography variant="h2" gutterBottom>Daily snapshots</Typography>
              </Box>
              <TableContainer component={Card} elevation={0} variant="outlined">
                <Table size="small">
                  <TableHead sx={{ bgcolor: 'background.default' }}>
                    <TableRow>
                      <TableCell>Day</TableCell>
                      <TableCell align="right">Completed</TableCell>
                      <TableCell align="right">Deferred</TableCell>
                      <TableCell align="right">Revenue</TableCell>
                      <TableCell align="right">Profit</TableCell>
                      <TableCell align="right">P90 wait</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allSnapshots.slice(0, 16).map((snapshot) => (
                      <TableRow key={`${snapshot.dayIndex}-${snapshot.modality}`} hover>
                        <TableCell>{snapshot.dayIndex + 1}</TableCell>
                        <TableCell align="right">{snapshot.completedPatients}</TableCell>
                        <TableCell align="right">{snapshot.deferredPatients}</TableCell>
                        <TableCell align="right">{formatCurrency(snapshot.revenue, currency)}</TableCell>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <TableCell align="right">{formatCurrency((snapshot as any).profit ?? 0, currency)}</TableCell>
                        <TableCell align="right">{formatMinutes(snapshot.p90WaitMinutes)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>
          </Grid>
        </Stack>
      )}
    </Container>
  );
}

const MetricCard = ({ title, value, subtitle }: { title: string, value: string | number, subtitle: React.ReactNode }) => (
  <Card elevation={0} variant="outlined" sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
    <Typography variant="overline" color="secondary" gutterBottom sx={{ lineHeight: 1.2 }}>{title}</Typography>
    <Typography variant="h3" sx={{ mb: 1, mt: 1 }}>{value}</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 'auto' }}>{subtitle}</Typography>
  </Card>
);
