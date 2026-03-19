ALTER TABLE "Scenario"
ADD COLUMN "workflowConfig" JSONB,
ADD COLUMN "appointmentPolicy" JSONB;

ALTER TABLE "ScenarioDemandProfile"
ADD COLUMN "femaleFraction" DOUBLE PRECISION NOT NULL DEFAULT 0.5;
