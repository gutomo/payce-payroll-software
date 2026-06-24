import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import {
  type LoginDto,
  LoginSchema,
  type MfaActivateDto,
  MfaActivateSchema,
  type MfaVerifyDto,
  MfaVerifySchema,
  type RefreshDto,
  RefreshSchema,
} from "./auth.dto";
import { AuthService } from "./auth.service";
import type { AuthPrincipal } from "./auth.types";
import { CurrentSubject } from "./decorators";
import { JwtAuthGuard } from "./guards/jwt-auth.guard";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("login")
  @HttpCode(HttpStatus.OK)
  login(@Body(new ZodValidationPipe(LoginSchema)) dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post("mfa/verify")
  @HttpCode(HttpStatus.OK)
  verifyMfa(@Body(new ZodValidationPipe(MfaVerifySchema)) dto: MfaVerifyDto) {
    return this.auth.verifyMfa(dto);
  }

  @Post("mfa/enroll")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  enrollMfa(@CurrentSubject() subject: AuthPrincipal) {
    return this.auth.enrollMfa(subject);
  }

  @Post("mfa/activate")
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard)
  activateMfa(
    @CurrentSubject() subject: AuthPrincipal,
    @Body(new ZodValidationPipe(MfaActivateSchema)) dto: MfaActivateDto,
  ) {
    return this.auth.activateMfa(subject, dto);
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  refresh(@Body(new ZodValidationPipe(RefreshSchema)) dto: RefreshDto) {
    return this.auth.refresh(dto);
  }
}
