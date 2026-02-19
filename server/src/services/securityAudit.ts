import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { hashAuditValue } from "../utils/security.js";

const SENSITIVE_FIELD_PATTERN =
  /password|secret|token|authorization|cookie|refresh|access|credential/i;
const MAX_METADATA_DEPTH = 4;
const MAX_STRING_LENGTH = 600;

function clampString(value: string) {
  return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}...` : value;
}

function redactMetadata(value: unknown, depth = 0): Prisma.InputJsonValue {
  if (value === null || value === undefined) {
    return "[null]";
  }

  if (typeof value === "string") {
    return clampString(value);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= MAX_METADATA_DEPTH) {
    return "[truncated]";
  }

  if (Array.isArray(value)) {
    return value.slice(0, 40).map((item) => redactMetadata(item, depth + 1));
  }

  if (typeof value === "object") {
    const output: Record<string, Prisma.InputJsonValue> = {};

    for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_FIELD_PATTERN.test(key)) {
        output[key] = "[redacted]";
        continue;
      }

      output[key] = redactMetadata(fieldValue, depth + 1);
    }

    return output;
  }

  return "[unsupported]";
}

export interface SecurityEventInput {
  eventType: string;
  success: boolean;
  userId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown> | null;
}

export async function logSecurityEvent(input: SecurityEventInput) {
  const ipHash =
    input.ip && input.ip.trim().length > 0 ? hashAuditValue(input.ip.trim()) : null;
  const metadata: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput =
    input.metadata ? redactMetadata(input.metadata) : Prisma.DbNull;

  try {
    await prisma.securityEvent.create({
      data: {
        eventType: input.eventType,
        success: input.success,
        userId: input.userId ?? null,
        ipHash,
        metadata,
      },
    });
  } catch {
    // Audit logging failures must not block the main request flow.
  }
}
