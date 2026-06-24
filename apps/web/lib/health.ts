export interface HealthStatus {
  status: "ok";
  service: string;
}

export function getHealth(service = "web"): HealthStatus {
  return { status: "ok", service };
}
