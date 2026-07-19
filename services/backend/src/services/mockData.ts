// In-memory mock data store for development/testing.
// TODO: Replace with real KV / D1 storage in production.

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
  icon?: string;
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

export interface MedicationInsight {
  medicationId: string;
  medicationName: string;
  indication: string;
  longTermValue: string;
  watchOuts: string[];
  caregiverTips: string[];
  disclaimer: string;
}

export const RECIPIENTS: CareRecipient[] = [
  {
    id: "recipient-001",
    name: "Margaret Chen",
    dateOfBirth: "1942-03-15",
    notes: "Prefers morning medications with breakfast. Has mild shellfish allergy.",
  },
  {
    id: "recipient-002",
    name: "Harold Thompson",
    dateOfBirth: "1938-07-22",
    notes: "Night owl schedule. Takes medications after 9 pm with evening snack.",
  },
];

export const MEDICATIONS: Medication[] = [
  {
    id: "med-001",
    recipientId: "recipient-001",
    name: "Lisinopril",
    dosage: "10 mg",
    form: "Tablet",
    instructions: "Take once daily in the morning with water",
    color: "blue",
    scheduleType: "daily",
    scheduleTimes: ["08:00"],
    startDate: "2024-01-15",
    active: true,
  },
  {
    id: "med-002",
    recipientId: "recipient-001",
    name: "Metformin",
    dosage: "500 mg",
    form: "Tablet",
    instructions: "Take with meals to reduce stomach upset",
    color: "green",
    scheduleType: "daily",
    scheduleTimes: ["08:00", "18:00"],
    startDate: "2024-02-01",
    active: true,
  },
  {
    id: "med-003",
    recipientId: "recipient-001",
    name: "Atorvastatin",
    dosage: "20 mg",
    form: "Tablet",
    instructions: "Take at bedtime",
    color: "purple",
    scheduleType: "daily",
    scheduleTimes: ["21:00"],
    startDate: "2024-01-15",
    active: true,
  },
  {
    id: "med-004",
    recipientId: "recipient-001",
    name: "Aspirin",
    dosage: "81 mg",
    form: "Tablet",
    instructions: "Take with breakfast",
    color: "red",
    scheduleType: "daily",
    scheduleTimes: ["08:00"],
    startDate: "2024-01-15",
    active: true,
  },
  {
    id: "med-005",
    recipientId: "recipient-002",
    name: "Amlodipine",
    dosage: "5 mg",
    form: "Tablet",
    instructions: "Take once daily at the same time each day",
    color: "orange",
    scheduleType: "daily",
    scheduleTimes: ["21:00"],
    startDate: "2023-11-01",
    active: true,
  },
];

function todayAt(time: string): string {
  const now = new Date();
  const [h, m] = time.split(":").map(Number);
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0);
  return d.toISOString();
}

export function generateTodayDoses(): DoseOccurrence[] {
  const now = new Date();
  const doses: DoseOccurrence[] = [];
  for (const med of MEDICATIONS) {
    for (const time of med.scheduleTimes) {
      const scheduledAt = todayAt(time);
      const scheduledTime = new Date(scheduledAt);
      const isPast = scheduledTime < now;
      const minutesPast = (now.getTime() - scheduledTime.getTime()) / 60000;
      let status: DoseStatus = "pending";
      if (isPast && minutesPast > 90) {
        // Simulate realistic mix: med-003 missed, others taken
        status = med.id === "med-003" ? "missed" : "taken";
      }
      doses.push({
        id: `dose-${med.id}-${time.replace(":", "")}`,
        medicationId: med.id,
        recipientId: med.recipientId,
        medicationName: med.name,
        medicationColor: med.color,
        dosage: med.dosage,
        scheduledAt,
        status,
        takenAt: status === "taken" ? scheduledAt : undefined,
      });
    }
  }
  return doses;
}

// In-memory dose status overrides (reset on worker restart)
// TODO: persist to KV in production
const doseStatusOverrides = new Map<string, { status: DoseStatus; takenAt?: string; notes?: string }>();

