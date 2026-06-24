import { Controller, Get, UseGuards } from "@nestjs/common";
import { AuthService } from "../auth/auth.service";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";

@Controller("me")
@UseGuards(JwtAuthGuard)
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  me(@CurrentSubject() subject: AuthPrincipal) {
    return this.auth.me(subject);
  }
}
