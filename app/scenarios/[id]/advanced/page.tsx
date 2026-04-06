import Link from "next/link";
import { ScenarioEditor } from "@/components/scenario-editor";
import { duplicateScenarioAction } from "@/lib/actions";
import { getScenario } from "@/lib/scenario-store";

import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";
import { OptimizerPanel } from "@/components/optimizer-panel";

export default async function ScenarioAdvancedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = await getScenario(id);

  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Card elevation={0} variant="outlined" sx={{ p: 4, mb: 4 }}>
        <Typography variant="overline" color="secondary" gutterBottom>Advanced Options</Typography>
        <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2.5rem', md: '3rem' } }}>{scenario.name}</Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          Detailed operating assumptions for hours, staffing coverage, demand behavior, modality mix, and service timings.
        </Typography>
        <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
          <Button component={Link} href={`/scenarios/${scenario.id}`} variant="outlined">
            Back to Basic Options
          </Button>
          <form style={{ display: 'inline' }} action={duplicateScenarioAction}>
            <input type="hidden" name="scenarioId" value={scenario.id} />
            <Button variant="outlined" type="submit">
              Duplicate scenario
            </Button>
          </form>
        </Stack>
      </Card>
      
      {/* Goal-Seeking Optimiser — high visibility whitespace */}
      {scenario.id && (
        <Box sx={{ mb: 4 }}>
          <OptimizerPanel scenarioId={scenario.id} seedDefault={scenario.seedDefault} />
        </Box>
      )}
      
      <ScenarioEditor initialScenario={scenario} mode="edit" viewMode="advanced" />
    </Container>
  );
}
