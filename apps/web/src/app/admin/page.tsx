"use client";

import { useState, useRef } from "react";
import QRCode from "react-qr-code";
import { adminGetRecord, adminRevokeRecord, type AdminRecord } from "@/lib/admin-api";

interface RecordEntry {
  id: string;
  record: AdminRecord;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://quare.app";

function qrValue(recordId: string) {
  return `${APP_URL}/scan?id=${recordId}`;
}

export default function AdminPage() {
  const [adminKey, setAdminKey] = useState(() =>
    typeof window !== "undefined" ? (localStorage.getItem("quare_admin_key") ?? "") : ""
  );
  const [keyInput, setKeyInput] = useState("");
  const [lookupId, setLookupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sheet, setSheet] = useState<RecordEntry[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  const isLoggedIn = adminKey.length > 0;

  function login() {
    if (!keyInput.trim()) return;
    localStorage.setItem("quare_admin_key", keyInput.trim());
    setAdminKey(keyInput.trim());
    setKeyInput("");
  }

  function logout() {
    localStorage.removeItem("quare_admin_key");
    setAdminKey("");
    setSheet([]);
  }

  async function lookup() {
    const id = lookupId.trim();
    if (!id) return;
    if (sheet.find((e) => e.id === id)) {
      setError("Record already in sheet");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const record = await adminGetRecord(id, adminKey);
      setSheet((prev) => [...prev, { id, record }]);
      setLookupId("");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error";
      setError(msg === "401" ? "Invalid admin key" : msg === "404" ? "Record not found" : `Error: ${msg}`);
    } finally {
      setLoading(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm(`Revoke record ${id.slice(0, 12)}…? This immediately blocks PIN verification.`)) return;
    setLoading(true);
    setError("");
    try {
      await adminRevokeRecord(id, adminKey);
      setSheet((prev) =>
        prev.map((e) => e.id === id ? { ...e, record: { ...e.record, revoked: true, hasSecrets: false } } : e)
      );
    } catch {
      setError("Revoke failed");
    } finally {
      setLoading(false);
    }
  }

  function removeFromSheet(id: string) {
    setSheet((prev) => prev.filter((e) => e.id !== id));
  }

  function printSheet() {
    window.print();
  }

  if (!isLoggedIn) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6" style={{ backgroundColor: "#07070F" }}>
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="w-9 h-9 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
              <span className="font-black text-white text-lg">Q</span>
            </div>
            <span className="font-bold text-white text-lg">Quare Admin</span>
          </div>
          <div className="rounded-2xl border border-violet-900 p-8" style={{ background: "rgba(124,58,237,0.07)" }}>
            <h1 className="text-white font-bold text-xl mb-6 text-center">Super Admin Login</h1>
            <input
              type="password"
              placeholder="Admin key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && login()}
              className="w-full px-4 py-3 rounded-xl bg-black border border-violet-800 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 mb-4"
            />
            <button
              onClick={login}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}
            >
              Enter
            </button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
      {/* Print styles — only QR sheet visible when printing */}
      <style>{`
        @media print {
          body > * { display: none !important; }
          #qr-print-sheet { display: block !important; }
        }
      `}</style>

      {/* Hidden print sheet — always rendered but only visible on print */}
      <div id="qr-print-sheet" style={{ display: "none" }} ref={printRef}>
        <div style={{ padding: "16mm", fontFamily: "sans-serif" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, borderBottom: "1px solid #ccc", paddingBottom: 12 }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#7C3AED", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <span style={{ color: "#fff", fontWeight: 900, fontSize: 14 }}>Q</span>
            </div>
            <strong style={{ fontSize: 14 }}>Quare — Record QR Sheet</strong>
            <span style={{ marginLeft: "auto", fontSize: 11, color: "#666" }}>{new Date().toLocaleDateString()}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12mm" }}>
            {sheet.map(({ id, record }) => (
              <div key={id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: "6mm", textAlign: "center", breakInside: "avoid" }}>
                {record.revoked && (
                  <div style={{ background: "#fee2e2", color: "#dc2626", fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, marginBottom: 6, display: "inline-block" }}>
                    REVOKED
                  </div>
                )}
                <QRCode value={qrValue(id)} size={120} style={{ margin: "0 auto 8px" }} />
                <div style={{ fontSize: 9, color: "#555", wordBreak: "break-all", marginBottom: 4 }}>{id.slice(0, 20)}…</div>
                {record.orgId && <div style={{ fontSize: 10, fontWeight: 600, color: "#333" }}>{record.orgId}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Screen UI */}
      <main className="min-h-screen px-6 py-8 max-w-5xl mx-auto" style={{ backgroundColor: "#07070F" }}>
        {/* Nav */}
        <div className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "linear-gradient(135deg,#7C3AED,#A78BFA)" }}>
              <span className="font-black text-white">Q</span>
            </div>
            <span className="font-bold text-white">Quare Admin</span>
          </div>
          <div className="flex items-center gap-3">
            {sheet.length > 0 && (
              <button
                onClick={printSheet}
                className="px-4 py-2 rounded-xl text-sm font-semibold text-white flex items-center gap-2"
                style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}
              >
                🖨 Print QR Sheet ({sheet.length})
              </button>
            )}
            <button onClick={logout} className="px-4 py-2 rounded-xl text-sm text-gray-400 border border-gray-800 hover:border-violet-700 hover:text-white transition-colors">
              Sign out
            </button>
          </div>
        </div>

        {/* Lookup */}
        <div className="rounded-2xl border border-violet-900 p-6 mb-8" style={{ background: "rgba(124,58,237,0.07)" }}>
          <h2 className="text-white font-bold mb-4">Look up record</h2>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Record ID (bytes32 hex)"
              value={lookupId}
              onChange={(e) => setLookupId(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && lookup()}
              className="flex-1 px-4 py-3 rounded-xl bg-black border border-violet-800 text-white placeholder-gray-600 focus:outline-none focus:border-violet-500 font-mono text-sm"
            />
            <button
              onClick={lookup}
              disabled={loading}
              className="px-6 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
              style={{ background: "linear-gradient(135deg,#7C3AED,#6D28D9)" }}
            >
              {loading ? "…" : "Add to Sheet"}
            </button>
          </div>
          {error && <p className="mt-3 text-red-400 text-sm">{error}</p>}
        </div>

        {/* Sheet */}
        {sheet.length === 0 ? (
          <div className="text-center py-20 text-gray-600">
            <p className="text-4xl mb-4">📋</p>
            <p>Add records above to build a QR sheet</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {sheet.map(({ id, record }) => (
              <div key={id} className="rounded-2xl border p-5 flex flex-col items-center gap-4"
                style={{ background: "rgba(124,58,237,0.07)", borderColor: record.revoked ? "#7f1d1d" : "#4c1d95" }}>
                {record.revoked && (
                  <span className="px-2 py-1 rounded text-xs font-bold bg-red-900 text-red-300">REVOKED</span>
                )}
                <div className="bg-white p-3 rounded-xl">
                  <QRCode value={qrValue(id)} size={140} />
                </div>
                <div className="text-center w-full">
                  <p className="text-violet-300 text-xs font-mono break-all mb-1">{id.slice(0, 24)}…</p>
                  {record.orgId && <p className="text-white text-sm font-semibold">{record.orgId}</p>}
                  <div className="flex gap-2 mt-1 justify-center text-xs">
                    <span className={record.hasSecrets ? "text-green-400" : "text-gray-600"}>
                      {record.hasSecrets ? "✓ secrets" : "✗ no secrets"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 w-full">
                  {!record.revoked && (
                    <button
                      onClick={() => revoke(id)}
                      className="flex-1 py-2 rounded-xl text-xs font-semibold text-red-400 border border-red-900 hover:bg-red-900/20 transition-colors"
                    >
                      Revoke
                    </button>
                  )}
                  <button
                    onClick={() => removeFromSheet(id)}
                    className="flex-1 py-2 rounded-xl text-xs font-semibold text-gray-500 border border-gray-800 hover:border-gray-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
