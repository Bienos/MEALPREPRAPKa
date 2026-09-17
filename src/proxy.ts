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
    return NextResponse.redirect(new URL("/login", request.url));
  }

  return NextResponse.next();
}

export const config = {
  // Everything is behind the gate except Next's own assets, the PWA files the
  // browser fetches before login, and the public health check.
  matcher: [
    "/((?!_next/static|_next/image|api/health|icon.svg|apple-icon.png|icon-192.png|icon-512.png|icon-maskable-512.png|manifest.webmanifest|favicon.ico).*)",
  ],
};