export function overrideDoseStatus(
  doseId: string,
  status: DoseStatus,
  notes?: string
): void {
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

export const MEDICATION_INSIGHTS: Record<string, MedicationInsight> = {
  "med-001": {
    medicationId: "med-001",
    medicationName: "Lisinopril",
    indication:
      "Used to treat high blood pressure (hypertension) and heart failure. Helps the heart pump blood more efficiently.",
    longTermValue:
      "Consistently taking this medication reduces the risk of stroke, heart attack, and kidney damage caused by high blood pressure. Benefits build gradually over months.",
    watchOuts: [
      "A dry, persistent cough is the most common side effect — mention it at the next doctor visit.",
      "Can cause dizziness when standing up quickly, especially in the morning.",
      "Avoid potassium supplements or salt substitutes unless approved by the doctor.",
    ],
    caregiverTips: [
      "Give at the same time each morning — consistency matters for blood pressure control.",
      "Check blood pressure weekly if possible and note any readings above 160/100.",
      "Do not stop suddenly without medical guidance — this can spike blood pressure.",
    ],
    disclaimer:
      "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-002": {
    medicationId: "med-002",
    medicationName: "Metformin",
    indication:
      "First-line medication for type 2 diabetes. Helps the body use insulin more effectively and reduces glucose production in the liver.",
    longTermValue:
      "Keeps blood sugar in a healthy range, which protects against nerve damage, kidney disease, vision problems, and cardiovascular complications over years.",
    watchOuts: [
      "Stomach upset, nausea, or diarrhea is common when starting — giving with food helps.",
      "Rarely causes low blood sugar on its own, but monitor if combined with other diabetes medications.",
      "Needs to be paused before certain medical procedures or CT scans with contrast dye — check with the doctor.",
    ],
    caregiverTips: [
      "Always give with meals — this significantly reduces stomach side effects.",
      "Watch for signs of unusual fatigue or muscle pain.",
      "Regular A1C blood tests (every 3–6 months) confirm the medication is working.",
    ],
    disclaimer:
      "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-003": {
    medicationId: "med-003",
    medicationName: "Atorvastatin",
    indication:
      "A statin medication that lowers cholesterol, particularly LDL ('bad') cholesterol, to reduce cardiovascular disease risk.",
    longTermValue:
      "Long-term use significantly lowers the risk of heart attacks and strokes. Works best when taken consistently over months and years.",
    watchOuts: [
      "Muscle pain or weakness that is new or unusual — contact the doctor promptly.",
      "Avoid large amounts of grapefruit juice, which can increase the medication's effects.",
      "Liver function tests may be ordered periodically — keep scheduled lab appointments.",
    ],
    caregiverTips: [
      "Bedtime dosing is preferred as cholesterol production peaks at night.",
      "Consistent daily use is essential — missing doses frequently reduces effectiveness.",
      "Combines well with a heart-healthy diet, but medication is still needed even if diet improves.",
    ],
    disclaimer:
      "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-004": {
    medicationId: "med-004",
    medicationName: "Aspirin",
    indication:
      "Low-dose aspirin is used to prevent blood clots, reducing the risk of heart attack and stroke in people with cardiovascular risk factors.",
    longTermValue:
      "Acts as a long-term blood thinner that keeps platelets from clumping together. The protective effect is continuous as long as the medication is taken.",
    watchOuts: [
      "Can irritate the stomach lining — always give with food.",
      "Increases bleeding risk — mention aspirin use to all healthcare providers before any procedure.",
      "Watch for unusual bruising, black stools, or prolonged bleeding from small cuts.",
    ],
    caregiverTips: [
      "Give with breakfast to reduce stomach irritation.",
      "Confirm with the doctor before giving any pain reliever such as ibuprofen — combinations can increase bleeding risk.",
      "Ask the cardiologist at each visit whether aspirin therapy should continue.",
    ],
    disclaimer:
      "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-005": {
    medicationId: "med-005",
    medicationName: "Amlodipine",
    indication:
      "A calcium channel blocker used to treat high blood pressure and angina (chest pain). Relaxes and widens blood vessels to reduce the heart's workload.",
    longTermValue:
      "Steady, long-term use maintains blood pressure control and reduces strain on the heart and arteries, lowering risk of heart failure and stroke.",
    watchOuts: [
      "Ankle swelling is a common side effect — elevate feet when resting if this occurs.",
      "Can cause flushing or feeling warm, especially in the first few weeks.",
      "Do not stop abruptly — blood pressure may rebound.",
    ],
    caregiverTips: [
      "Give at the same time each evening — this keeps blood pressure stable overnight.",
      "Comfortable footwear matters if ankle swelling develops.",
      "If chest pain occurs, contact emergency services immediately regardless of medication.",
    ],
    disclaimer:
      "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
};
