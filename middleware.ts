import { NextRequest, NextResponse } from "next/server";

import { apexToWwwRedirectUrl } from "@/lib/http/apex-www-redirect";

export function middleware(request: NextRequest) {
  const destination = apexToWwwRedirectUrl(
    request.headers.get("host"),
    request.nextUrl,
    request.headers.get("x-forwarded-host")
  );
  if (!destination) {
    return NextResponse.next();
  }

  return NextResponse.redirect(destination, 301);
}

export const config = {
  matcher: ["/", "/((?!_next/static|_next/image).*)"]
};
