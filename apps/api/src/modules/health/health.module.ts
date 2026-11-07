import { Controller, Get, Module } from "@nestjs/common";

@Controller("health")
export class HealthController {
  @Get()
  getHealth() {
    return {
      status: "ok",
      service: "volition-vector-api",
      mode: "liveness",
    } as const;
  }
}

@Module({ controllers: [HealthController] })
export class HealthModule {}
