import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE, isValidSessionToken } from "@/lib/auth/session";

/**
 * Private app: every page except /login requires a valid session cookie.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authed = await isValidSessionToken(request.cookies.get(SESSION_COOKIE)?.value);

  if (pathname === "/login") {
    return authed ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }

  if (!authed) {
    // Rewrite, not redirect: the gate has to answer at the URL that was asked
    // for. A redirect means a shared link carries no metadata of its own, and
    // link crawlers give up before following it to /login, so previews came out
    // blank. The address bar also keeps the original link through logging in.
    return NextResponse.rewrite(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything is behind the gate except Next's own assets, the PWA files the
  // browser fetches before login, the public health check, and the share card,
  // which a messaging app fetches unauthenticated or not at all. The card is
  // branding and the day targets, nothing private.
  matcher: [
    "/((?!_next/static|_next/image|api/health|opengraph-image|icon.svg|apple-icon.png|icon-192.png|icon-512.png|icon-maskable-512.png|manifest.webmanifest|favicon.ico).*)",
  ],
};
