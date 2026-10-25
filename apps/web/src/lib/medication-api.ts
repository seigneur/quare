// API client for the caregiver medication management endpoints.
// Falls back to local mock data when the API is unreachable or not configured.

import type { CareRecipient, Medication, DoseOccurrence, MedicationInsight, DoseStatus } from "./types";
import {
  MOCK_RECIPIENTS,
  MOCK_MEDICATIONS,
  generateMockDoses,
  MOCK_INSIGHTS,
} from "./mock-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("no-api");
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`api-error-${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchRecipients(): Promise<CareRecipient[]> {
  try {
    return await apiFetch<CareRecipient[]>("/api/recipients");
  } catch {
    return MOCK_RECIPIENTS;
  }
}

export async function fetchMedications(): Promise<Medication[]> {
  try {
    return await apiFetch<Medication[]>("/api/medications");
  } catch {
    return MOCK_MEDICATIONS;
  }
}

export async function fetchDuesDoses(): Promise<DoseOccurrence[]> {
  try {
    return await apiFetch<DoseOccurrence[]>("/api/doses/due");
  } catch {
    return generateMockDoses();
  }
}

export async function updateDoseStatus(
  doseId: string,
  status: DoseStatus,
  notes?: string
): Promise<DoseOccurrence> {
  try {
    return await apiFetch<DoseOccurrence>(`/api/doses/${doseId}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, notes }),
    });
  } catch {
    // Optimistic mock — return a locally modified dose
    const doses = generateMockDoses();
    const dose = doses.find((d) => d.id === doseId);
    if (!dose) throw new Error("Dose not found");
    return {
      ...dose,
      status,
      takenAt: status === "taken" ? new Date().toISOString() : undefined,
      notes,
    };
  }
}

export async function fetchMedicationInsight(medicationId: string): Promise<MedicationInsight> {
  try {
    return await apiFetch<MedicationInsight>(`/api/medications/${medicationId}/explain`);
  } catch {
    const insight = MOCK_INSIGHTS[medicationId];
    if (!insight) {
      throw new Error("Insight not available for this medication");
    }
    return insight;
  }
}
