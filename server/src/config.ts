import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

const moduleDir = dirname(fileURLToPath(import.meta.url));
const projectEnvPath = resolve(moduleDir, '../.env');

if (existsSync(projectEnvPath)) {
  config({ path: projectEnvPath, override: true });
} else {
  config({ override: true });
}

const normalizedString = (value: unknown) => {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
};

const normalizeWebUrl = (value: unknown) => {
  const normalized = normalizedString(value);
  if (typeof normalized !== 'string') {
    return normalized;
  }

  if (normalized === '*') {
    return normalized;
  }

  try {
    return new URL(normalized).origin;
  } catch {
    return '*';
  }
};

const envSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65535).default(3001),
  WEB_URL: z.preprocess(normalizeWebUrl, z.string().default('*')),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(8),
  STRAVA_CLIENT_ID: z.string().min(1),
  STRAVA_CLIENT_SECRET: z.string().min(1),
  STRAVA_REDIRECT_URI: z.string().url(),
  HF_API_KEY: z.string().optional(),
  HF_MODEL: z
    .string()
    .default('mistralai/Mistral-Small-3.1-24B-Instruct-2503:featherless-ai'),
  HF_MAX_TOKENS: z.coerce.number().int().min(200).max(4000).default(900),
  HF_ROUTER_URL: z
    .string()
    .url()
    .default('https://router.huggingface.co/v1/chat/completions'),
});

export const env = envSchema.parse(process.env);
