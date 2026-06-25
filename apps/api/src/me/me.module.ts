import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { EmployeesModule } from "../employees/employees.module";
import { MeController } from "./me.controller";

@Module({
  imports: [AuthModule, EmployeesModule],
  controllers: [MeController],
})
export class MeModule {}
