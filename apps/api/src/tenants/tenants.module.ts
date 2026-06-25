import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { AuthModule } from "../auth/auth.module";
import { TenantsController } from "./tenants.controller";
import { TenantsService } from "./tenants.service";

@Module({
  imports: [AuthModule, AuditModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
