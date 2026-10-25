export interface CareRecipient {
  id: string;
  name: string;
  dateOfBirth?: string;
  notes?: string;
}

export type MedicationColor = "red" | "orange" | "yellow" | "green" | "teal" | "blue" | "purple" | "pink";
export type ScheduleType = "daily" | "weekdays" | "interval";
export type DoseStatus = "pending" | "taken" | "missed" | "skipped" | "rescheduled";

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

export interface MedicationSchedule {
  type: ScheduleType;
  times: string[];
  days?: number[];
  intervalHours?: number;
}

export interface MedicationDetails {
  recipientId: string;
  dosage: string;
  form: string;
  instructions?: string;
  color: MedicationColor;
  schedule: MedicationSchedule;
  startDate: string;
  endDate?: string;
  timezone: string;
  stock?: {
    quantity: number;
    unit: string;
    refillThreshold?: number;
  };
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

export interface MedicationInsight {
  medicationId: string;
  medicationName: string;
  indication: string;
  longTermValue: string;
  watchOuts: string[];
  caregiverTips: string[];
  disclaimer: string;
}
