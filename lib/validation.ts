import { z } from "zod";
import { MODALITIES } from "@/lib/constants";

const boundedPercent = z.number().min(0).max(1);

export const operatingHourSchema = z.object({
  enabled: z.boolean(),
  openHour: z.number().int().min(0).max(23),
  closeHour: z.number().int().min(1).max(24)
}).refine((value) => !value.enabled || value.closeHour > value.openHour, {
  message: "Close hour must be after open hour."
});

export const coverageSchema = z.object({
  hour: z.number().int().min(0).max(23),
  coverage: z.number().min(0).max(2)
});

export const scenarioSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2),
  description: z.string().min(10),
  currency: z.enum(["USD", "INR", "EUR", "GBP", "AED", "SGD"]),
  seedDefault: z.number().int().min(1),
  downtimeRate: boundedPercent,
  operatingHours: z.array(operatingHourSchema).length(7),
  staffRotation: z.object({
    technicians: z.array(coverageSchema).length(24),
    supportStaff: z.array(coverageSchema).length(24),
    radiologists: z.array(coverageSchema).length(24)
  }),
  resourceConfig: z.object({
    xRayMachines: z.number().int().min(0),
    ctMachines: z.number().int().min(0),
    mriMachines: z.number().int().min(0),
    portableXRayMachines: z.number().int().min(0),
    ultrasoundMachines: z.number().int().min(0),
    rooms: z.number().int().min(1),
    changingRooms: z.number().int().min(0),
    technicians: z.number().int().min(1),
    supportStaff: z.number().int().min(1),
    radiologists: z.number().int().min(1)
  }),
  serviceConfigs: z.array(z.object({
    modality: z.enum(MODALITIES),
    charge: z.number().nonnegative(),
    examDurationMinutes: z.number().int().min(5),
    prepDurationMinutes: z.number().int().min(0),
    cleanupMinutes: z.number().int().min(0),
    reportingMinutes: z.number().int().min(1)
  })).length(MODALITIES.length),
  demandProfile: z.object({
    baseDailyPatients: z.number().int().min(1),
    hourlyDistribution: z.array(z.number().nonnegative()).length(24),
    dayOfWeekMultiplier: z.array(z.number().min(0)).length(7),
    inpatientFraction: boundedPercent,
    urgentFraction: boundedPercent,
    noShowRate: boundedPercent,
    unexpectedLeaveRate: boundedPercent,
    repeatScanRate: boundedPercent,
    resultCommunicationMinutes: z.number().int().min(0)
  }),
  serviceMix: z.array(z.object({
    modality: z.enum(MODALITIES),
    weight: z.number().nonnegative()
  })).length(MODALITIES.length)
}).superRefine((value, ctx) => {
  const arrivalTotal = value.demandProfile.hourlyDistribution.reduce((sum, item) => sum + item, 0);
  const mixTotal = value.serviceMix.reduce((sum, item) => sum + item.weight, 0);

  if (Math.abs(arrivalTotal - 1) > 0.001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Hourly patient distribution must sum to 1."
    });
  }

  if (Math.abs(mixTotal - 1) > 0.001) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Service distribution must sum to 1."
    });
  }
});

export type ScenarioSchema = z.infer<typeof scenarioSchema>;
