import { Controller, Get, Module } from "@nestjs/common";
@Controller("health") class HealthController {@Get() getHealth(){return {status:"ok",service:"volition-vector-api",readiness:"scaffold-only"};}}
@Module({controllers:[HealthController]}) export class HealthModule {}
