// API client for the caregiver medication management endpoints.

import type { CareRecipient, Medication, DoseOccurrence, MedicationInsight, DoseStatus } from "./types";
import { generateMockDoses } from "./mock-data";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";
const ORG_ID = process.env.NEXT_PUBLIC_ORG_ID ?? "";

interface MedicationAsset {
  recordId: string;
  name: string;
  kind?: "generic" | "medication";
  medication?: {
    recipientId: string;
    dosage: string;
    form: string;
    instructions?: string;
    color: Medication["color"];
    schedule: {
      type: Medication["scheduleType"];
      times: string[];
      days?: number[];
    };
    startDate: string;
    endDate?: string;
    active: boolean;
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) throw new Error("no-api");
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) throw new Error(`api-error-${res.status}`);
  return res.json() as Promise<T>;
}

export async function fetchRecipients(): Promise<CareRecipient[]> {
  try {
    return await apiFetch<CareRecipient[]>(`/api/recipients/${encodeURIComponent(ORG_ID)}`);
  } catch {
    return [];
  }
}

export async function fetchMedications(recipientId?: string): Promise<Medication[]> {
  try {
    const query = recipientId ? `?recipientId=${encodeURIComponent(recipientId)}` : "";
    const assets = await apiFetch<MedicationAsset[]>(
      `/api/medications/${encodeURIComponent(ORG_ID)}${query}`
    );
    return assets.flatMap((asset) => {
      const details = asset.medication;
      if (asset.kind !== "medication" || !details) return [];
      return [{
        id: asset.recordId,
        recipientId: details.recipientId,
        name: asset.name,
        dosage: details.dosage,
        form: details.form,
        instructions: details.instructions,
        color: details.color,
        scheduleType: details.schedule.type,
        scheduleTimes: details.schedule.times,
        scheduleDays: details.schedule.days,
        startDate: details.startDate,
        endDate: details.endDate,
        active: details.active,
      }];
    });
  } catch {
    return [];
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
  return apiFetch<MedicationInsight>(
    `/api/medications/${encodeURIComponent(ORG_ID)}/${encodeURIComponent(medicationId)}/explain`
  );
}
