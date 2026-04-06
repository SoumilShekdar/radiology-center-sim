-- CreateOptimiserRun table for goal-seeking optimizer results

CREATE TABLE "OptimiserRun" (
  "id" TEXT NOT NULL,
  "scenarioId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "horizonDays" INTEGER NOT NULL,
  "seed" INTEGER NOT NULL,
  "constraint" JSONB NOT NULL,
  "results" JSONB,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "OptimiserRun_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "OptimiserRun" ADD CONSTRAINT "OptimiserRun_scenarioId_fkey"
  FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
