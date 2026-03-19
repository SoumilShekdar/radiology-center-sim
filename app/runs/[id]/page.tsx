import Link from "next/link";
import { RunStatusPoller } from "@/components/run-status-poller";
import { SimpleLineChart } from "@/components/simple-chart";
import { MODALITY_LABELS } from "@/lib/constants";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";

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

  const summary = (run.summary ?? {}) as {
    mode?: "SINGLE" | "MONTE_CARLO";
    seed: number;
    possibleRevenue: number;
    maximumRevenue: number;
    actualRevenue: number;
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
    const waitFallback =
      modalitySnapshots.length === 0 ? 0 : modalitySnapshots.reduce((sum, snapshot) => sum + snapshot.averageWaitMinutes, 0) / modalitySnapshots.length;
    const machineUtilFallback =
      modalitySnapshots.length === 0 ? 0 : modalitySnapshots.reduce((sum, snapshot) => sum + snapshot.machineUtilization, 0) / modalitySnapshots.length;

    return {
      modality,
      label,
      throughput: throughputMetric?.metricValue ?? throughputFallback,
      revenue: revenueMetric?.metricValue ?? revenueFallback,
      averageWaitMinutes: avgWaitMetric?.metricValue ?? waitFallback,
      machineUtilization: machineUtilMetric?.metricValue ?? machineUtilFallback
    };
  });

  if (isPending || isFailed) {
    return (
      <main className="page-shell">
        <RunStatusPoller active={isPending} />
        <section className="hero">
          <div className="hero-card">
            <div className="eyebrow">Simulation run</div>
            <h1>{run.scenario.name}</h1>
            <p>
              {run.status === "QUEUED"
                ? "The simulation is queued and will start shortly."
                : run.status === "RUNNING"
                  ? "The simulation is running in the background. You can leave this page and come back later."
                  : summary.error ?? "The simulation failed before completing."}
            </p>
            <div className="button-row">
              <Link className="secondary-button" href={`/scenarios/${run.scenarioId}`}>
                Back to scenario
              </Link>
              <Link className="secondary-button" href="/">
                Home
              </Link>
            </div>
          </div>
          <div className="panel stack">
            <div className="eyebrow">Status</div>
            <div className="metric-card">
              <div className="metric-value">{run.status}</div>
              <div className="muted">{isPending ? "This page refreshes automatically while the job is active." : "Open the scenario and try again if needed."}</div>
            </div>
          </div>
        </section>

        <section className="metric-grid">
          <div className="metric-card">
            <div className="eyebrow">Run type</div>
            <div className="metric-value">{summary.mode === "MONTE_CARLO" ? "Monte Carlo" : "Single run"}</div>
            <div className="muted">Horizon {run.horizonDays === 1 ? "1 day" : `${run.horizonDays} days`}</div>
          </div>
          <div className="metric-card">
            <div className="eyebrow">Seed</div>
            <div className="metric-value">{run.seed}</div>
            <div className="muted">{summary.mode === "MONTE_CARLO" ? `Iterations ${summary.iterations ?? "pending"}` : "Reproducible run seed"}</div>
          </div>
          <div className="metric-card">
            <div className="eyebrow">Started</div>
            <div className="metric-value">{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(run.startedAt)}</div>
            <div className="muted">Safe to navigate away while processing continues.</div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">Simulation result</div>
          <h1>{run.scenario.name}</h1>
          <p>
            {summary.mode === "MONTE_CARLO" ? "Monte Carlo" : "Simulation"} • Horizon {run.horizonDays === 1 ? "1 day" : `${run.horizonDays} days`} • Seed {run.seed} • Completed{" "}
            {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(run.completedAt ?? run.startedAt)}
          </p>
          <div className="button-row">
            <Link className="secondary-button" href={`/scenarios/${run.scenarioId}`}>
              Back to scenario
            </Link>
            <Link className="secondary-button" href="/">
              Home
            </Link>
          </div>
        </div>
        <div className="panel stack">
          <div className="eyebrow">Bottleneck signal</div>
          <div className="metric-card">
            <div className="metric-value">{summary.bottleneck}</div>
            <div className="muted">Most common delaying or blocking resource observed in the run.</div>
          </div>
        </div>
      </section>

      {summary.mode === "MONTE_CARLO" ? (
        <section className="metric-grid">
          <div className="metric-card">
            <div className="eyebrow">Iterations</div>
            <div className="metric-value">{summary.iterations ?? 0}</div>
            <div className="muted">Seeds {summary.seedStart} to {summary.seedEnd}</div>
          </div>
          <div className="metric-card">
            <div className="eyebrow">Actual Revenue Band</div>
            <div className="metric-value">{formatCurrency(summary.p50ActualRevenue ?? summary.actualRevenue, currency)}</div>
            <div className="muted">P10 {formatCurrency(summary.p10ActualRevenue ?? 0, currency)} • P90 {formatCurrency(summary.p90ActualRevenue ?? 0, currency)}</div>
          </div>
          <div className="metric-card">
            <div className="eyebrow">P90 Wait Band</div>
            <div className="metric-value">{formatMinutes(summary.p50P90WaitMinutes ?? summary.p90WaitMinutes)}</div>
            <div className="muted">P10 {formatMinutes(summary.p10P90WaitMinutes ?? 0)} • P90 {formatMinutes(summary.p90P90WaitMinutes ?? 0)}</div>
          </div>
          <div className="metric-card">
            <div className="eyebrow">Completed Patients Band</div>
            <div className="metric-value">{Math.round(summary.p50CompletedPatients ?? summary.completedPatients)}</div>
            <div className="muted">P10 {Math.round(summary.p10CompletedPatients ?? 0)} • P90 {Math.round(summary.p90CompletedPatients ?? 0)}</div>
          </div>
        </section>
      ) : null}

      <section className="metric-grid">
        <div className="metric-card">
          <div className="eyebrow">Run Seed</div>
          <div className="metric-value">{summary.mode === "MONTE_CARLO" ? `${summary.seedStart}-${summary.seedEnd}` : run.seed}</div>
          <div className="muted">{summary.mode === "MONTE_CARLO" ? "Seed range used for the sensitivity run." : "Reuse this seed to reproduce the same stochastic run."}</div>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Possible Revenue</div>
          <div className="metric-value">{formatCurrency(summary.possibleRevenue, currency)}</div>
          <div className="muted">Demand-based revenue if every patient is retained</div>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Maximum Revenue</div>
          <div className="metric-value">{formatCurrency(summary.maximumRevenue, currency)}</div>
          <div className="muted">Machine-only ceiling at full utilization</div>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Actual Revenue</div>
          <div className="metric-value">{formatCurrency(summary.actualRevenue, currency)}</div>
          <div className="muted">Completed patients {summary.completedPatients}</div>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Lost Revenue</div>
          <div className="metric-value">{formatCurrency(summary.lostRevenue, currency)}</div>
          <div className="muted">Possible minus actual</div>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Wait to Perform Service</div>
          <div className="metric-value">{formatMinutes(summary.p50WaitMinutes)}</div>
          <div className="muted">P90 {formatMinutes(summary.p90WaitMinutes)}</div>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Time to Result</div>
          <div className="metric-value">{formatMinutes(summary.p50ResultMinutes)}</div>
          <div className="muted">P90 {formatMinutes(summary.p90ResultMinutes)}</div>
        </div>
      </section>

      <section className="grid-2" style={{ marginTop: 18 }}>
        <div className="table-card">
          <h3>Model assumptions</h3>
          <div className="stack">
            <div className="muted">Rooms are explicit compatibility-controlled resources, not a pooled room count.</div>
            <div className="muted">Portable X-Ray is modeled as a bedside workflow and does not require a room.</div>
            <div className="muted">Changing-room use is modality-driven, with male, female, and unisex room pools.</div>
            <div className="muted">Outpatient appointments: {run.scenario.appointmentPolicy && typeof run.scenario.appointmentPolicy === "object" && "enabled" in run.scenario.appointmentPolicy && run.scenario.appointmentPolicy.enabled ? "On" : "Off"}.</div>
            <div className="muted">Service durations are sampled stochastically around configured average times.</div>
          </div>
        </div>
        <div className="table-card">
          <h3>Workflow summary</h3>
          <div className="stack">
            <div className="muted">Configured rooms: {run.scenario.resourceConfig?.rooms ?? 0}</div>
            <div className="muted">Configured changing rooms: {run.scenario.resourceConfig?.changingRooms ?? 0}</div>
            <div className="muted">Portable X-Ray machines: {run.scenario.resourceConfig?.portableXRayMachines ?? 0}</div>
            <div className="muted">Radiologists can report outside scan hours if their shift coverage is present.</div>
          </div>
        </div>
      </section>

      <section className="metric-grid" style={{ marginTop: 18 }}>
        <div className="metric-card">
          <div className="eyebrow">Lost due to wait</div>
          <div className="metric-value">{formatCurrency(summary.lostRevenueDueToWait, currency)}</div>
          <div className="muted">Patient abandonment window or missed same-day exam completion</div>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Lost due to results</div>
          <div className="metric-value">{formatCurrency(summary.lostRevenueDueToResult, currency)}</div>
          <div className="muted">Results not available within 24 hours of arrival</div>
        </div>
        <div className="metric-card">
          <div className="eyebrow">Utilization snapshot</div>
          <div className="metric-value">{formatPercent(summary.machineUtilization)}</div>
          <div className="muted">
            Tech {formatPercent(summary.technicianUtilization)} • Rad {formatPercent(summary.radiologistUtilization)}
          </div>
        </div>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 18 }}>
        <SimpleLineChart
          title="Daily revenue"
          valueFormatter={(value) => formatCurrency(value, currency)}
          points={allSnapshots.map((snapshot) => ({
            label: `D${snapshot.dayIndex + 1}`,
            value: snapshot.revenue
          }))}
        />
        <SimpleLineChart
          title="Daily average wait to perform service"
          color="#356c5c"
          valueFormatter={(value) => `${Math.round(value)}m`}
          points={allSnapshots.map((snapshot) => ({
            label: `D${snapshot.dayIndex + 1}`,
            value: snapshot.averageWaitMinutes
          }))}
        />
      </section>

      <section className="grid-2" style={{ marginTop: 18 }}>
        <div className="table-card">
          <h3>Modality performance</h3>
          <table>
            <thead>
              <tr>
                <th>Modality</th>
                <th>Throughput</th>
                <th>Revenue</th>
                <th>Avg wait</th>
                <th>Machine util.</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(MODALITY_LABELS).map(([modality, label]) => {
                const row = modalityRows.find((item) => item.modality === modality);
                return (
                  <tr key={modality}>
                    <td>{label}</td>
                    <td>{Math.round(row?.throughput ?? 0)}</td>
                    <td>{formatCurrency(row?.revenue ?? 0, currency)}</td>
                    <td>{formatMinutes(row?.averageWaitMinutes ?? 0)}</td>
                    <td>{formatPercent(row?.machineUtilization ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="table-card">
          <h3>Daily snapshots</h3>
          <table>
            <thead>
              <tr>
                <th>Day</th>
                <th>Completed</th>
                <th>Deferred</th>
                <th>Revenue</th>
                <th>P90 wait</th>
              </tr>
            </thead>
            <tbody>
              {allSnapshots.slice(0, 16).map((snapshot) => (
                <tr key={`${snapshot.dayIndex}-${snapshot.modality}`}>
                  <td>{snapshot.dayIndex + 1}</td>
                  <td>{snapshot.completedPatients}</td>
                  <td>{snapshot.deferredPatients}</td>
                  <td>{formatCurrency(snapshot.revenue, currency)}</td>
                  <td>{formatMinutes(snapshot.p90WaitMinutes)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
