// Frontend mock data — mirrors the backend mock store.
// Used as a fallback when the API is not reachable (local dev, GitHub Pages demo).

import type { CareRecipient, Medication, DoseOccurrence, MedicationInsight } from "./types";

export const MOCK_RECIPIENTS: CareRecipient[] = [
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

export const MOCK_MEDICATIONS: Medication[] = [
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
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m, 0, 0).toISOString();
}

export function generateMockDoses(): DoseOccurrence[] {
  const now = new Date();
  const doses: DoseOccurrence[] = [];
  for (const med of MOCK_MEDICATIONS) {
    for (const time of med.scheduleTimes) {
      const scheduledAt = todayAt(time);
      const minutesPast = (now.getTime() - new Date(scheduledAt).getTime()) / 60000;
      let status: DoseOccurrence["status"] = "pending";
      if (minutesPast > 90) {
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

export const MOCK_INSIGHTS: Record<string, MedicationInsight> = {
  "med-001": {
    medicationId: "med-001",
    medicationName: "Lisinopril",
    indication: "Used to treat high blood pressure and heart failure. Helps the heart pump blood more efficiently.",
    longTermValue:
      "Consistently taking this medication reduces the risk of stroke, heart attack, and kidney damage. Benefits build gradually over months.",
    watchOuts: [
      "A dry, persistent cough is the most common side effect — mention it at the next doctor visit.",
      "Can cause dizziness when standing up quickly, especially in the morning.",
      "Avoid potassium supplements unless approved by the doctor.",
    ],
    caregiverTips: [
      "Give at the same time each morning — consistency matters for blood pressure control.",
      "Check blood pressure weekly if possible and note readings above 160/100.",
      "Do not stop suddenly without medical guidance.",
    ],
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-002": {
    medicationId: "med-002",
    medicationName: "Metformin",
    indication: "First-line medication for type 2 diabetes. Helps the body use insulin more effectively.",
    longTermValue:
      "Keeps blood sugar in a healthy range, protecting against nerve damage, kidney disease, vision problems, and cardiovascular complications over years.",
    watchOuts: [
      "Stomach upset is common when starting — giving with food helps.",
      "Needs to be paused before certain medical procedures or CT scans — check with the doctor.",
    ],
    caregiverTips: [
      "Always give with meals to significantly reduce stomach side effects.",
      "Regular A1C blood tests (every 3–6 months) confirm the medication is working.",
    ],
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-003": {
    medicationId: "med-003",
    medicationName: "Atorvastatin",
    indication: "A statin that lowers LDL ('bad') cholesterol to reduce cardiovascular disease risk.",
    longTermValue:
      "Long-term use significantly lowers the risk of heart attacks and strokes. Works best when taken consistently.",
    watchOuts: [
      "New or unusual muscle pain or weakness — contact the doctor promptly.",
      "Avoid large amounts of grapefruit juice, which can increase the medication's effects.",
    ],
    caregiverTips: [
      "Bedtime dosing is preferred as cholesterol production peaks at night.",
      "Consistent daily use is essential — missing doses reduces effectiveness.",
    ],
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-004": {
    medicationId: "med-004",
    medicationName: "Aspirin",
    indication: "Low-dose aspirin prevents blood clots, reducing the risk of heart attack and stroke.",
    longTermValue:
      "Acts as a long-term blood thinner that keeps platelets from clumping. Protective effect is continuous as long as the medication is taken.",
    watchOuts: [
      "Can irritate the stomach lining — always give with food.",
      "Increases bleeding risk — mention aspirin use before any medical procedure.",
    ],
    caregiverTips: [
      "Give with breakfast to reduce stomach irritation.",
      "Confirm with the doctor before giving ibuprofen or other pain relievers.",
    ],
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-005": {
    medicationId: "med-005",
    medicationName: "Amlodipine",
    indication: "A calcium channel blocker for high blood pressure and angina. Relaxes blood vessels to reduce the heart's workload.",
    longTermValue:
      "Steady long-term use maintains blood pressure control and reduces risk of heart failure and stroke.",
    watchOuts: [
      "Ankle swelling is common — elevate feet when resting if this occurs.",
      "Do not stop abruptly — blood pressure may rebound.",
    ],
    caregiverTips: [
      "Give at the same time each evening for stable overnight blood pressure.",
      "If chest pain occurs, contact emergency services immediately regardless of medication.",
    ],
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
};
