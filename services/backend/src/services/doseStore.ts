import type { DoseOccurrence, DoseStatus, MedicationColor } from "./medicationTypes.js";

const medications: Array<{
  id: string;
  recipientId: string;
  name: string;
  dosage: string;
  color: MedicationColor;
  times: string[];
}> = [
  { id: "med-001", recipientId: "recipient-001", name: "Lisinopril", dosage: "10 mg", color: "blue", times: ["08:00"] },
  { id: "med-002", recipientId: "recipient-001", name: "Metformin", dosage: "500 mg", color: "green", times: ["08:00", "18:00"] },
  { id: "med-003", recipientId: "recipient-001", name: "Atorvastatin", dosage: "20 mg", color: "purple", times: ["21:00"] },
  { id: "med-004", recipientId: "recipient-001", name: "Aspirin", dosage: "81 mg", color: "red", times: ["08:00"] },
  { id: "med-005", recipientId: "recipient-002", name: "Amlodipine", dosage: "5 mg", color: "orange", times: ["21:00"] },
];

function todayAt(time: string): string {
  const now = new Date();
  const [hour, minute] = time.split(":").map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0).toISOString();
}

export function generateTodayDoses(): DoseOccurrence[] {
  const now = new Date();
  return medications.flatMap((medication) =>
    medication.times.map((time) => {
      const scheduledAt = todayAt(time);
      const isPast = new Date(scheduledAt) < now;
      const minutesPast = (now.getTime() - new Date(scheduledAt).getTime()) / 60000;
      let status: DoseStatus = "pending";
      if (isPast && minutesPast > 90) status = medication.id === "med-003" ? "missed" : "taken";
      return {
        id: `dose-${medication.id}-${time.replace(":", "")}`,
        medicationId: medication.id,
        recipientId: medication.recipientId,
        medicationName: medication.name,
        medicationColor: medication.color,
        dosage: medication.dosage,
        scheduledAt,
        status,
        takenAt: status === "taken" ? scheduledAt : undefined,
      };
    })
  );
}

const doseStatusOverrides = new Map<string, { status: DoseStatus; takenAt?: string; notes?: string }>();

export function overrideDoseStatus(doseId: string, status: DoseStatus, notes?: string): void {
  doseStatusOverrides.set(doseId, {
    status,
    takenAt: status === "taken" ? new Date().toISOString() : undefined,
    notes,
  });
}

export function getDosesWithOverrides(): DoseOccurrence[] {
  return generateTodayDoses().map((dose) => {
    const override = doseStatusOverrides.get(dose.id);
    return override ? { ...dose, ...override } : dose;
  });
}
