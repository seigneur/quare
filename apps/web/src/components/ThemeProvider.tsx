"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface ThemeState {
  largeText: boolean;
  highContrast: boolean;
  toggleLargeText: () => void;
  toggleHighContrast: () => void;
}

const ThemeContext = createContext<ThemeState>({
  largeText: false,
  highContrast: false,
  toggleLargeText: () => {},
  toggleHighContrast: () => {},
});

export function useTheme() {
  return useContext(ThemeContext);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [largeText, setLargeText] = useState(false);
  const [highContrast, setHighContrast] = useState(false);

  // Load preferences from localStorage on mount
  useEffect(() => {
    setLargeText(localStorage.getItem("quare_large_text") === "1");
    setHighContrast(localStorage.getItem("quare_high_contrast") === "1");
  }, []);

  // Apply classes to <html> whenever preferences change
  useEffect(() => {
    document.documentElement.classList.toggle("large-text", largeText);
    document.documentElement.classList.toggle("high-contrast", highContrast);
  }, [largeText, highContrast]);

  function toggleLargeText() {
    setLargeText((v) => {
      const next = !v;
      localStorage.setItem("quare_large_text", next ? "1" : "0");
      return next;
    });
  }

  function toggleHighContrast() {
    setHighContrast((v) => {
      const next = !v;
      localStorage.setItem("quare_high_contrast", next ? "1" : "0");
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ largeText, highContrast, toggleLargeText, toggleHighContrast }}>
      {children}
    </ThemeContext.Provider>
  );
}
