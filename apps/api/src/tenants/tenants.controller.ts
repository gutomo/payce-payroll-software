import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { PlatformGuard } from "../auth/guards/platform.guard";
import { type CreateTenantDto, CreateTenantSchema } from "./tenants.dto";
import { TenantsService } from "./tenants.service";

@Controller("tenants")
@UseGuards(PlatformGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  create(@Body(new ZodValidationPipe(CreateTenantSchema)) dto: CreateTenantDto) {
    return this.tenants.create(dto);
  }
}
