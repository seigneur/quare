"use client";

import { Navigation } from "@/components/Navigation";
import { useTheme } from "@/components/ThemeProvider";

function Toggle({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-white/10 p-4 bg-white/5">
      <div>
        <p className="text-white font-semibold" style={{ fontSize: "var(--body-font-size)" }}>
          {label}
        </p>
        <p className="text-gray-400 text-sm mt-0.5">{description}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className="relative w-12 h-6 rounded-full transition-colors shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500"
        style={{ backgroundColor: checked ? "#7c3aed" : "#374151" }}
      >
        <span
          className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
          style={{ transform: checked ? "translateX(26px)" : "translateX(2px)" }}
        />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const { largeText, highContrast, toggleLargeText, toggleHighContrast } = useTheme();

  return (
    <>
      <Navigation />
      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-white font-extrabold mb-2" style={{ fontSize: "calc(var(--heading-font-size) * 1.4)" }}>
          Settings
        </h1>
        <p className="text-gray-400 text-sm mb-6">
          Preferences are saved in your browser and apply immediately.
        </p>

        <div className="space-y-4">
          <Toggle
            label="Large text"
            description="Increases font size throughout the app for easier reading."
            checked={largeText}
            onToggle={toggleLargeText}
          />
          <Toggle
            label="High contrast"
            description="Stronger color contrast for better visibility in bright conditions."
            checked={highContrast}
            onToggle={toggleHighContrast}
          />
        </div>

        <div className="mt-10 rounded-2xl border border-white/10 p-4 bg-white/5">
          <p className="text-gray-400 text-sm font-semibold mb-1">API connection</p>
          <p className="text-gray-500 text-xs leading-relaxed">
            Backend:{" "}
            <span className="font-mono text-violet-300">
              {process.env.NEXT_PUBLIC_API_URL || "(not configured)"}
            </span>
          </p>
          <p className="text-gray-600 text-xs mt-1">
            Set <code className="text-violet-400">NEXT_PUBLIC_API_URL</code> in your environment to connect to a live Cloudflare Worker.
          </p>
        </div>
      </main>
    </>
  );
}
