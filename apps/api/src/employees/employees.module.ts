import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmployeesController } from "./employees.controller";
import { EmployeesService } from "./employees.service";
import { OrgController } from "./org.controller";

@Module({
  imports: [AuthModule],
  controllers: [EmployeesController, OrgController],
  providers: [EmployeesService],
  exports: [EmployeesService],
})
export class EmployeesModule {}
