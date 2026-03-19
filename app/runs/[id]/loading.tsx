import Container from "@mui/material/Container";
import Typography from "@mui/material/Typography";
import Card from "@mui/material/Card";
import Box from "@mui/material/Box";
import Skeleton from "@mui/material/Skeleton";
import LinearProgress from "@mui/material/LinearProgress";
import Grid from "@mui/material/Grid";

export default function RunLoading() {
  return (
    <Container maxWidth="lg" sx={{ py: 6 }}>
      <Card elevation={0} variant="outlined" sx={{ p: 4, mb: 4, bgcolor: 'background.paper' }}>
        <Typography variant="overline" color="secondary" gutterBottom>Loading run</Typography>
        <Typography variant="h1" gutterBottom sx={{ fontSize: { xs: '2.5rem', md: '3rem' } }}>
          Preparing simulation results...
        </Typography>
        <Typography variant="body1" color="text.secondary" paragraph>
          This usually takes a moment while the run record and snapshots load.
        </Typography>
        <Box sx={{ width: '100%', mt: 3 }}>
          <LinearProgress />
        </Box>
      </Card>

      <Grid container spacing={4} sx={{ mt: 2 }}>
        {[1, 2, 3].map((i) => (
          <Grid size={{ xs: 12, md: 4 }} key={i}>
            <Card elevation={0} variant="outlined" sx={{ p: 3 }}>
              <Typography variant="overline" color="secondary">Metric {i}</Typography>
              <Skeleton variant="text" sx={{ fontSize: '3rem', width: '60%' }} />
              <Skeleton variant="text" sx={{ width: '40%' }} />
            </Card>
          </Grid>
        ))}
      </Grid>
    </Container>
  );
}
