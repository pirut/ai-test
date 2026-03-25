type LogLevel = "info" | "warn" | "error";

function serializeError(error: unknown) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    message: String(error),
  };
}

export function isUnauthorizedDeviceError(error: unknown) {
  return error instanceof Error && /Unauthorized device/i.test(error.message);
}

export function logConvexEvent(
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

  console.log(payload);
}

export function logConvexError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
) {
  logConvexEvent("error", event, {
    ...fields,
    error: serializeError(error),
  });
}
