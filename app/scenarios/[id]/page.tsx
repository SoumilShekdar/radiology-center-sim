import Link from "next/link";
import { ScenarioEditor } from "@/components/scenario-editor";
import { duplicateScenarioAction } from "@/lib/actions";
import { formatCurrency } from "@/lib/currency";
import { getScenario, listRunsForScenario } from "@/lib/scenario-store";
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

export default async function ScenarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = await getScenario(id);
  const runs = await listRunsForScenario(id);

  const handleDuplicate = async () => {
    "use server";
    const formData = new FormData();
    formData.set("scenarioId", scenario.id);
    await duplicateScenarioAction(formData);
  };

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Grid container spacing={4} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card elevation={0} variant="outlined" sx={{ p: 4, height: '100%' }}>
            <Typography variant="overline" color="secondary" gutterBottom>Scenario Config</Typography>
            <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2.5rem', md: '3rem' } }}>{scenario.name}</Typography>
            <Typography variant="body1" color="text.secondary" paragraph>{scenario.description}</Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
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
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card elevation={0} variant="outlined" sx={{ p: 4, height: '100%', bgcolor: 'background.default' }}>
            <Typography variant="overline" color="secondary" gutterBottom>Saved runs</Typography>
            {runs.length === 0 ? (
              <Box sx={{ p: 3, border: '2px dashed', borderColor: 'divider', borderRadius: 2, textAlign: 'center', mt: 2 }}>
                <Typography color="text.secondary">No runs yet for this scenario.</Typography>
              </Box>
            ) : (
              <Stack spacing={2} sx={{ mt: 2 }}>
                {runs.slice(0, 6).map((run) => {
                  const summary = run.summary as { actualRevenue?: number; p90WaitMinutes?: number; lostRevenue?: number } | null;
                  return (
                    <Card key={run.id} elevation={0} variant="outlined">
                      <CardActionArea component={Link} href={`/runs/${run.id}`} sx={{ p: 2 }}>
                        <Typography variant="subtitle2" fontWeight="600">{run.horizonDays === 1 ? "1 day" : `${run.horizonDays} day`} run</Typography>
                        <Typography variant="caption" color="text.secondary" display="block" gutterBottom>
                          {run.status === "COMPLETED"
                            ? `Seed ${run.seed} • P90 wait ${Math.round(summary?.p90WaitMinutes ?? 0)} min`
                            : `${run.status} • Seed ${run.seed}`}
                        </Typography>
                        <Chip 
                          label={run.status === "COMPLETED"
                            ? `Actual ${formatCurrency(summary?.actualRevenue ?? 0, scenario.currency)} • Lost ${formatCurrency(summary?.lostRevenue ?? 0, scenario.currency)}`
                            : "Open run status"}
                          size="small"
                          color={run.status === "COMPLETED" ? "default" : "primary"}
                          variant="outlined"
                        />
                      </CardActionArea>
                    </Card>
                  );
                })}
              </Stack>
            )}
          </Card>
        </Grid>
      </Grid>

      {/* Editor Component Mount */}
      <ScenarioEditor initialScenario={scenario} mode="edit" viewMode="basic" />
    </Container>
  );
}
