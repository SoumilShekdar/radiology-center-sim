export const MODALITIES = ["XRAY", "CT", "MRI", "PORTABLE_XRAY", "ULTRASOUND"] as const;
export const PATIENT_TYPES = ["OUTPATIENT", "INPATIENT"] as const;
export const PATIENT_GENDERS = ["MALE", "FEMALE"] as const;
export const HORIZON_OPTIONS = [1, 7, 30, 365] as const;
export const SLOT_MINUTES = 5;
export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

export type Modality = (typeof MODALITIES)[number];
export type PatientType = (typeof PATIENT_TYPES)[number];
export type PatientGender = (typeof PATIENT_GENDERS)[number];

export const MODALITY_LABELS: Record<Modality, string> = {
  XRAY: "X-Ray",
  CT: "CT Scan",
  MRI: "MRI",
  PORTABLE_XRAY: "Portable X-Ray",
  ULTRASOUND: "Ultrasound"
};

export const RESOURCE_LABELS = [
  "machines",
  "rooms",
  "changingRooms",
  "technicians",
  "supportStaff",
  "radiologists"
] as const;
