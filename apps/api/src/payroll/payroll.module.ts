import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { PayGroupsController } from "./pay-groups.controller";
import { PayGroupsService } from "./pay-groups.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [PayGroupsController],
  providers: [PayGroupsService],
  exports: [PayGroupsService],
})
export class PayrollModule {}
