import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { PERMISSIONS } from "@payce/rbac";
import type { AuthPrincipal } from "../auth/auth.types";
import { CurrentSubject, RequirePermissions } from "../auth/decorators";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { PermissionsGuard } from "../auth/guards/permissions.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { type ListEmployeesQuery, ListEmployeesSchema } from "./employees.dto";
import { EmployeesImportService } from "./employees-import.service";
import { EmployeesService } from "./employees.service";

@Controller("employees")
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions(PERMISSIONS.ORG_EMPLOYEE_READ)
export class EmployeesController {
  constructor(
    private readonly employees: EmployeesService,
    private readonly imports: EmployeesImportService,
  ) {}

  @Get()
  list(
    @CurrentSubject() subject: AuthPrincipal,
    @Query(new ZodValidationPipe(ListEmployeesSchema)) query: ListEmployeesQuery,
  ) {
    return this.employees.list(subject, query);
  }

  /**
   * Bulk import employees from a CSV upload (multipart field `file`). Defaults to a dry run that only
   * reports per-row validation errors; pass `?commit=true` to insert the valid rows. Requires the
   * employee-manage permission (overrides the controller-level read requirement).
   */
  @Post("import")
  @RequirePermissions(PERMISSIONS.ORG_EMPLOYEE_MANAGE)
  @UseInterceptors(FileInterceptor("file"))
  importCsv(
    @CurrentSubject() subject: AuthPrincipal,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query("commit") commit?: string,
  ) {
    if (!file) {
      throw new BadRequestException({
        code: "NO_FILE",
        message: "CSV file required (field 'file')",
      });
    }
    return this.imports.importCsv(subject, file.buffer, commit === "true");
  }

  @Get(":id")
  getById(@CurrentSubject() subject: AuthPrincipal, @Param("id") id: string) {
    return this.employees.getById(subject, id);
  }
}
