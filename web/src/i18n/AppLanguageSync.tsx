import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { getStoredLanguage, normalizeLanguage, setAppLanguage } from "./language";

export function AppLanguageSync() {
  const { user } = useAuth();
  const lastAppliedLanguageRef = useRef<string | null>(null);

  useEffect(() => {
    const targetLanguage = normalizeLanguage(user?.language ?? getStoredLanguage() ?? "fr");

    if (lastAppliedLanguageRef.current === targetLanguage) {
      return;
    }

    lastAppliedLanguageRef.current = targetLanguage;
    setAppLanguage(targetLanguage);
  }, [user?.language]);

  return null;
}
