import { exactEnMessages } from "./messages";
import type { AppLanguage } from "./language";

const phraseRulesEn: Array<[RegExp, string]> = [
  [/\bmot de passe\b/gi, "password"],
  [/\bcompte\b/gi, "account"],
  [/\bconnexion\b/gi, "login"],
  [/\binscription\b/gi, "signup"],
  [/\bdeconnexion\b/gi, "logout"],
  [/\bcharger\b/gi, "load"],
  [/\bchargement\b/gi, "loading"],
  [/\bsauvegarder\b/gi, "save"],
  [/\bsupprimer\b/gi, "delete"],
  [/\bparametres\b/gi, "settings"],
  [/\bentrainement\b/gi, "training"],
  [/\banalyse\b/gi, "analysis"],
  [/\bactivites\b/gi, "activities"],
  [/\bactivite\b/gi, "activity"],
  [/\bjournal securite\b/gi, "security log"],
  [/\bzone critique\b/gi, "danger zone"],
  [/\bpage suivante\b/gi, "next page"],
  [/\bpage precedente\b/gi, "previous page"],
  [/\ben attente\b/gi, "pending"],
  [/\butilisateurs?\b/gi, "users"],
  [/\bwhitelist\b/gi, "whitelist"],
  [/\bbanni\b/gi, "banned"],
  [/\bdebanni\b/gi, "unban"],
  [/\braffraichir\b/gi, "refresh"],
  [/\brafraichir\b/gi, "refresh"],
  [/\bdonnees\b/gi, "data"],
  [/\baujourd'hui\b/gi, "today"],
  [/\bcette semaine\b/gi, "this week"],
  [/\berreur\b/gi, "error"],
  [/\bimpossible\b/gi, "failed"],
];

const wordMapEn: Record<string, string> = {
  acces: "access",
  account: "account",
  actions: "actions",
  activite: "activity",
  activites: "activities",
  admin: "admin",
  administrateur: "administrator",
  administrateurs: "administrators",
  administration: "administration",
  affichee: "displayed",
  afficher: "show",
  affiche: "display",
  all: "all",
  aller: "go",
  analyse: "analysis",
  analyses: "analyses",
  analytics: "analytics",
  annee: "year",
  approuve: "approved",
  approval: "approval",
  approuver: "approve",
  associe: "linked",
  athlete: "athlete",
  attente: "pending",
  aujourd: "today",
  aucun: "none",
  auncun: "none",
  authentification: "authentication",
  automatique: "automatic",
  avec: "with",
  banni: "banned",
  bannir: "ban",
  base: "database",
  bouton: "button",
  cadences: "cadence",
  cadence: "cadence",
  changer: "change",
  charge: "loaded",
  chargement: "loading",
  chart: "chart",
  compte: "account",
  connecter: "connect",
  connecte: "connected",
  connexion: "login",
  contacte: "contact",
  corriger: "fix",
  creer: "create",
  cree: "created",
  csv: "csv",
  danger: "danger",
  data: "data",
  debannir: "unban",
  delete: "delete",
  denivele: "elevation",
  description: "description",
  details: "details",
  distance: "distance",
  donnees: "data",
  echec: "failed",
  edition: "edit",
  email: "email",
  en: "in",
  erreur: "error",
  etat: "status",
  etape: "step",
  etapes: "steps",
  exporter: "export",
  failed: "failed",
  fermer: "close",
  filtre: "filter",
  filtrer: "filter",
  francais: "french",
  gratuit: "free",
  heure: "hour",
  heures: "hours",
  historique: "history",
  impossible: "failed",
  import: "import",
  informations: "information",
  inscrire: "register",
  inscription: "signup",
  invalide: "invalid",
  invalides: "invalid",
  jour: "day",
  journal: "log",
  langue: "language",
  lecture: "read",
  lien: "link",
  limiter: "limit",
  loading: "loading",
  locale: "local",
  locales: "local",
  login: "login",
  logout: "logout",
  majeur: "major",
  mettre: "set",
  metrics: "metrics",
  mise: "update",
  mode: "mode",
  modifier: "edit",
  mois: "month",
  motif: "reason",
  mot: "word",
  mots: "words",
  my: "my",
  non: "not",
  oauth: "oauth",
  page: "page",
  pages: "pages",
  parametre: "setting",
  parametres: "settings",
  passe: "password",
  password: "password",
  payant: "paid",
  paiement: "payment",
  paypal: "paypal",
  pending: "pending",
  plan: "plan",
  plans: "plans",
  plus: "more",
  poids: "weight",
  possible: "possible",
  preferences: "preferences",
  premium: "premium",
  profil: "profile",
  prompt: "prompt",
  quota: "quota",
  quotas: "quotas",
  rapide: "quick",
  ravito: "supporter",
  recents: "recent",
  reconnecte: "reconnect",
  reference: "reference",
  registre: "register",
  register: "register",
  request: "request",
  requete: "request",
  requetes: "requests",
  reset: "reset",
  retourne: "return",
  role: "role",
  sauvegarder: "save",
  securite: "security",
  section: "section",
  sections: "sections",
  semaine: "week",
  session: "session",
  settings: "settings",
  site: "site",
  status: "status",
  strava: "strava",
  supprimer: "delete",
  suspension: "suspension",
  supporter: "supporter",
  tableau: "table",
  temps: "time",
  tentative: "attempt",
  tentatives: "attempts",
  token: "token",
  tokens: "tokens",
  total: "total",
  training: "training",
  update: "update",
  utilisateur: "user",
  utilisateurs: "users",
  validation: "approval",
  valide: "valid",
  verifier: "check",
  verification: "verification",
  version: "version",
  voir: "view",
  vue: "view",
  warning: "warning",
  whitelist: "whitelist",
};

const nonTranslatablePattern =
  /^(https?:\/\/|\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*$|#[0-9A-Fa-f]{3,8}$|rgba?\(|hsla?\(|-?\d+([.,]\d+)?(%|px|rem|em|s|ms)?$)/;

function normalizeWord(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function preserveCase(source: string, translated: string) {
  if (!translated) {
    return translated;
  }

  if (source === source.toUpperCase()) {
    return translated.toUpperCase();
  }

  if (source[0] && source[0] === source[0].toUpperCase()) {
    return translated[0].toUpperCase() + translated.slice(1);
  }

  return translated;
}

function heuristicTranslateToEnglish(value: string) {
  let output = value;

  for (const [pattern, replacement] of phraseRulesEn) {
    output = output.replace(pattern, replacement);
  }

  output = output.replace(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g, (word) => {
    const mapped = wordMapEn[normalizeWord(word)];
    if (!mapped) {
      return word;
    }

    return preserveCase(word, mapped);
  });

  return output;
}

export function translateUiText(value: string, language: AppLanguage) {
  if (language === "fr") {
    return value;
  }

  if (!value || !/[A-Za-zÀ-ÖØ-öø-ÿ]/.test(value)) {
    return value;
  }

  if (nonTranslatablePattern.test(value.trim())) {
    return value;
  }

  if (Object.prototype.hasOwnProperty.call(exactEnMessages, value)) {
    return exactEnMessages[value]!;
  }

  return heuristicTranslateToEnglish(value);
}
