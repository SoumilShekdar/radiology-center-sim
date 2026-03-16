import Link from "next/link";
import { ScenarioEditor } from "@/components/scenario-editor";
import { duplicateScenarioAction } from "@/lib/actions";
import { getScenario } from "@/lib/scenario-store";

export default async function ScenarioAdvancedPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const scenario = await getScenario(id);

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-card">
          <div className="eyebrow">Advanced Options</div>
          <h1>{scenario.name}</h1>
          <p>Detailed operating assumptions for hours, staffing coverage, demand behavior, modality mix, and service timings.</p>
          <div className="button-row">
            <Link className="secondary-button" href={`/scenarios/${scenario.id}`}>
              Back to Basic Options
            </Link>
            <form className="inline-form" action={duplicateScenarioAction}>
              <input type="hidden" name="scenarioId" value={scenario.id} />
              <button className="secondary-button" type="submit">
                Duplicate scenario
              </button>
            </form>
          </div>
        </div>
      </section>
      <ScenarioEditor initialScenario={scenario} mode="edit" viewMode="advanced" />
    </main>
  );
}
