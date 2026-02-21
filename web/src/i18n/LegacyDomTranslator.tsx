import { useEffect } from "react";
import { type AppLanguage, useAppLanguageValue } from "./language";
import { translateUiText } from "./translationEngine";

const TRANSLATABLE_ATTRIBUTES = ["placeholder", "title", "aria-label", "aria-placeholder"];

const textOrigins = new WeakMap<Text, string>();
const attributeOrigins = new WeakMap<Element, Map<string, string>>();

function getRootNode() {
  return document.getElementById("root");
}

function getOriginalText(textNode: Text) {
  return textOrigins.get(textNode);
}

function getOriginalAttribute(element: Element, attribute: string) {
  let map = attributeOrigins.get(element);
  if (!map) {
    map = new Map();
    attributeOrigins.set(element, map);
  }

  return map.get(attribute) ?? null;
}

function setOriginalAttribute(element: Element, attribute: string, value: string) {
  let map = attributeOrigins.get(element);
  if (!map) {
    map = new Map();
    attributeOrigins.set(element, map);
  }

  map.set(attribute, value);
}

function shouldTranslateTextNode(textNode: Text) {
  if (!textNode.nodeValue || textNode.nodeValue.trim().length === 0) {
    return false;
  }

  const parent = textNode.parentElement;
  if (!parent) {
    return false;
  }

  const blockedTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "CODE", "PRE", "TEXTAREA"]);
  if (blockedTags.has(parent.tagName)) {
    return false;
  }

  return true;
}

function translateTextNodes(root: HTMLElement, language: AppLanguage) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const textNode = currentNode as Text;

    if (shouldTranslateTextNode(textNode)) {
      const currentValue = textNode.nodeValue ?? "";
      let original = getOriginalText(textNode);

      if (original === undefined) {
        original = currentValue;
        textOrigins.set(textNode, original);
      } else {
        const expectedCurrent = translateUiText(original, language);
        if (currentValue !== expectedCurrent) {
          original = currentValue;
          textOrigins.set(textNode, original);
        }
      }

      const translated = translateUiText(original, language);
      if (currentValue !== translated) {
        textNode.nodeValue = translated;
      }
    }

    currentNode = walker.nextNode();
  }
}

function translateAttributes(root: HTMLElement, language: AppLanguage) {
  const elements = root.querySelectorAll("*");

  for (const element of elements) {
    for (const attribute of TRANSLATABLE_ATTRIBUTES) {
      if (!element.hasAttribute(attribute)) {
        continue;
      }

      const currentValue = element.getAttribute(attribute);
      if (currentValue === null) {
        continue;
      }

      let original = getOriginalAttribute(element, attribute);
      if (original === null) {
        original = currentValue;
        setOriginalAttribute(element, attribute, original);
      } else {
        const expectedCurrent = translateUiText(original, language);
        if (currentValue !== expectedCurrent) {
          original = currentValue;
          setOriginalAttribute(element, attribute, original);
        }
      }

      const translated = translateUiText(original, language);
      if (currentValue !== translated) {
        element.setAttribute(attribute, translated);
      }
    }
  }
}

function translateDomTree(language: AppLanguage) {
  const root = getRootNode();
  if (!root) {
    return;
  }

  translateTextNodes(root, language);
  translateAttributes(root, language);
}

export function LegacyDomTranslator() {
  const language = useAppLanguageValue();

  useEffect(() => {
    const root = getRootNode();
    if (!root) {
      return;
    }

    translateDomTree(language);

    const observer = new MutationObserver(() => {
      translateDomTree(language);
    });

    observer.observe(root, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: TRANSLATABLE_ATTRIBUTES,
    });

    const raf = window.requestAnimationFrame(() => {
      translateDomTree(language);
    });

    return () => {
      observer.disconnect();
      window.cancelAnimationFrame(raf);
    };
  }, [language]);

  useEffect(() => {
    const originalConfirm = window.confirm.bind(window);
    const originalAlert = window.alert.bind(window);
    const originalPrompt = window.prompt.bind(window);

    window.confirm = (message?: unknown) =>
      originalConfirm(translateUiText(String(message ?? ""), language));
    window.alert = (message?: unknown) =>
      originalAlert(translateUiText(String(message ?? ""), language));
    window.prompt = (message?: unknown, defaultValue?: string) =>
      originalPrompt(translateUiText(String(message ?? ""), language), defaultValue);

    return () => {
      window.confirm = originalConfirm;
      window.alert = originalAlert;
      window.prompt = originalPrompt;
    };
  }, [language]);

  return null;
}
