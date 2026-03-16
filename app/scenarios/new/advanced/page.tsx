import { ScenarioEditor } from "@/components/scenario-editor";
import { DEFAULT_SCENARIO } from "@/lib/sample-scenarios";

export default function NewScenarioAdvancedPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="eyebrow">Advanced Options</div>
        <h1 style={{ margin: 0, fontSize: "3rem", maxWidth: "16ch" }}>Configure advanced radiology assumptions.</h1>
      </section>
      <ScenarioEditor initialScenario={DEFAULT_SCENARIO} mode="create" viewMode="advanced" />
    </main>
  );
}
