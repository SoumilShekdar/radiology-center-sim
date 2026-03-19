import Link from "next/link";
import Container from "@mui/material/Container";
import Grid from "@mui/material/Grid";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Stack from "@mui/material/Stack";
import Button from "@mui/material/Button";
import Box from "@mui/material/Box";

const tldr = [
  "Demand is stochastic: daily volume, hourly arrivals, service mix, no-shows, repeat scans, and unexpected leaves are all sampled probabilistically.",
  "Resources are constrained: support staff, explicit compatible rooms, gender-aware changing rooms, technicians, radiologists, and machines all have finite hourly capacity.",
  "Patient flow is stage-based: registration, prep, exam, reporting, and result communication are scheduled in order.",
  "Service times are stochastic per patient: configured minutes are treated as average durations, not fixed durations every time.",
  "Revenue only counts if the patient is completed in time: exams must finish the same day, and results must be available within 24 hours of arrival.",
  "Seeds make runs reproducible: same scenario and same seed gives the same result, while a new seed gives a fresh stochastic run."
];

const detailedRules = [
  {
    title: "Demand generation",
    rules: [
      "Base daily patients are scaled by the configured day-of-week multiplier, then sampled from a Poisson distribution.",
      "Hourly demand uses the configured hourly distribution as weights, not fixed counts.",
      "Service mix is also weight-based and sampled per patient.",
      "Optional outpatient appointments create a scheduled arrival stream that competes with inpatient and urgent walk-ins."
    ]
  },
  {
    title: "Patient variability",
    rules: [
      "Each patient is probabilistically assigned as inpatient or outpatient.",
      "Urgent cases are sampled using the configured urgent fraction.",
      "Outpatient no-shows are removed before they enter the department.",
      "Repeat scans can create an additional later demand event.",
      "Unexpected leaves can remove patients after intake and are tracked as lost revenue."
    ]
  },
  {
    title: "Operating hours and staffing",
    rules: [
      "Operating hours are applied by day of week, and capacity is zero outside those windows.",
      "Staff rotation defines how many technicians, support staff, and radiologists are on shift by hour.",
      "Machine downtime is modeled as seeded outage blocks during open hours rather than a flat capacity haircut.",
      "Radiologists can keep reporting after scan hours if their hourly staffing coverage is configured outside department operating hours."
    ]
  },
  {
    title: "Workflow stages",
    rules: [
      "Support staff acknowledge and route the patient at registration.",
      "Prep happens next and consumes support staff time.",
      "Changing-room use is configured by modality and then routed to male, female, or unisex changing rooms based on patient gender.",
      "Portable X-Ray does not require a procedure room; other modalities must route through compatible room definitions.",
      "The exam consumes a compatible room when required, one technician, and a machine resource.",
      "Radiologists produce reports after exams are complete.",
      "Support staff then spend time communicating results."
    ]
  },
  {
    title: "Modality-specific behavior",
    rules: [
      "Reporting time is configurable per modality.",
      "Portable X-Ray requests require portable units.",
      "Standard X-Ray requests can use either standard X-Ray or portable X-Ray machines.",
      "Portable X-Ray can therefore act as fallback capacity for standard X-Ray demand."
    ]
  },
  {
    title: "Queueing and prioritization",
    rules: [
      "Urgent patients are prioritized ahead of non-urgent patients.",
      "Inpatients are prioritized ahead of routine outpatients.",
      "Priority affects prep, exam, and reporting queues.",
      "Patience windows are sampled per patient and vary by urgency, patient type, modality, and disruption level."
    ]
  },
  {
    title: "Loss rules",
    rules: [
      "Patients begin accumulating abandonment risk after 15 minutes of waiting.",
      "No patient can wait more than 2 hours for the exam to begin.",
      "If an exam cannot finish before the end of the arrival day, its revenue is lost.",
      "If results are not available within 24 hours of arrival, revenue is lost."
    ]
  },
  {
    title: "Revenue and outputs",
    rules: [
      "Possible revenue is based on total simulated demand volume.",
      "Maximum revenue is a machine-capacity ceiling based on exam plus cleanup cycle times.",
      "Actual revenue counts only completed studies with results delivered on time.",
      "The app reports lost revenue, wait percentiles, result-time percentiles, utilization, throughput, and daily snapshots."
    ]
  }
];

export default function HowItWorksPage() {
  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Grid container spacing={4} sx={{ mb: 4 }}>
        <Grid size={{ xs: 12, md: 7 }}>
          <Card elevation={0} variant="outlined" sx={{ p: 4, height: '100%' }}>
            <Typography variant="overline" color="secondary" gutterBottom>How It Works</Typography>
            <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2.5rem', md: '3.5rem' } }}>
              How the simulator turns a scenario into wait times, results lag, and revenue.
            </Typography>
            <Typography variant="body1" color="text.secondary" paragraph>
              This page describes the current simulation rules as they exist in the app today. It is intended as a practical
              guide for setting scenarios and interpreting results.
            </Typography>
            <Stack direction="row" spacing={2} sx={{ mt: 3 }}>
              <Button component={Link} href="/" variant="outlined" size="large">
                Back to home
              </Button>
              <Button component={Link} href="/scenarios/new" variant="contained" size="large">
                Create scenario
              </Button>
            </Stack>
          </Card>
        </Grid>
        <Grid size={{ xs: 12, md: 5 }}>
          <Card elevation={0} variant="outlined" sx={{ p: 4, height: '100%', bgcolor: 'background.default' }}>
            <Typography variant="overline" color="secondary" gutterBottom>TL;DR</Typography>
            <Stack spacing={2} mt={2}>
              {tldr.map((item, index) => (
                <Card key={index} elevation={0} variant="outlined" sx={{ p: 2 }}>
                  <Typography variant="body2" color="text.primary">
                    {item}
                  </Typography>
                </Card>
              ))}
            </Stack>
          </Card>
        </Grid>
      </Grid>

      <Card elevation={0} variant="outlined" sx={{ p: 4, bgcolor: 'background.default' }}>
        <Box mb={4}>
          <Typography variant="overline" color="secondary" gutterBottom>Detailed Rules</Typography>
          <Typography variant="h2" gutterBottom>Rule-by-rule description</Typography>
          <Typography variant="body1" color="text.secondary">
            These are the current operational rules used by the simulation engine.
          </Typography>
        </Box>
        <Stack spacing={3}>
          {detailedRules.map((section) => (
            <Card key={section.title} elevation={0} variant="outlined" sx={{ p: 3, bgcolor: 'background.paper' }}>
              <Typography variant="h3" gutterBottom>{section.title}</Typography>
              <Stack spacing={1}>
                {section.rules.map((rule, idx) => (
                  <Typography key={idx} variant="body2" color="text.secondary">
                    • {rule}
                  </Typography>
                ))}
              </Stack>
            </Card>
          ))}
        </Stack>
      </Card>
    </Container>
  );
}
