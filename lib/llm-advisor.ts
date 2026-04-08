import type { CandidateResult } from "@/lib/optimizer";
import type { ScenarioInput, SimulationSummary } from "@/lib/types";

type AdvisorInput = {
  scenarioName: string;
  currency: string;
  constraint: { maxWaitMinutes: number };
  baseline: SimulationSummary;
  topCandidates: CandidateResult[];
  baseline_config: ScenarioInput["resourceConfig"];
};

export type OptimizerAdvice = {
  narrative: string;
  keyActions: string[];
  model: string;
};

function buildPrompt(input: AdvisorInput): string {
  const fmt = (n: number) => `${input.currency} ${Math.round(n).toLocaleString()}`;
  const fmtMin = (n: number) => `${Math.round(n)} min`;

  const baselineSection = `
BASELINE SCENARIO: "${input.scenarioName}"
- Net Profit: ${fmt(input.baseline.totalProfit ?? 0)}
- Revenue: ${fmt(input.baseline.actualRevenue)}
- P90 Wait Time: ${fmtMin(input.baseline.p90WaitMinutes)}
- Completed Patients: ${Math.round(input.baseline.completedPatients)}
- Machine Util: ${Math.round(input.baseline.machineUtilization)}%
- Radiologist Util: ${Math.round(input.baseline.radiologistUtilization)}%
- Constraint: P90 Wait ≤ ${fmtMin(input.constraint.maxWaitMinutes)}
`.trim();

  const candidateSection = input.topCandidates.slice(0, 3).map((c, i) => {
    const profitDiff = (c.summary.totalProfit ?? 0) - (input.baseline.totalProfit ?? 0);
    const waitDiff = c.summary.p90WaitMinutes - input.baseline.p90WaitMinutes;
    const changes = getChangeSummary(input.baseline_config, c.resourceConfig);

    return `
CANDIDATE ${i + 1} ${c.feasible ? "(FEASIBLE ✓)" : "(VIOLATES WAIT CONSTRAINT ✗)"}
Changes from baseline: ${changes}
- Net Profit: ${fmt(c.summary.totalProfit ?? 0)} (${profitDiff >= 0 ? "+" : ""}${fmt(profitDiff)})
- P90 Wait: ${fmtMin(c.summary.p90WaitMinutes)} (${waitDiff >= 0 ? "+" : ""}${fmtMin(waitDiff)})
- Revenue: ${fmt(c.summary.actualRevenue)}
- Patients: ${Math.round(c.summary.completedPatients)}
- Machine Util: ${Math.round(c.summary.machineUtilization)}%
`.trim();
  }).join("\n\n");

  return `You are a radiology operations consultant advising a hospital department manager. Based on the simulation data below, write practical, confident recommendations.

${baselineSection}

${candidateSection}

Your task:
1. Write a 2-3 sentence executive summary explaining the key opportunity.
2. List 3-5 specific, actionable recommendations (one per line, start each with "→").
3. Reference actual numbers (profit, wait times, patient counts) not just percentages.
4. Be direct and operational — avoid generic advice.
5. If no feasible candidate improves on the baseline, say so and explain why the baseline may already be near-optimal.

Format your response exactly as:
SUMMARY: [2-3 sentence executive summary]
ACTIONS:
→ [action 1]
→ [action 2]
→ [action 3]`;
}

function getChangeSummary(baseline: ScenarioInput["resourceConfig"], candidate: ScenarioInput["resourceConfig"]): string {
  const parts: string[] = [];
  const keys: Array<[keyof typeof baseline, string]> = [
    ["xRayMachines", "X-Ray"], ["ctMachines", "CT"], ["mriMachines", "MRI"],
    ["portableXRayMachines", "Portable X-Ray"], ["ultrasoundMachines", "Ultrasound"],
    ["technicians", "Techs"], ["radiologists", "Rads"], ["supportStaff", "Support"],
  ];
  for (const [key, label] of keys) {
    const diff = (candidate[key] as number) - (baseline[key] as number);
    if (diff !== 0) parts.push(`${diff > 0 ? "+" : ""}${diff} ${label}`);
  }
  return parts.length > 0 ? parts.join(", ") : "No change";
}

