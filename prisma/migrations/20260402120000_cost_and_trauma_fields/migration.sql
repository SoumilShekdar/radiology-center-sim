-- AddCostAndTraumaFields
-- Adds staffing cost fields, machine lease cost model, per-modality daily lease costs
-- to ScenarioResourceConfig, consumable cost to ScenarioServiceConfig,
-- trauma spike parameters to ScenarioDemandProfile, and profitability metrics to
-- SimulationRunDailySnapshot.

ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "technicianSalaryDaily" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "radiologistSalaryDaily" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "supportStaffSalaryDaily" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "machineCostModel" TEXT NOT NULL DEFAULT 'LEASED';
ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "xRayLeaseCostDaily" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "ctLeaseCostDaily" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "mriLeaseCostDaily" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "portableXRayLeaseCostDaily" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ScenarioResourceConfig" ADD COLUMN IF NOT EXISTS "ultrasoundLeaseCostDaily" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ScenarioServiceConfig" ADD COLUMN IF NOT EXISTS "consumableCost" DOUBLE PRECISION NOT NULL DEFAULT 0;

ALTER TABLE "ScenarioDemandProfile" ADD COLUMN IF NOT EXISTS "traumaSpikeProbability" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "ScenarioDemandProfile" ADD COLUMN IF NOT EXISTS "traumaSpikeMultiplier" DOUBLE PRECISION NOT NULL DEFAULT 2.0;

ALTER TABLE "SimulationRunDailySnapshot" ADD COLUMN IF NOT EXISTS "profit" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SimulationRunDailySnapshot" ADD COLUMN IF NOT EXISTS "totalCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SimulationRunDailySnapshot" ADD COLUMN IF NOT EXISTS "consumableCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SimulationRunDailySnapshot" ADD COLUMN IF NOT EXISTS "machineCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "SimulationRunDailySnapshot" ADD COLUMN IF NOT EXISTS "staffCost" DOUBLE PRECISION NOT NULL DEFAULT 0;
