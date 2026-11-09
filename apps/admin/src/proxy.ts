import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/webhooks/clerk",
  "/api/device(.*)",
]);

const proxy = clerkMiddleware(async (auth, req) => {
  const localMockMode =
    process.env.NODE_ENV !== "production" &&
    ["1", "true", "yes", "on"].includes((process.env.SHOWROOM_MOCK_MODE ?? "").toLowerCase());
  if (localMockMode) return NextResponse.next();

  if (!isPublicRoute(req)) {
    // Keep where the visitor was going (for example the pairing link a TV shows
    // as a QR code, /screens?claim=CODE) so sign-in returns them there.
    const signIn = new URL("/sign-in", req.url);
    if (req.method === "GET" && !req.nextUrl.pathname.startsWith("/api/")) {
      signIn.searchParams.set("redirect_url", req.nextUrl.pathname + req.nextUrl.search);
    }
    await auth.protect({ unauthenticatedUrl: signIn.toString() });
  }
});

export default proxy;

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|png|jpg|jpeg|gif|svg|ico|woff2?|ttf)).*)",
    "/(api|trpc)(.*)",
  ],
};
