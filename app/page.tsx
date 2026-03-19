import type { Prisma } from "@prisma/client";
import Link from "next/link";
import { createDefaultScenarioAction, seedSampleScenariosAction } from "@/lib/actions";
import { formatCurrency } from "@/lib/currency";
import { prisma } from "@/lib/prisma";
import { listScenarioSummaries } from "@/lib/scenario-store";
import { ActionButton } from "@/components/action-button";

export const dynamic = "force-dynamic";

type HomeRun = Prisma.SimulationRunGetPayload<{
  include: {
    scenario: true;
  };
}>;

export default async function HomePage() {
  let scenarios: Awaited<ReturnType<typeof listScenarioSummaries>> = [];
  let recentRuns: HomeRun[] = [];
  let databaseSetupNeeded = false;

  try {
    scenarios = await listScenarioSummaries();
    recentRuns = await prisma.simulationRun.findMany({
      orderBy: { startedAt: "desc" },
      take: 8,
      include: { scenario: true }
    });
  } catch {
    databaseSetupNeeded = true;
  }

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">Radiology Ops Lab</div>
          <h1>Model capacity, queues, and reporting lag.</h1>
          <p>
            Build scenarios for staffing and machine mix, then simulate radiology demand over a day, week, month, or year.
            Saved runs keep a reusable history of throughput, waits, utilization, and revenue.
          </p>
          <div className="button-row">
            <Link className="button" href="/scenarios/new">
              Create scenario
            </Link>
            <Link className="secondary-button" href="/how-it-works">
              How it works
            </Link>
            <ActionButton 
              className="secondary-button" 
              action={seedSampleScenariosAction}
              loadingText="Seeding..."
              successText="Sample scenarios seeded."
            >
              Seed sample scenarios
            </ActionButton>
            <ActionButton 
              className="secondary-button" 
              action={createDefaultScenarioAction}
              loadingText="Adding..."
              successText="Starter scenario added."
            >
              Add starter scenario
            </ActionButton>
          </div>
        </div>
        <div className="panel stack">
          <div>
            <div className="eyebrow">What this captures</div>
            <p className="muted">
              Machines, rooms, changing rooms, technicians, support staff, radiologists, reporting delays, patient mix,
              time-of-day arrivals, service distribution, downtime, and shift coverage.
            </p>
          </div>
          {databaseSetupNeeded ? (
            <div className="empty-state">
              Database setup is still needed. Add `DATABASE_URL`, run the Prisma migration, and then the simulator will be ready to save scenarios and runs.
            </div>
          ) : null}
          <div className="metric-grid">
            <div className="metric-card">
              <div className="eyebrow">Scenarios</div>
              <div className="metric-value">{scenarios.length}</div>
              <div className="muted">Reusable staffing and capacity models</div>
            </div>
            <div className="metric-card">
              <div className="eyebrow">Saved runs</div>
              <div className="metric-value">{recentRuns.length}</div>
              <div className="muted">Latest simulation results at hand</div>
            </div>
            <div className="metric-card">
              <div className="eyebrow">Horizons</div>
              <div className="metric-value">4</div>
              <div className="muted">Day, week, month, and year</div>
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-grid">
        <div className="panel stack">
          <div>
            <div className="eyebrow">Scenarios</div>
            <h2 className="section-title">Saved planning scenarios</h2>
          </div>
          {scenarios.length === 0 ? (
            <div className="empty-state">
              No scenarios yet. Seed the sample set or create a custom radiology department to get started.
            </div>
          ) : (
            <div className="grid-2">
              {scenarios.map((scenario) => (
                <Link className="scenario-card stack" href={`/scenarios/${scenario.id}`} key={scenario.id}>
                  <div className="eyebrow">Updated {new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(scenario.updatedAt)}</div>
                  <h3>{scenario.name}</h3>
                  <p className="muted">{scenario.description}</p>
                  <div className="tag">Seed {scenario.seedDefault}</div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="panel stack">
          <div>
            <div className="eyebrow">Run history</div>
            <h2 className="section-title">Recent simulations</h2>
          </div>
          {recentRuns.length === 0 ? (
            <div className="empty-state">Run a scenario to see results history here.</div>
          ) : (
            recentRuns.map((run) => {
              const summary = run.summary as { actualRevenue?: number; lostRevenue?: number; p90WaitMinutes?: number; bottleneck?: string } | null;
              return (
                <Link className="scenario-card stack" href={`/runs/${run.id}`} key={run.id}>
                  <div className="eyebrow">{run.scenario.name}</div>
                  <strong>{run.horizonDays === 1 ? "1 day" : `${run.horizonDays} day`} simulation</strong>
                  <div className="muted">
                    {run.status === "COMPLETED"
                      ? `P90 wait ${Math.round(summary?.p90WaitMinutes ?? 0)} min • Actual ${formatCurrency(summary?.actualRevenue ?? 0, run.scenario.currency)}`
                      : `${run.status} • Seed ${run.seed}`}
                  </div>
                  <div className="tag">
                    {run.status === "COMPLETED"
                      ? `Lost ${formatCurrency(summary?.lostRevenue ?? 0, run.scenario.currency)} • ${summary?.bottleneck ?? "n/a"}`
                      : "Open run status"}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
    </main>
  );
}
