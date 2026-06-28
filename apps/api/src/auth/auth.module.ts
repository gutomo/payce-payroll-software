import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { AuditModule } from "../audit/audit.module";
import type { Env } from "../config/env";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { PasswordService } from "./crypto/password.service";
import { TotpService } from "./crypto/totp.service";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";
import { PermissionsGuard } from "./guards/permissions.guard";
import { PlatformGuard } from "./guards/platform.guard";
import { SsoController } from "./sso/sso.controller";
import { SsoProviderFactory } from "./sso/sso-provider.factory";
import { SsoService } from "./sso/sso.service";
import { TOKEN_CONFIG, type TokenConfig, TokenService } from "./token.service";

@Module({
  imports: [AuditModule, JwtModule.register({})],
  controllers: [AuthController, SsoController],
  providers: [
    AuthService,
    PasswordService,
    TotpService,
    TokenService,
    SsoService,
    SsoProviderFactory,
    JwtAuthGuard,
    PermissionsGuard,
    PlatformGuard,
    {
      provide: TOKEN_CONFIG,
      useFactory: (config: ConfigService<Env, true>): TokenConfig => ({
        accessSecret: config.get("JWT_ACCESS_SECRET", { infer: true }),
        accessTtl: config.get("ACCESS_TOKEN_TTL", { infer: true }),
        mfaSecret: config.get("JWT_MFA_SECRET", { infer: true }),
        mfaTtl: config.get("MFA_TOKEN_TTL", { infer: true }),
      }),
      inject: [ConfigService],
    },
  ],
  exports: [
    AuthService,
    PasswordService,
    TotpService,
    TokenService,
    JwtAuthGuard,
    PermissionsGuard,
    PlatformGuard,
  ],
})
export class AuthModule {}
