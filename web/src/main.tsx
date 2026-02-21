import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { AppLanguageSync } from "./i18n/AppLanguageSync";
import { I18nProvider } from "./i18n/framework";
import { LegacyDomTranslator } from "./i18n/LegacyDomTranslator";
import { initializeAppLanguage } from "./i18n/language";
import "./styles.css";

initializeAppLanguage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppLanguageSync />
        <I18nProvider>
          <LegacyDomTranslator />
          <App />
        </I18nProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
