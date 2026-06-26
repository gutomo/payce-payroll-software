import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_FILTER } from "@nestjs/core";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { ClaimsModule } from "./claims/claims.module";
import { ContextMiddleware } from "./common/context.middleware";
import { AllExceptionsFilter } from "./common/http-exception.filter";
import { validateEnv } from "./config/env";
import { EmployeesModule } from "./employees/employees.module";
import { HealthController } from "./health/health.controller";
import { HealthService } from "./health/health.service";
import { InsightsModule } from "./insights/insights.module";
import { LeaveModule } from "./leave/leave.module";
import { MeModule } from "./me/me.module";
import { PayrollModule } from "./payroll/payroll.module";
import { PrismaModule } from "./prisma/prisma.module";
import { TenantsModule } from "./tenants/tenants.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: validateEnv }),
    PrismaModule,
    AuditModule,
    AuthModule,
    TenantsModule,
    UsersModule,
    EmployeesModule,
    LeaveModule,
    ClaimsModule,
    PayrollModule,
    InsightsModule,
    MeModule,
  ],
  controllers: [HealthController],
  providers: [HealthService, { provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(ContextMiddleware).forRoutes("*");
  }
}
