import type { AppLanguage } from "./language";

const frMessages = {
  "common.sessionLoading": "Chargement session...",
  "common.logout": "Deconnexion",
  "common.more": "Plus",
  "common.notLinked": "non lie",
  "common.athleteId": "ID athlete",
  "common.noExtraSections": "Aucune section supplementaire.",

  "nav.settings": "Parametres",
  "nav.activities": "Activites",
  "nav.analytics": "Analyse",
  "nav.trainingPlan": "Plan d'entrainement",
  "nav.exportCsv": "Export CSV",
  "nav.admin": "Administration",

  "layout.stravaSetupRequired":
    "Configuration Strava requise pour debloquer l'application.",
  "layout.mobileMenuTitle": "Menu mobile",
  "layout.mobileMenuSubtitle": "Sections secondaires et compte",
  "layout.closePanelAria": "Fermer le panneau",

  "pages.settings.title": "Parametres",
  "pages.settings.description":
    "Profil, unites, import Strava, suppression des donnees et deconnexion.",
  "pages.activities.title": "Activites",
  "pages.activities.description": "Historique complet avec filtres/tri/recherche.",
  "pages.analytics.title": "Analyse",
  "pages.analytics.description":
    "Analyse organisee par themes: sante, pronostic, charge, performance et progres.",
  "pages.correlationBuilder.title": "Constructeur de correlations",
  "pages.import.title": "Centre d'import",
  "pages.activityDetail.title": "Detail activite",
  "pages.activityDetail.backToActivities": "Retour activites",

  "landing.simplePath.step1": "1) Connexion / Inscription",
  "landing.simplePath.step3": "3) Parametres: Import des activites puis analyses",

  "stravaConnect.redirectToSettingsImport":
    "Apres validation Strava, tu seras redirige automatiquement vers Parametres (section Import).",

  "analytics.view.analysis": "Analyse",
  "analytics.view.progress": "Progres",
  "analytics.view.correlations": "Correlations",
  "analytics.goalNotDefinedInSettings": "Objectif non defini dans Parametres.",
  "analytics.skillsSubtitleWithSettings":
    "Profil global base sur toutes les seances + objectif defini dans Parametres",
  "analytics.profileSubtitleWithSettings":
    "Base: donnees profil (Parametres) + activites filtrees de la periode.",
} as const;

export type I18nMessageKey = keyof typeof frMessages;

const enMessages: Record<I18nMessageKey, string> = {
  "common.sessionLoading": "Loading session...",
  "common.logout": "Log out",
  "common.more": "More",
  "common.notLinked": "not linked",
  "common.athleteId": "Athlete ID",
  "common.noExtraSections": "No extra sections.",

  "nav.settings": "Settings",
  "nav.activities": "Activities",
  "nav.analytics": "Analytics",
  "nav.trainingPlan": "Training plan",
  "nav.exportCsv": "CSV export",
  "nav.admin": "Administration",

  "layout.stravaSetupRequired":
    "Strava configuration is required to unlock the app.",
  "layout.mobileMenuTitle": "Mobile menu",
  "layout.mobileMenuSubtitle": "Secondary sections and account",
  "layout.closePanelAria": "Close panel",

  "pages.settings.title": "Settings",
  "pages.settings.description":
    "Profile, units, Strava import, data deletion and logout.",
  "pages.activities.title": "Activities",
  "pages.activities.description":
    "Full history with filters/sorting/search.",
  "pages.analytics.title": "Analytics",
  "pages.analytics.description":
    "Analytics organized by themes: health, forecast, load, performance and progress.",
  "pages.correlationBuilder.title": "Correlation builder",
  "pages.import.title": "Import center",
  "pages.activityDetail.title": "Activity details",
  "pages.activityDetail.backToActivities": "Back to activities",

  "landing.simplePath.step1": "1) Sign in / Register",
  "landing.simplePath.step3": "3) Settings: Import activities then analytics",

  "stravaConnect.redirectToSettingsImport":
    "After Strava validation, you will be redirected to Settings (Import section).",

  "analytics.view.analysis": "Analysis",
  "analytics.view.progress": "Progress",
  "analytics.view.correlations": "Correlations",
  "analytics.goalNotDefinedInSettings": "Goal not defined in Settings.",
  "analytics.skillsSubtitleWithSettings":
    "Global profile based on all sessions + objective defined in Settings",
  "analytics.profileSubtitleWithSettings":
    "Base: profile data (Settings) + filtered activities for the period.",
};

const messagesByLanguage: Record<AppLanguage, Record<I18nMessageKey, string>> = {
  fr: frMessages,
  en: enMessages,
};

export function getMessage(language: AppLanguage, key: I18nMessageKey) {
  return messagesByLanguage[language][key];
}

