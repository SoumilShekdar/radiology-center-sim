import { getBottleneckAdvice } from "@/lib/llm-advisor";
import { Card, Typography } from "@mui/material";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import type { SimulationSummary, ScenarioInput } from "@/lib/types";

export async function InsightCard({
  scenarioName,
  currency,
  summary,
}: {
  scenarioName: string;
  currency: string;
  summary: any;
}) {
  const bottleneck = summary.bottleneck;
  let advice = "";
  
  if (bottleneck && bottleneck !== "None") {
    try {
      advice = await getBottleneckAdvice({
        scenarioName,
        bottleneck,
        currency,
        summary,
      });
    } catch (e) {
      advice = "Unable to fetch AI insights at this time.";
    }
  }

  if (!advice) return null;

  return (
    <Card
      elevation={0}
      variant="outlined"
      sx={{
        p: 3,
        bgcolor: "primary.50",
        borderColor: "primary.main",
        color: "primary.900",
        mt: 2
      }}
    >
      <Typography
        variant="overline"
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          mb: 1,
          color: "primary.main",
          fontWeight: "bold",
        }}
      >
        <AutoAwesomeIcon fontSize="small" /> AI Actionable Insight
      </Typography>
      <Typography variant="body1">{advice}</Typography>
    </Card>
  );
}
