import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { AppModule } from "../../app.module.js";
import { HealthController, HealthModule } from "./health.module.js";

describe("HealthModule", () => {
  it("is registered by the API root module", () => {
    const imports = Reflect.getMetadata("imports", AppModule) as unknown[];

    expect(imports).toContain(HealthModule);
  });

  it("returns a minimal liveness response without claiming dependency readiness", () => {
    expect(new HealthController().getHealth()).toEqual({
      status: "ok",
      service: "volition-vector-api",
      mode: "liveness",
    });
  });
});
