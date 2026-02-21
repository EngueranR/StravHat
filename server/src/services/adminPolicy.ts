import { env } from "../config.js";
import { normalizeEmail } from "../utils/security.js";

function parseAdminEmails(raw: string) {
  const emails = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => {
      try {
        return normalizeEmail(value);
      } catch {
        return null;
      }
    })
    .filter((value): value is string => value !== null);

  if (emails.length === 0) {
    return new Set<string>(["hub+stravhat@engueranr.com"]);
  }

  return new Set<string>(emails);
}

const adminEmails = parseAdminEmails(env.ADMIN_EMAILS);

export function isConfiguredAdminEmail(email: string) {
  return adminEmails.has(normalizeEmail(email));
}

export function getConfiguredAdminEmails() {
  return [...adminEmails];
}
