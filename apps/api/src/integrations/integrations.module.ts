import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { EmployeesModule } from "../employees/employees.module";
import { IntegrationsController, WebhooksController } from "./integrations.controller";
import { IntegrationsService } from "./integrations.service";

/**
 * Integrations framework (Phase 7). A typed connector runs idempotent inbound syncs that reuse the
 * existing employee-import pipeline, and registered webhooks receive signed outbound deliveries.
 */
@Module({
  imports: [AuthModule, AuditModule, EmployeesModule],
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationsService],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}
