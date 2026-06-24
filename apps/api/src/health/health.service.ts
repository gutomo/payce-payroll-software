import { Injectable } from "@nestjs/common";

export interface HealthStatus {
  status: "ok";
  service: string;
  uptimeSeconds: number;
}

@Injectable()
export class HealthService {
  check(): HealthStatus {
    return {
      status: "ok",
      service: "api",
      uptimeSeconds: Math.floor(process.uptime()),
    };
  }
}
