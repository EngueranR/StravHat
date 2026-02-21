import { useEffect, useState } from "react";

export type AppLanguage = "fr" | "en";

const DEFAULT_LANGUAGE: AppLanguage = "fr";
const LANGUAGE_STORAGE_KEY = "stravhat_language";
const listeners = new Set<(language: AppLanguage) => void>();

let currentLanguage: AppLanguage = DEFAULT_LANGUAGE;

export function normalizeLanguage(value: unknown): AppLanguage {
  return value === "en" ? "en" : "fr";
}

export function getStoredLanguage(): AppLanguage | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  return normalizeLanguage(raw);
}

export function getCurrentLanguage(): AppLanguage {
  return currentLanguage;
}

export function setAppLanguage(language: AppLanguage) {
  const normalized = normalizeLanguage(language);

  currentLanguage = normalized;

  if (typeof window !== "undefined") {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, normalized);
  }

  for (const listener of listeners) {
    listener(normalized);
  }
}

export function initializeAppLanguage() {
  const stored = getStoredLanguage();
  currentLanguage = stored ?? DEFAULT_LANGUAGE;
}

export function subscribeAppLanguage(listener: (language: AppLanguage) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useAppLanguageValue() {
  const [language, setLanguage] = useState<AppLanguage>(getCurrentLanguage());

  useEffect(() => subscribeAppLanguage(setLanguage), []);

  return language;
}
