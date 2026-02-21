import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./contexts/AuthContext";
import { AppLanguageSync } from "./i18n/AppLanguageSync";
import { LegacyDomTranslator } from "./i18n/LegacyDomTranslator";
import { initializeAppLanguage } from "./i18n/language";
import "./styles.css";

initializeAppLanguage();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AppLanguageSync />
        <LegacyDomTranslator />
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
