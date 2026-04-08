import { prisma } from "@/lib/prisma";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Table from "@mui/material/Table";
import TableHead from "@mui/material/TableHead";
import TableBody from "@mui/material/TableBody";
import TableRow from "@mui/material/TableRow";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import Button from "@mui/material/Button";
import Link from "next/link";
import Grid from "@mui/material/Grid";
import { formatCurrency } from "@/lib/currency";

function formatMinutes(value: number) {
  return `${Math.round(value)} min`;
}

function formatPercent(value: number) {
  return `${Math.round(value)}%`;
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ base?: string, variant?: string }> }) {
  const { base, variant } = await searchParams;

  if (!base || !variant) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Typography variant="h4">Missing run IDs</Typography>
        <Typography>Please provide ?base=runId&variant=runId in the URL.</Typography>
        <Button component={Link} href="/" variant="contained" sx={{ mt: 2 }}>Back to Home</Button>
      </Container>
    );
  }

  const [baseRun, variantRun] = await Promise.all([
    prisma.simulationRun.findUnique({
      where: { id: base },
      include: { scenario: true }
    }),
    prisma.simulationRun.findUnique({
      where: { id: variant },
      include: { scenario: true }
    })
  ]);

  if (!baseRun || !variantRun) {
    return (
      <Container maxWidth="lg" sx={{ py: 6 }}>
        <Typography>Run not found.</Typography>
        <Button component={Link} href="/" variant="contained" sx={{ mt: 2 }}>Back to Home</Button>
      </Container>
    );
  }

  const currency = baseRun.scenario.currency;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const getMetrics = (run: any) => {
    const sum = run.summary ?? {};
    return {
      revenue: sum.actualRevenue ?? 0,
      profit: sum.totalProfit ?? 0,
      consumables: sum.consumableCost ?? 0,
      machineCost: sum.machineCost ?? 0,
      staffCost: sum.staffCost ?? 0,
      totalCost: sum.totalCost ?? 0,
      patients: sum.completedPatients ?? 0,
      wait: sum.p50WaitMinutes ?? 0,
      result: sum.p50ResultMinutes ?? 0,
      machine: sum.machineUtilization ?? 0,
      radiologist: sum.radiologistUtilization ?? 0
    };
  };

  const baseMetrics = getMetrics(baseRun);
  const variantMetrics = getMetrics(variantRun);

  const diffStr = (baseVal: number, variantVal: number, isCurrency: boolean = false, isPercent: boolean = false, isTime: boolean = false) => {
    const diff = variantVal - baseVal;
    const sign = diff > 0 ? "+" : "";
    if (isCurrency) return `${sign}${formatCurrency(diff, currency)}`;
    if (isPercent) return `${sign}${diff.toFixed(1)}%`;
    if (isTime) return `${sign}${Math.round(diff)}m`;
    return `${sign}${Math.round(diff)}`;
  };

  const rows = [
    { label: "Revenue", base: formatCurrency(baseMetrics.revenue, currency), variant: formatCurrency(variantMetrics.revenue, currency), diff: diffStr(baseMetrics.revenue, variantMetrics.revenue, true) },
    { label: "Net Profit", base: formatCurrency(baseMetrics.profit, currency), variant: formatCurrency(variantMetrics.profit, currency), diff: diffStr(baseMetrics.profit, variantMetrics.profit, true) },
    { label: "Consumables", base: formatCurrency(baseMetrics.consumables, currency), variant: formatCurrency(variantMetrics.consumables, currency), diff: diffStr(baseMetrics.consumables, variantMetrics.consumables, true) },
    { label: "Machine Lease Costs", base: formatCurrency(baseMetrics.machineCost, currency), variant: formatCurrency(variantMetrics.machineCost, currency), diff: diffStr(baseMetrics.machineCost, variantMetrics.machineCost, true) },
    { label: "Salary Expenses", base: formatCurrency(baseMetrics.staffCost, currency), variant: formatCurrency(variantMetrics.staffCost, currency), diff: diffStr(baseMetrics.staffCost, variantMetrics.staffCost, true) },
    { label: "Total Expenses", base: formatCurrency(baseMetrics.totalCost, currency), variant: formatCurrency(variantMetrics.totalCost, currency), diff: diffStr(baseMetrics.totalCost, variantMetrics.totalCost, true) },
    { label: "Completed Patients", base: Math.round(baseMetrics.patients), variant: Math.round(variantMetrics.patients), diff: diffStr(baseMetrics.patients, variantMetrics.patients) },
    { label: "P50 Wait Time", base: formatMinutes(baseMetrics.wait), variant: formatMinutes(variantMetrics.wait), diff: diffStr(baseMetrics.wait, variantMetrics.wait, false, false, true) },
    { label: "P50 Result Time", base: formatMinutes(baseMetrics.result), variant: formatMinutes(variantMetrics.result), diff: diffStr(baseMetrics.result, variantMetrics.result, false, false, true) },
    { label: "Machine Util", base: formatPercent(baseMetrics.machine), variant: formatPercent(variantMetrics.machine), diff: diffStr(baseMetrics.machine, variantMetrics.machine, false, true) },
    { label: "Rad Util", base: formatPercent(baseMetrics.radiologist), variant: formatPercent(variantMetrics.radiologist), diff: diffStr(baseMetrics.radiologist, variantMetrics.radiologist, false, true) }
  ];

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Grid container justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Typography variant="h1">Compare Runs</Typography>
        <Button component={Link} href={`/scenarios/${baseRun.scenarioId}`} variant="outlined">
          Back to Scenario
        </Button>
      </Grid>
      
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={0} variant="outlined" sx={{ p: 3, bgcolor: 'background.default' }}>
            <Typography variant="overline" color="secondary">Baseline</Typography>
            <Typography variant="h3">{baseRun.scenario.name}</Typography>
            <Typography variant="body2" color="text.secondary">Run ID: {base}</Typography>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Card elevation={0} variant="outlined" sx={{ p: 3, bgcolor: 'background.default' }}>
            <Typography variant="overline" color="secondary">Variant</Typography>
            <Typography variant="h3">{variantRun.scenario.name}</Typography>
            <Typography variant="body2" color="text.secondary">Run ID: {variant}</Typography>
          </Card>
        </Grid>
      </Grid>

      <TableContainer component={Card} elevation={0} variant="outlined">
        <Table>
          <TableHead sx={{ bgcolor: 'background.default' }}>
            <TableRow>
              <TableCell>Metric</TableCell>
              <TableCell align="right">Baseline</TableCell>
              <TableCell align="right">Variant</TableCell>
              <TableCell align="right">Difference</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => {
              const isProfitOrRev = row.label === "Revenue" || row.label === "Net Profit" || row.label === "Completed Patients" || row.label.includes("Util");
              const valNumStr = row.diff.replace(/[^0-9.-]+/g,"");
              const valNum = parseFloat(valNumStr) || 0;
              let diffColor = 'inherit';
              
              if (row.diff.startsWith('+')) {
                diffColor = isProfitOrRev ? 'success.main' : 'error.main';
              } else if (row.diff.startsWith('-')) {
                diffColor = isProfitOrRev ? 'error.main' : 'success.main';
              }
              
              // No diff case
              if (valNum === 0 || row.diff === '+0' || row.diff === '-0' || row.diff === '+0%' || row.diff === '-0%') {
                diffColor = 'text.secondary';
              }

              return (
                <TableRow key={row.label} hover>
                  <TableCell component="th" scope="row"><strong>{row.label}</strong></TableCell>
                  <TableCell align="right">{row.base}</TableCell>
                  <TableCell align="right">{row.variant}</TableCell>
                  <TableCell align="right" sx={{ color: diffColor, fontWeight: 'bold' }}>
                    {row.diff}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Container>
  );
}
