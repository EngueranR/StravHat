import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import { getMessage, type I18nMessageKey } from "./catalog";
import { type AppLanguage, useAppLanguageValue } from "./language";

export type I18nParams = Record<
  string,
  string | number | boolean | null | undefined
>;

interface I18nContextValue {
  language: AppLanguage;
  t: (key: I18nMessageKey, params?: I18nParams) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function interpolateTemplate(template: string, params?: I18nParams) {
  if (!params) {
    return template;
  }

  return template.replace(/\{(\w+)\}/g, (_match, token: string) => {
    const value = params[token];
    return value === null || value === undefined ? "" : String(value);
  });
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const language = useAppLanguageValue();

  const t = useCallback(
    (key: I18nMessageKey, params?: I18nParams) =>
      interpolateTemplate(getMessage(language, key), params),
    [language],
  );

  const value = useMemo(() => ({ language, t }), [language, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used inside I18nProvider.");
  }
  return context;
}

