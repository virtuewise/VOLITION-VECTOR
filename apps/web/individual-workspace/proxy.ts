import { authkitProxy } from "@workos-inc/authkit-nextjs";
import {
  NextResponse,
  type NextFetchEvent,
  type NextRequest,
} from "next/server";

const authProxy = authkitProxy();

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const cookiePassword = process.env["WORKOS_COOKIE_PASSWORD"];
  const configured =
    Boolean(process.env["WORKOS_CLIENT_ID"]) &&
    Boolean(process.env["WORKOS_ISSUER"]) &&
    Boolean(cookiePassword && cookiePassword.length >= 32) &&
    Boolean(process.env["NEXT_PUBLIC_WORKOS_REDIRECT_URI"]);

  if (!configured) {
    return NextResponse.next();
  }

  return authProxy(request, event);
}

// Keep the public /app prefix in the route tree instead of using Next.js
// basePath. Vercel's Next.js 16 proxy integration does not reliably invoke
// proxy.ts for basePath-mounted apps, which prevents AuthKit from forwarding
// its trusted session headers to withAuth().
export const config = {
  matcher: ["/app/:path*"],
};
