import Link from "next/link";
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
      scenario: true,
      metrics: true,
      snapshots: {
        orderBy: [{ dayIndex: "asc" }, { modality: "asc" }]
      }
    }
  });

  const summary = run.summary as {
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
  };

  const allSnapshots = run.snapshots.filter((snapshot) => snapshot.modality === "ALL");
  const modalityMetrics = run.metrics.filter((metric) => metric.modality !== "ALL");
  const currency = run.scenario.currency;

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">Simulation result</div>
          <h1>{run.scenario.name}</h1>
          <p>
            Horizon {run.horizonDays === 1 ? "1 day" : `${run.horizonDays} days`} • Seed {run.seed} • Completed{" "}
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
            <div className="muted">Most common limiting resource inferred from the run.</div>
          </div>
        </div>
      </section>

      <section className="metric-grid">
        <div className="metric-card">
          <div className="eyebrow">Run Seed</div>
          <div className="metric-value">{run.seed}</div>
          <div className="muted">Reuse this seed to reproduce the same stochastic run.</div>
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

      <section className="metric-grid" style={{ marginTop: 18 }}>
        <div className="metric-card">
          <div className="eyebrow">Lost due to wait</div>
          <div className="metric-value">{formatCurrency(summary.lostRevenueDueToWait, currency)}</div>
          <div className="muted">Abandonment, 2-hour wait cap, or missed same-day completion</div>
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
                const throughput = modalityMetrics.find((metric) => metric.modality === modality && metric.metricName === "throughput");
                const revenue = modalityMetrics.find((metric) => metric.modality === modality && metric.metricName === "revenue");
                const avgWait = modalityMetrics.find((metric) => metric.modality === modality && metric.metricName === "averageWaitMinutes");
                const machineUtil = modalityMetrics.find((metric) => metric.modality === modality && metric.metricName === "machineUtilization");

                return (
                  <tr key={modality}>
                    <td>{label}</td>
                    <td>{Math.round(throughput?.metricValue ?? 0)}</td>
                    <td>{formatCurrency(revenue?.metricValue ?? 0, currency)}</td>
                    <td>{formatMinutes(avgWait?.metricValue ?? 0)}</td>
                    <td>{formatPercent(machineUtil?.metricValue ?? 0)}</td>
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
