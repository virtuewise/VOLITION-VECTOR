const BUSINESS_CALLBACK_PATH = "/business/callback";
const BUSINESS_SIGNED_OUT_PATH = "/business/signed-out";

function isAllowedBusinessRedirectUri(
  value: string | undefined,
  expectedPath: string,
): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    const isSecure = url.protocol === "https:";
    const isLocalHttp =
      url.protocol === "http:" &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1");

    return (
      (isSecure || isLocalHttp) &&
      url.pathname === expectedPath &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

export function isBusinessCallbackUri(value: string | undefined): boolean {
  return isAllowedBusinessRedirectUri(value, BUSINESS_CALLBACK_PATH);
}

export function isBusinessSignedOutUri(value: string | undefined): boolean {
  return isAllowedBusinessRedirectUri(value, BUSINESS_SIGNED_OUT_PATH);
}
