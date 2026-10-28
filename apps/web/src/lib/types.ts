// Core domain types for the caregiver medication management app.

export type DoseStatus = "pending" | "taken" | "missed" | "skipped" | "rescheduled";
export type MedicationColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink";
export type ScheduleType = "daily" | "weekdays" | "interval";

export interface CareRecipient {
  id: string;
  name: string;
  dateOfBirth?: string;
  notes?: string;
}

export interface Medication {
  id: string;
  recipientId: string;
  name: string;
  dosage: string;
  form: string;
  instructions?: string;
  color: MedicationColor;
  scheduleType: ScheduleType;
  scheduleTimes: string[];
  scheduleDays?: number[];
  startDate: string;
  endDate?: string;
  active: boolean;
}

export interface DoseOccurrence {
  id: string;
  medicationId: string;
  recipientId: string;
  medicationName: string;
  medicationColor: MedicationColor;
  dosage: string;
  scheduledAt: string;
  status: DoseStatus;
  takenAt?: string;
  notes?: string;
}

export interface AdherenceSummary {
  taken: number;
  missed: number;
  adherence: number | null;
}

export interface MedicationInsight {
  medicationId: string;
  medicationName: string;
  indication: string;
  longTermValue: string;
  watchOuts: string[];
  caregiverTips: string[];
  disclaimer: string;
}