function parseResponse(text: string): { narrative: string; keyActions: string[] } {
  const summaryMatch = text.match(/SUMMARY:\s*(.+?)(?=ACTIONS:|$)/s);
  const actionsMatch = text.match(/ACTIONS:\s*([\s\S]+)/);

  const narrative = summaryMatch?.[1]?.trim() ?? text.trim();
  const actionsText = actionsMatch?.[1]?.trim() ?? "";
  const keyActions = actionsText
    .split("\n")
    .map((line) => line.replace(/^→\s*/, "").trim())
    .filter((line) => line.length > 0);

  return { narrative, keyActions };
}

/** Call Gemini API via native fetch — no SDK dependency */
async function callGemini(prompt: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set in environment.");

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  };

  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

/** Call OpenAI API via native fetch — fallback if Gemini fails */
async function callOpenAI(prompt: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not set in environment.");

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: 1024,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${err}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  return data.choices?.[0]?.message?.content ?? "";
}

export async function getOptimizerAdvice(input: AdvisorInput): Promise<OptimizerAdvice> {
  const prompt = buildPrompt(input);

  // Try Gemini first, fall back to OpenAI, then hard fallback
  try {
    const text = await callGemini(prompt);
    const { narrative, keyActions } = parseResponse(text);
    return { narrative, keyActions, model: "gemini-2.5-flash" };
  } catch {
    try {
      const text = await callOpenAI(prompt);
      const { narrative, keyActions } = parseResponse(text);
      return { narrative, keyActions, model: "gpt-5.4-mini" };
    } catch (error) {
      // Graceful fallback: return a structured message without LLM
      const best = input.topCandidates.find((c) => c.feasible) ?? input.topCandidates[0];
      const profitDiff = best ? (best.summary.totalProfit ?? 0) - (input.baseline.totalProfit ?? 0) : 0;

      return {
        narrative: `The optimizer explored 220 configurations for "${input.scenarioName}". ${best?.feasible
            ? `The best feasible configuration improves net profit by ${Math.round(profitDiff).toLocaleString()} ${input.currency} while keeping P90 wait below ${input.constraint.maxWaitMinutes} minutes.`
            : "No configuration found that meets the wait time constraint while improving profit. Consider relaxing the wait threshold."
          } LLM advisory unavailable: ${error instanceof Error ? error.message : "unknown error"}.`,
        keyActions: best
          ? [getChangeSummary(input.baseline_config, best.resourceConfig)]
          : ["Review constraint settings and try a higher wait threshold."],
        model: "fallback",
      };
    }
  }
}

export async function getBottleneckAdvice(input: {
  scenarioName: string;
  bottleneck: string;
  currency: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  summary: any;
}): Promise<string> {
  const lostRevenue = input.summary.lostRevenue || 0;
  const fmtLostRevenue = `${input.currency} ${Math.round(lostRevenue).toLocaleString()}`;
  
  const prompt = `You are a radiology department operations consultant advising a manager.
Based on the simulation results for "${input.scenarioName}", the primary constraining bottleneck is: ${input.bottleneck}.

Current performance:
- Wait Time P90: ${Math.round(input.summary.p90WaitMinutes)} minutes
- Machine Utilization: ${Math.round(input.summary.machineUtilization)}%
- Staff Utilization (Techs / Rads): ${Math.round(input.summary.technicianUtilization)}% / ${Math.round(input.summary.radiologistUtilization)}%
- Total Lost Revenue: ${fmtLostRevenue}

Provide a 1-2 sentence recommendation on what the manager should do to alleviate the ${input.bottleneck} bottleneck.
Format your recommendation exactly like this: "Your bottleneck is [Bottleneck]. Recommendation: [Actionable advice]. This could recapture a portion of the ${fmtLostRevenue} lost revenue."
Be direct, actionable, and focus purely on operational adjustments like staffing, hours, or capital equipment.
Do not use conversational filler, just provide the advice directly.`;

  try {
    return await callGemini(prompt);
  } catch {
    try {
      return await callOpenAI(prompt);
    } catch {
      return `Your bottleneck is ${input.bottleneck}. Recommendation: Extend operating hours or add more staff/machines to handle the load. This could recapture a portion of the ${fmtLostRevenue} lost revenue.`;
    }
  }
}
