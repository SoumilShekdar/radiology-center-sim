import { ScenarioEditor } from "@/components/scenario-editor";
import { DEFAULT_SCENARIO } from "@/lib/sample-scenarios";
import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";

export default function NewScenarioPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Card elevation={0} variant="outlined" sx={{ p: 4, mb: 4 }}>
        <Typography variant="overline" color="secondary" gutterBottom>Basic Options</Typography>
        <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2.5rem', md: '3rem' }, maxWidth: "16ch" }}>
          Create a radiology simulator scenario.
        </Typography>
      </Card>
      
      <ScenarioEditor initialScenario={DEFAULT_SCENARIO} mode="create" viewMode="basic" />
    </Container>
  );
}
