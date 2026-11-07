import { authkitProxy } from "@workos-inc/authkit-nextjs";
import { NextResponse, type NextRequest } from "next/server";

const authProxy = authkitProxy();

export default function proxy(request: NextRequest) {
  const configured =
    Boolean(process.env["WORKOS_CLIENT_ID"]) &&
    Boolean(process.env["WORKOS_COOKIE_PASSWORD"]) &&
    Boolean(process.env["NEXT_PUBLIC_WORKOS_REDIRECT_URI"]);

  if (!configured) {
    return NextResponse.next();
  }

  return authProxy(request);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
