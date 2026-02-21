import { useMemo } from "react";
import ReactEChartsBase from "echarts-for-react";
import { useAppLanguageValue } from "../i18n/language";
import { translateUiText } from "../i18n/translationEngine";

function shouldSkipValue(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }

  return (
    /^#([0-9a-f]{3,8})$/i.test(trimmed) ||
    /^rgba?\(/i.test(trimmed) ||
    /^hsla?\(/i.test(trimmed) ||
    /^-?\d+([.,]\d+)?(%|px|rem|em|ms|s)?$/i.test(trimmed) ||
    /^https?:\/\//i.test(trimmed) ||
    /^\/[A-Za-z0-9/_\-.:]+$/.test(trimmed)
  );
}

function translateChartValue<T>(value: T, language: "fr" | "en"): T {
  if (language === "fr") {
    return value;
  }

  if (typeof value === "function") {
    const wrapped = ((...args: unknown[]) => {
      const result = (value as (...fnArgs: unknown[]) => unknown)(...args);
      if (typeof result === "string") {
        return translateUiText(result, language);
      }
      return translateChartValue(result, language);
    }) as unknown as T;
    return wrapped;
  }

  if (typeof value === "string") {
    if (shouldSkipValue(value)) {
      return value;
    }
    return translateUiText(value, language) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => translateChartValue(item, language)) as T;
  }

  if (value && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const translated: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(source)) {
      translated[key] = translateChartValue(item, language);
    }
    return translated as T;
  }

  return value;
}

export default function LocalizedECharts(
  props: React.ComponentProps<typeof ReactEChartsBase>,
) {
  const language = useAppLanguageValue();

  const translatedOption = useMemo(
    () => translateChartValue(props.option, language),
    [props.option, language],
  );

  return <ReactEChartsBase {...props} option={translatedOption} />;
}
