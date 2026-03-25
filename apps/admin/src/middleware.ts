import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/pricing",
  "/security",
  "/getting-started",
  "/contact",
  "/legal",
  "/terms",
  "/privacy",
  "/acceptable-use",
  "/dpa",
  "/cookie-policy",
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/api/contact",
  "/api/billing/webhook",
  "/api/webhooks/stripe",
  "/api/uploadthing(.*)",
  "/api/webhooks/clerk",
  "/api/device(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect({
      unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
    });
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|png|jpg|jpeg|gif|svg|ico|woff2?|ttf)).*)",
    "/(api|trpc)(.*)",
  ],
};
