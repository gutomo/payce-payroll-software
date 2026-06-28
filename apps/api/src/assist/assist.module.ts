import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { ClaimsModule } from "../claims/claims.module";
import { EmployeesModule } from "../employees/employees.module";
import { LeaveModule } from "../leave/leave.module";
import { AssistController } from "./assist.controller";
import { AssistService } from "./assist.service";
import { AssistToolsService } from "./assist.tools";
import { AssistProviderService } from "./provider";

/**
 * Assist (Phase 6). Wires the AI assistant over the existing tenant-scoped domain services
 * (leave/claims/employees) so every data tool inherits their RBAC + RLS guarantees, plus the
 * pluggable LLM provider (Bedrock or the offline template fallback).
 */
@Module({
  imports: [AuthModule, AuditModule, LeaveModule, ClaimsModule, EmployeesModule],
  controllers: [AssistController],
  providers: [AssistService, AssistToolsService, AssistProviderService],
  exports: [AssistService],
})
export class AssistModule {}
