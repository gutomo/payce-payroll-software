import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ScimController } from "./scim.controller";
import { ScimAuthGuard } from "./scim-auth.guard";
import { ScimService } from "./scim.service";

/**
 * SCIM 2.0 user provisioning (Phase 7). Inbound API the IdP calls to push joiner/mover/leaver events,
 * authenticated by a per-provider bearer token. PrismaService is global; AuditModule provides the audit
 * trail for every provisioning action.
 */
@Module({
  imports: [AuditModule],
  controllers: [ScimController],
  providers: [ScimService, ScimAuthGuard],
})
export class ScimModule {}
