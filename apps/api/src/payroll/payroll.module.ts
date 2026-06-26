import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { StorageModule } from "../storage/storage.module";
import { BankFileService } from "./bank-file.service";
import { PayGroupsController } from "./pay-groups.controller";
import { PayGroupsService } from "./pay-groups.service";
import { PayslipService } from "./payslip.service";
import { RunsController } from "./runs.controller";
import { RunsService } from "./runs.service";

@Module({
  imports: [AuthModule, AuditModule, StorageModule],
  controllers: [PayGroupsController, RunsController],
  providers: [PayGroupsService, RunsService, PayslipService, BankFileService],
  exports: [PayGroupsService, RunsService, PayslipService, BankFileService],
})
export class PayrollModule {}
