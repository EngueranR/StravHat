import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { createClient } from "redis";
import { env } from "../config.js";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEYLEN = 64;
const AUTH_AAD = Buffer.from("stravhat:strava-app-credentials:v1", "utf8");

const encryptionKey = (() => {
  const key = Buffer.from(env.STRAVA_CREDENTIALS_ENCRYPTION_KEY, "base64");

  if (key.length !== 32) {
    throw new Error(
      "STRAVA_CREDENTIALS_ENCRYPTION_KEY must be a base64-encoded 32-byte value",
    );
  }

  return key;
})();

interface RateLimitBucket {
  count: number;
  resetAtMs: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();
const REDIS_BACKOFF_MS = 30_000;
type RedisClient = ReturnType<typeof createClient>;
let redisClient: RedisClient | null = null;
let redisConnectPromise: Promise<RedisClient | null> | null = null;
let redisDisabledUntil = 0;

function runScrypt(
  password: string,
  salt: Buffer,
  keyLength: number,
  options: { N: number; r: number; p: number },
) {
  return new Promise<Buffer>((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      keyLength,
      {
        ...options,
        maxmem: 64 * 1024 * 1024,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }

        resolve(derivedKey as Buffer);
      },
    );
  });
}

export function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

export function passwordPolicyError(password: string) {
  if (password.length < 12) {
    return "Le mot de passe doit contenir au moins 12 caracteres.";
  }

  if (password.length > 128) {
    return "Le mot de passe est trop long (max 128 caracteres).";
  }

  if (!/[a-z]/.test(password)) {
    return "Le mot de passe doit contenir au moins une lettre minuscule.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Le mot de passe doit contenir au moins une lettre majuscule.";
  }

  if (!/[0-9]/.test(password)) {
    return "Le mot de passe doit contenir au moins un chiffre.";
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Le mot de passe doit contenir au moins un caractere special.";
  }

  return null;
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await runScrypt(`${password}${env.AUTH_PASSWORD_PEPPER}`, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });

  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt.toString("base64")}$${derived.toString("base64")}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  const parts = storedHash.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const salt = Buffer.from(parts[4], "base64");
  const expected = Buffer.from(parts[5], "base64");

  if (
    !Number.isInteger(n) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    salt.length === 0 ||
    expected.length === 0
  ) {
    return false;
  }

  const derived = await runScrypt(`${password}${env.AUTH_PASSWORD_PEPPER}`, salt, expected.length, {
    N: n,
    r,
    p,
  });

  if (derived.length !== expected.length) {
    return false;
  }

  return timingSafeEqual(derived, expected);
}

async function getRedisClient() {
  if (!env.REDIS_URL) {
    return null;
  }

  if (Date.now() < redisDisabledUntil) {
    return null;
  }

  if (redisClient?.isOpen) {
    return redisClient;
  }

  if (redisConnectPromise) {
    return redisConnectPromise;
  }

  redisConnectPromise = (async () => {
    const client = createClient({
      url: env.REDIS_URL,
      socket: {
        reconnectStrategy: false,
      },
    });

    client.on("error", () => {
      redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
    });

    try {
      await client.connect();
      redisClient = client;
      return client;
    } catch {
      redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
      try {
        if (client.isOpen) {
          await client.quit();
        }
      } catch {
        // ignore cleanup errors
      }
      return null;
    }
  })().finally(() => {
    redisConnectPromise = null;
  });

  return redisConnectPromise;
}

function enforceRateLimitMemory(input: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const now = Date.now();

  if (rateLimitBuckets.size > 5000) {
    for (const [bucketKey, bucket] of rateLimitBuckets.entries()) {
      if (bucket.resetAtMs <= now) {
        rateLimitBuckets.delete(bucketKey);
      }
    }
  }

  const existing = rateLimitBuckets.get(input.key);

  if (!existing || existing.resetAtMs <= now) {
    rateLimitBuckets.set(input.key, {
      count: 1,
      resetAtMs: now + input.windowMs,
    });

    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(input.limit - 1, 0),
    };
  }

  if (existing.count >= input.limit) {
    return {
      allowed: false,
      retryAfterSec: Math.max(Math.ceil((existing.resetAtMs - now) / 1000), 1),
      remaining: 0,
    };
  }

  existing.count += 1;
  rateLimitBuckets.set(input.key, existing);

  return {
    allowed: true,
    retryAfterSec: 0,
    remaining: Math.max(input.limit - existing.count, 0),
  };
}

export async function enforceRateLimit(input: {
  key: string;
  limit: number;
  windowMs: number;
}) {
  const redis = await getRedisClient();

  if (!redis) {
    return enforceRateLimitMemory(input);
  }

  const redisKey = `rl:${input.key}`;

  try {
    const currentCount = await redis.incr(redisKey);

    if (currentCount === 1) {
      await redis.pExpire(redisKey, input.windowMs);
    }

    let ttlMs = await redis.pTTL(redisKey);

    if (ttlMs <= 0) {
      await redis.pExpire(redisKey, input.windowMs);
      ttlMs = input.windowMs;
    }

    if (currentCount > input.limit) {
      return {
        allowed: false,
        retryAfterSec: Math.max(Math.ceil(ttlMs / 1000), 1),
        remaining: 0,
      };
    }

    return {
      allowed: true,
      retryAfterSec: 0,
      remaining: Math.max(input.limit - currentCount, 0),
    };
  } catch {
    redisDisabledUntil = Date.now() + REDIS_BACKOFF_MS;
    return enforceRateLimitMemory(input);
  }
}

export async function authDelay(ms = 300) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
  cipher.setAAD(AUTH_AAD);

  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${encrypted.toString("base64")}`;
}

export function isEncryptedSecret(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith("v1:");
}

export function decryptSecret(payload: string) {
  const parts = payload.split(":");

  if (parts.length !== 4 || parts[0] !== "v1") {
    throw new Error("Encrypted payload format not supported");
  }

  const iv = Buffer.from(parts[1], "base64");
  const tag = Buffer.from(parts[2], "base64");
  const ciphertext = Buffer.from(parts[3], "base64");

  if (iv.length !== 12 || tag.length !== 16 || ciphertext.length === 0) {
    throw new Error("Encrypted payload invalid");
  }

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey, iv);
  decipher.setAAD(AUTH_AAD);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString("utf8");
}

export function decryptSecretIfEncrypted(payload: string) {
  if (isEncryptedSecret(payload)) {
    return decryptSecret(payload);
  }

  return payload;
}

export function hashAuditValue(value: string) {
  return createHmac("sha256", env.AUDIT_LOG_KEY)
    .update(value)
    .digest("hex");
}
