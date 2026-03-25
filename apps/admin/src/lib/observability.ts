import * as Sentry from "@sentry/nextjs";

type LogLevel = "info" | "warn" | "error";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      name: error.name,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

export function logStructuredEvent(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
) {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  });

  if (level === "error") {
    console.error(payload);
    return;
  }

  if (level === "warn") {
    console.warn(payload);
    return;
  }

  console.info(payload);
}

export function captureServerError(
  error: unknown,
  context: {
    event: string;
    route: string;
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
) {
  const normalized =
    error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown error");

  logStructuredEvent("error", context.event, {
    route: context.route,
    error: serializeError(normalized),
    ...context.extra,
  });

  Sentry.withScope((scope) => {
    scope.setTag("route", context.route);
    for (const [key, value] of Object.entries(context.tags ?? {})) {
      scope.setTag(key, value);
    }
    for (const [key, value] of Object.entries(context.extra ?? {})) {
      scope.setExtra(key, value);
    }
    Sentry.captureException(normalized);
  });

  return normalized;
}
