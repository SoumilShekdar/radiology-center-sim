import { ScenarioEditor } from "@/components/scenario-editor";
import { DEFAULT_SCENARIO } from "@/lib/sample-scenarios";

export default function NewScenarioPage() {
  return (
    <main className="page-shell">
      <section className="hero-card">
        <div className="eyebrow">Basic Options</div>
        <h1 style={{ margin: 0, fontSize: "3rem", maxWidth: "16ch" }}>Create a radiology simulator scenario.</h1>
      </section>
      <ScenarioEditor initialScenario={DEFAULT_SCENARIO} mode="create" viewMode="basic" />
    </main>
  );
}
