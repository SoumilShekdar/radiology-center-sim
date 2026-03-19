CREATE TABLE IF NOT EXISTS "Scenario" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "seedDefault" INTEGER NOT NULL,
    "downtimeRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "operatingHours" JSONB NOT NULL,
    "staffRotation" JSONB NOT NULL,
    "workflowConfig" JSONB,
    "appointmentPolicy" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "ScenarioResourceConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "xRayMachines" INTEGER NOT NULL,
    "ctMachines" INTEGER NOT NULL,
    "mriMachines" INTEGER NOT NULL,
    "portableXRayMachines" INTEGER NOT NULL,
    "ultrasoundMachines" INTEGER NOT NULL,
    "rooms" INTEGER NOT NULL,
    "changingRooms" INTEGER NOT NULL,
    "technicians" INTEGER NOT NULL,
    "supportStaff" INTEGER NOT NULL,
    "radiologists" INTEGER NOT NULL,
    CONSTRAINT "ScenarioResourceConfig_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ScenarioServiceConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "charge" DOUBLE PRECISION NOT NULL,
    "examDurationMinutes" INTEGER NOT NULL,
    "prepDurationMinutes" INTEGER NOT NULL,
    "cleanupMinutes" INTEGER NOT NULL,
    "reportingMinutes" INTEGER NOT NULL,
    CONSTRAINT "ScenarioServiceConfig_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ScenarioDemandProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "baseDailyPatients" INTEGER NOT NULL,
    "hourlyDistribution" JSONB NOT NULL,
    "dayOfWeekMultiplier" JSONB NOT NULL,
    "inpatientFraction" DOUBLE PRECISION NOT NULL,
    "femaleFraction" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "urgentFraction" DOUBLE PRECISION NOT NULL,
    "noShowRate" DOUBLE PRECISION NOT NULL,
    "unexpectedLeaveRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "repeatScanRate" DOUBLE PRECISION NOT NULL,
    "resultCommunicationMinutes" INTEGER NOT NULL,
    CONSTRAINT "ScenarioDemandProfile_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ScenarioServiceMix" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "ScenarioServiceMix_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SimulationRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "scenarioId" TEXT NOT NULL,
    "horizonDays" INTEGER NOT NULL,
    "seed" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "summary" JSONB,
    CONSTRAINT "SimulationRun_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SimulationRunMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "modality" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "metricValue" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "SimulationRunMetric_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "SimulationRunDailySnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "dayIndex" INTEGER NOT NULL,
    "modality" TEXT NOT NULL,
    "throughput" INTEGER NOT NULL,
    "completedPatients" INTEGER NOT NULL,
    "deferredPatients" INTEGER NOT NULL,
    "revenue" DOUBLE PRECISION NOT NULL,
    "averageWaitMinutes" DOUBLE PRECISION NOT NULL,
    "averageResultMinutes" DOUBLE PRECISION NOT NULL,
    "p90WaitMinutes" DOUBLE PRECISION NOT NULL,
    "queuePeak" INTEGER NOT NULL,
    "machineUtilization" DOUBLE PRECISION NOT NULL,
    "technicianUtilization" DOUBLE PRECISION NOT NULL,
    "radiologistUtilization" DOUBLE PRECISION NOT NULL,
    "roomUtilization" DOUBLE PRECISION NOT NULL,
    "changingRoomUtilization" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "SimulationRunDailySnapshot_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SimulationRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ScenarioResourceConfig_scenarioId_key" ON "ScenarioResourceConfig"("scenarioId");
CREATE UNIQUE INDEX IF NOT EXISTS "ScenarioServiceConfig_scenarioId_modality_key" ON "ScenarioServiceConfig"("scenarioId", "modality");
CREATE UNIQUE INDEX IF NOT EXISTS "ScenarioDemandProfile_scenarioId_key" ON "ScenarioDemandProfile"("scenarioId");
CREATE UNIQUE INDEX IF NOT EXISTS "ScenarioServiceMix_scenarioId_modality_key" ON "ScenarioServiceMix"("scenarioId", "modality");
