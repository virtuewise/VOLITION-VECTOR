import { describe, expect, it } from "vitest";
import {
  isBusinessCallbackUri,
  isBusinessSignedOutUri,
} from "./auth-config";

describe("Business Workspace AuthKit redirect URIs", () => {
  it("accepts the exact HTTPS callback route", () => {
    expect(
      isBusinessCallbackUri("https://business.example.com/business/callback"),
    ).toBe(true);
  });

  it("accepts the exact localhost callback route for local development", () => {
    expect(
      isBusinessCallbackUri("http://localhost:3003/business/callback"),
    ).toBe(true);
  });

  it("rejects another app's callback and unsafe callback origins", () => {
    expect(
      isBusinessCallbackUri("https://example.com/app/callback"),
    ).toBe(false);
    expect(
      isBusinessCallbackUri("http://business.example.com/business/callback"),
    ).toBe(false);
    expect(
      isBusinessCallbackUri(
        "https://user:password@business.example.com/business/callback",
      ),
    ).toBe(false);
    expect(
      isBusinessCallbackUri(
        "https://business.example.com/business/callback?next=/",
      ),
    ).toBe(false);
  });

  it("accepts only the public Business Workspace signed-out route", () => {
    expect(
      isBusinessSignedOutUri(
        "https://business.example.com/business/signed-out",
      ),
    ).toBe(true);
    expect(
      isBusinessSignedOutUri("http://127.0.0.1:3003/business/signed-out"),
    ).toBe(true);
    expect(
      isBusinessSignedOutUri("https://business.example.com/business/"),
    ).toBe(false);
    expect(
      isBusinessSignedOutUri("https://business.example.com/app/"),
    ).toBe(false);
    expect(isBusinessSignedOutUri(undefined)).toBe(false);
  });
});
