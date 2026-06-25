import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { EmployeesController } from "./employees.controller";
import { EmployeesImportService } from "./employees-import.service";
import { EmployeesService } from "./employees.service";
import { OrgController } from "./org.controller";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [EmployeesController, OrgController],
  providers: [EmployeesService, EmployeesImportService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
