import { ConvexError } from "convex/values";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { hasConvexBackend } from "@/lib/env";

// Turns a failure inside a dashboard API route into a response the page can
// show. Without this every rejected request surfaced as a bare 500, and the
// operator never saw why (for example "Releases are managed by the platform
// operator" or "Playlist not found").

const statusByMessage: Array<[RegExp, number]> = [
  [/not found/i, 404],
  [/Authentication required|Organization context required/i, 401],
  [/Admin role required|managed by the platform operator|not authorized/i, 403],
  [/already rolling out/i, 409],
];

function backendMessage(error: unknown) {
  if (error instanceof ConvexError) {
    return typeof error.data === "string" ? error.data : null;
  }
  if (error instanceof Error) {
    // The local mock backend throws plain errors with operator-facing text.
    if (!hasConvexBackend()) return error.message;
    // Convex wraps application errors as "... Uncaught ConvexError: <text>".
    const match = /ConvexError: ([^\n]+)/.exec(error.message);
    return match?.[1]?.trim() ?? null;
  }
  return null;
}

export function apiErrorResponse(error: unknown, fallback = "Something went wrong. Try again.") {
  if (error instanceof SyntaxError) {
    return NextResponse.json({ error: "The request was not valid JSON" }, { status: 400 });
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    const field = issue?.path.length ? `${issue.path.join(".")}: ` : "";
    return NextResponse.json(
      { error: issue ? `${field}${issue.message}` : "Invalid request" },
      { status: 400 },
    );
  }

  const message = backendMessage(error);
  if (message) {
    const status = statusByMessage.find(([pattern]) => pattern.test(message))?.[1] ?? 400;
    return NextResponse.json({ error: message }, { status });
  }

  console.error("Dashboard API request failed", error);
  return NextResponse.json({ error: fallback }, { status: 500 });
}

// Wraps a route handler so thrown errors become JSON responses.
export function withApiErrors<Args extends unknown[]>(
  handler: (...args: Args) => Promise<Response>,
  fallback?: string,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await handler(...args);
    } catch (error) {
      // Next.js signals redirects and not-found by throwing; let those through.
      if (error && typeof error === "object" && "digest" in error) throw error;
      return apiErrorResponse(error, fallback);
    }
  };
}
