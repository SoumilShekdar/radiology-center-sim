import Link from "next/link";
import { ScenarioEditor } from "@/components/scenario-editor";
import { duplicateScenarioAction } from "@/lib/actions";
import { formatCurrency } from "@/lib/currency";
import { getScenario, listRunsForScenario } from "@/lib/scenario-store";

export default async function ScenarioDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = await getScenario(id);
  const runs = await listRunsForScenario(id);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">Basic Options</div>
          <h1>{scenario.name}</h1>
          <p>{scenario.description}</p>
          <div className="button-row">
            <Link className="secondary-button" href="/">
              Back to home
            </Link>
            <form className="inline-form" action={duplicateScenarioAction}>
              <input type="hidden" name="scenarioId" value={scenario.id} />
              <button className="secondary-button" type="submit">
                Duplicate scenario
              </button>
            </form>
          </div>
        </div>
        <div className="panel stack">
          <div className="eyebrow">Saved runs</div>
          {runs.length === 0 ? (
            <div className="empty-state">No runs yet for this scenario.</div>
          ) : (
            runs.slice(0, 6).map((run) => {
              const summary = run.summary as { actualRevenue?: number; p90WaitMinutes?: number; lostRevenue?: number } | null;
              return (
                <Link href={`/runs/${run.id}`} key={run.id} className="scenario-card stack">
                  <strong>{run.horizonDays === 1 ? "1 day" : `${run.horizonDays} day`} run</strong>
                  <div className="muted">
                    {run.status === "COMPLETED"
                      ? `Seed ${run.seed} • P90 wait ${Math.round(summary?.p90WaitMinutes ?? 0)} min`
                      : `${run.status} • Seed ${run.seed}`}
                  </div>
                  <div className="tag">
                    {run.status === "COMPLETED"
                      ? `Actual ${formatCurrency(summary?.actualRevenue ?? 0, scenario.currency)} • Lost ${formatCurrency(summary?.lostRevenue ?? 0, scenario.currency)}`
                      : "Open run status"}
                  </div>
                </Link>
              );
            })
          )}
        </div>
      </section>
      <ScenarioEditor initialScenario={scenario} mode="edit" viewMode="basic" />
    </main>
  );
}
