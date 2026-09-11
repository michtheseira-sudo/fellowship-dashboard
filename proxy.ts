import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal HTTP Basic Auth gate. This is an internal, not-customer-facing
 * tool that will otherwise sit at a public Vercel URL - this keeps it out
 * of search engines and casual link-sharing without needing a full
 * auth provider for a small internal team.
 *
 * Set DASHBOARD_USERNAME / DASHBOARD_PASSWORD in Vercel env vars.
 * If either is unset, the middleware is a no-op (useful for local dev).
 *
 * For anything beyond a handful of people, or if the team already has
 * SSO (Google Workspace, Okta, etc.), swap this for a proper auth
 * provider instead - Basic Auth credentials are shared, not personal,
 * and don't support revoking individual access.
 */
export function proxy(req: NextRequest) {
  const user = process.env.DASHBOARD_USERNAME;
  const pass = process.env.DASHBOARD_PASSWORD;

  if (!user || !pass) return NextResponse.next();

  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const [scheme, encoded] = authHeader.split(" ");
    if (scheme === "Basic" && encoded) {
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const [reqUser, reqPass] = decoded.split(":");
      if (reqUser === user && reqPass === pass) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Fellowship Dashboard"' },
  });
}

export const config = {
  // Protect everything except Next's own static/image assets.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
