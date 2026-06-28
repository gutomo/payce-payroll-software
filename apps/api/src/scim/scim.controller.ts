import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { type ScimPatchDto, ScimPatchSchema, type ScimUserDto, ScimUserSchema } from "./scim.dto";
import { CurrentScim, ScimAuthGuard, type ScimPrincipal } from "./scim-auth.guard";
import { ScimService } from "./scim.service";

/**
 * SCIM 2.0 provisioning endpoints (under the global /api/v1 prefix → /api/v1/scim/v2/Users). Authn is
 * the per-provider SCIM bearer token (ScimAuthGuard), not a user session. Status codes follow SCIM
 * (201/200/204/404/409); success bodies use the SCIM User/ListResponse schemas.
 */
@Controller("scim/v2")
@UseGuards(ScimAuthGuard)
export class ScimController {
  constructor(private readonly scim: ScimService) {}

  @Post("Users")
  @HttpCode(HttpStatus.CREATED)
  createUser(
    @CurrentScim() principal: ScimPrincipal,
    @Body(new ZodValidationPipe(ScimUserSchema)) dto: ScimUserDto,
  ) {
    return this.scim.createUser(principal, dto);
  }

  @Get("Users/:id")
  getUser(@CurrentScim() principal: ScimPrincipal, @Param("id") id: string) {
    return this.scim.getUser(principal, id);
  }

  @Get("Users")
  listUsers(@CurrentScim() principal: ScimPrincipal, @Query("filter") filter?: string) {
    return this.scim.listUsers(principal, filter);
  }

  @Put("Users/:id")
  replaceUser(
    @CurrentScim() principal: ScimPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ScimUserSchema)) dto: ScimUserDto,
  ) {
    return this.scim.replaceUser(principal, id, dto);
  }

  @Patch("Users/:id")
  patchUser(
    @CurrentScim() principal: ScimPrincipal,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(ScimPatchSchema)) patch: ScimPatchDto,
  ) {
    return this.scim.patchUser(principal, id, patch);
  }

  @Delete("Users/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteUser(@CurrentScim() principal: ScimPrincipal, @Param("id") id: string) {
    return this.scim.deleteUser(principal, id);
  }
}
