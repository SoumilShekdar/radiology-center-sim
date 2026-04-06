import { prisma } from "@/lib/prisma";
import { getScenario } from "@/lib/scenario-store";
import { describeChanges } from "@/lib/optimizer";
import { formatCurrency } from "@/lib/currency";
import { upsertScenario } from "@/lib/scenario-store";
import { revalidatePath } from "next/cache";
import Link from "next/link";

import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import { RunStatusPoller } from "@/components/run-status-poller";

function formatPercent(v: number) { return `${Math.round(v)}%`; }
function formatMin(v: number) { return `${Math.round(v)} min`; }

export default async function OptimizeResultPage({
  params,
}: {
  params: Promise<{ id: string; runId: string }>;
}) {
  const { id: scenarioId, runId } = await params;

  const rows = await prisma.$queryRaw<Array<{
    id: string; status: string; horizonDays: number; seed: number;
    constraint: { maxWaitMinutes: number }; completedAt: Date | null;
    results: Record<string, unknown> | null;
  }>>`
    SELECT "id", "status", "horizonDays", "seed", "constraint", "completedAt", "results"
    FROM "OptimiserRun" WHERE "id" = ${runId}
  `;
  if (!rows.length) return <div>Optimiser run not found.</div>;
  const optRun = rows[0];
  const scenario = await getScenario(scenarioId);

  const isPending = optRun.status === "QUEUED" || optRun.status === "RUNNING";
  const isFailed = optRun.status === "FAILED";
  const currency = scenario.currency;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const results = (optRun.results ?? {}) as any;
  const baseline = results.baseline;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const candidates = (results.candidates ?? []) as any[];
  const advice = results.advice;
  const constraint = optRun.constraint as { maxWaitMinutes: number };

  async function applyCandidate(formData: FormData) {
    "use server";
    const configJson = formData.get("resourceConfig");
    if (typeof configJson !== "string") return;
    const resourceConfig = JSON.parse(configJson);
    const copyName = `${scenario.name} (Optimised)`;
    await upsertScenario({ ...scenario, id: undefined, name: copyName, resourceConfig });
    revalidatePath("/");
  }

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      {isPending && <RunStatusPoller active={isPending} />}

      {/* Header */}
      <Card elevation={0} variant="outlined" sx={{ p: 4, mb: 4 }}>
        <Typography variant="overline" color="secondary" gutterBottom>
          Goal-Seeking Optimiser
        </Typography>
        <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: "2rem", md: "2.8rem" } }}>
          {scenario.name}
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          {isPending
            ? `Status: ${optRun.status} — Exploring configurations with Latin Hypercube Sampling…`
            : isFailed
            ? `Optimiser failed. ${results.error ?? ""}`
            : `Explored 220 configurations • P90 Wait ≤ ${constraint.maxWaitMinutes} min constraint • Completed ${optRun.completedAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(optRun.completedAt)) : ""}`}
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 2 }}>
          <Button component={Link} href={`/scenarios/${scenarioId}`} variant="outlined">
            Back to scenario
          </Button>
        </Stack>
      </Card>

      {!isPending && !isFailed && baseline && (
        <Stack spacing={4}>
          {/* LLM Narrative */}
          {advice && (
            <Card elevation={0} variant="outlined" sx={{ p: 4, borderColor: "primary.main", bgcolor: "rgba(37,99,235,0.03)" }}>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2 }}>
                <Typography variant="overline" color="primary">AI Advisor</Typography>
                <Chip label={advice.model ?? "gemini"} size="small" variant="outlined" color="primary" />
              </Stack>
              <Typography variant="body1" paragraph sx={{ fontStyle: "italic", color: "text.secondary" }}>
                {advice.narrative}
              </Typography>
              {advice.keyActions?.length > 0 && (
                <Stack spacing={1}>
                  {advice.keyActions.map((action: string, i: number) => (
                    <Stack key={i} direction="row" spacing={1} alignItems="flex-start">
                      <Typography sx={{ color: "primary.main", fontWeight: 700, mt: 0.1 }}>→</Typography>
                      <Typography variant="body2">{action}</Typography>
                    </Stack>
                  ))}
                </Stack>
              )}
            </Card>
          )}

          {/* Baseline vs Constraint */}
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={0} variant="outlined" sx={{ p: 3, height: "100%" }}>
                <Typography variant="overline" color="secondary" gutterBottom>Baseline Profit</Typography>
                <Typography variant="h3">{formatCurrency(baseline.totalProfit ?? 0, currency)}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Revenue {formatCurrency(baseline.actualRevenue, currency)}</Typography>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={0} variant="outlined" sx={{ p: 3, height: "100%" }}>
                <Typography variant="overline" color="secondary" gutterBottom>Baseline P90 Wait</Typography>
                <Typography variant="h3">{formatMin(baseline.p90WaitMinutes)}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Constraint ≤ {formatMin(constraint.maxWaitMinutes)}</Typography>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={0} variant="outlined" sx={{ p: 3, height: "100%" }}>
                <Typography variant="overline" color="secondary" gutterBottom>Best Found Profit</Typography>
                {(() => {
                  const best = candidates.find((c) => c.feasible) ?? candidates[0];
                  const diff = best ? (best.summary?.totalProfit ?? 0) - (baseline.totalProfit ?? 0) : 0;
                  return (
                    <>
                      <Typography variant="h3" color={diff >= 0 ? "success.main" : "error.main"}>
                        {diff >= 0 ? "+" : ""}{formatCurrency(diff, currency)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        vs baseline
                      </Typography>
                    </>
                  );
                })()}
              </Card>
            </Grid>
            <Grid size={{ xs: 12, sm: 6, md: 3 }}>
              <Card elevation={0} variant="outlined" sx={{ p: 3, height: "100%" }}>
                <Typography variant="overline" color="secondary" gutterBottom>Feasible Configs</Typography>
                <Typography variant="h3">{candidates.filter((c) => c.feasible).length}</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>of {candidates.length} candidates meet wait constraint</Typography>
              </Card>
            </Grid>
          </Grid>

          {/* Candidate Table */}
          <Box>
            <Typography variant="h2" gutterBottom sx={{ mb: 2 }}>Top Configurations</Typography>
            <TableContainer component={Card} elevation={0} variant="outlined">
              <Table>
                <TableHead sx={{ bgcolor: "background.default" }}>
                  <TableRow>
                    <TableCell>Rank</TableCell>
                    <TableCell>Changes vs Baseline</TableCell>
                    <TableCell align="right">Net Profit</TableCell>
                    <TableCell align="right">Profit Δ</TableCell>
                    <TableCell align="right">P90 Wait</TableCell>
                    <TableCell align="right">Patients</TableCell>
                    <TableCell align="right">Machine Util</TableCell>
                    <TableCell align="right">Feasible</TableCell>
                    <TableCell align="right">Apply</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {candidates.map((candidate, index) => {
                    const profitDiff = (candidate.summary?.totalProfit ?? 0) - (baseline.totalProfit ?? 0);
                    const waitDiff = (candidate.summary?.p90WaitMinutes ?? 0) - baseline.p90WaitMinutes;
                    const changes = describeChanges(scenario.resourceConfig, candidate.resourceConfig);

                    return (
                      <TableRow key={index} hover sx={{ bgcolor: index === 0 && candidate.feasible ? "rgba(22,163,74,0.04)" : undefined }}>
                        <TableCell>
                          <Chip
                            label={index === 0 ? "Best" : `#${index + 1}`}
                            size="small"
                            color={index === 0 && candidate.feasible ? "success" : "default"}
                            variant={index === 0 ? "filled" : "outlined"}
                          />
                        </TableCell>
                        <TableCell>
                          <Stack spacing={0.5}>
                            {changes.map((c, i) => (
                              <Typography key={i} variant="caption" display="block">{c}</Typography>
                            ))}
                          </Stack>
                        </TableCell>
                        <TableCell align="right">{formatCurrency(candidate.summary?.totalProfit ?? 0, currency)}</TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{ color: profitDiff >= 0 ? "success.main" : "error.main", fontWeight: 600 }}
                          >
                            {profitDiff >= 0 ? "+" : ""}{formatCurrency(profitDiff, currency)}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">
                          <Typography
                            variant="body2"
                            sx={{ color: (candidate.summary?.p90WaitMinutes ?? 0) <= constraint.maxWaitMinutes ? "success.main" : "error.main" }}
                          >
                            {formatMin(candidate.summary?.p90WaitMinutes ?? 0)}
                            {waitDiff !== 0 && ` (${waitDiff >= 0 ? "+" : ""}${Math.round(waitDiff)}m)`}
                          </Typography>
                        </TableCell>
                        <TableCell align="right">{Math.round(candidate.summary?.completedPatients ?? 0)}</TableCell>
                        <TableCell align="right">{formatPercent(candidate.summary?.machineUtilization ?? 0)}</TableCell>
                        <TableCell align="right">
                          <Chip
                            label={candidate.feasible ? "Yes" : "No"}
                            size="small"
                            color={candidate.feasible ? "success" : "default"}
                            variant="outlined"
                          />
                        </TableCell>
                        <TableCell align="right">
                          <form action={applyCandidate}>
                            <input type="hidden" name="resourceConfig" value={JSON.stringify(candidate.resourceConfig)} />
                            <Button type="submit" size="small" variant="outlined" color="primary">
                              Apply
                            </Button>
                          </form>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Stack>
      )}
    </Container>
  );
}
