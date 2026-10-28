import type { MedicationInsight } from "./medicationTypes.js";

export const MEDICATION_INSIGHTS: Record<string, MedicationInsight> = {
  "med-001": {
    medicationId: "med-001",
    medicationName: "Lisinopril",
    indication: "Used to treat high blood pressure (hypertension) and heart failure. Helps the heart pump blood more efficiently.",
    longTermValue: "Consistently taking this medication reduces the risk of stroke, heart attack, and kidney damage caused by high blood pressure. Benefits build gradually over months.",
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
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-002": {
    medicationId: "med-002",
    medicationName: "Metformin",
    indication: "First-line medication for type 2 diabetes. Helps the body use insulin more effectively and reduces glucose production in the liver.",
    longTermValue: "Keeps blood sugar in a healthy range, which protects against nerve damage, kidney disease, vision problems, and cardiovascular complications over years.",
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
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-003": {
    medicationId: "med-003",
    medicationName: "Atorvastatin",
    indication: "A statin medication that lowers cholesterol, particularly LDL ('bad') cholesterol, to reduce cardiovascular disease risk.",
    longTermValue: "Long-term use significantly lowers the risk of heart attacks and strokes. Works best when taken consistently over months and years.",
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
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-004": {
    medicationId: "med-004",
    medicationName: "Aspirin",
    indication: "Low-dose aspirin is used to prevent blood clots, reducing the risk of heart attack and stroke in people with cardiovascular risk factors.",
    longTermValue: "Acts as a long-term blood thinner that keeps platelets from clumping together. The protective effect is continuous as long as the medication is taken.",
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
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
  "med-005": {
    medicationId: "med-005",
    medicationName: "Amlodipine",
    indication: "A calcium channel blocker used to treat high blood pressure and angina (chest pain). Relaxes and widens blood vessels to reduce the heart's workload.",
    longTermValue: "Steady, long-term use maintains blood pressure control and reduces strain on the heart and arteries, lowering risk of heart failure and stroke.",
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
    disclaimer: "This information is educational only. Always follow the prescribing doctor's instructions.",
  },
};
