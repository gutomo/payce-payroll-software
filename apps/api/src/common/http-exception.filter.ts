import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Response } from "express";
import { getRequestContext } from "./request-context";

interface ErrorEnvelope {
  code: string;
  message: string;
  details?: unknown;
}

/** Consistent error envelope: `{ error: { code, message, details?, requestId } }`. Never leaks internals. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = getRequestContext()?.requestId;

    const { status, body } = this.normalize(exception);
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${requestId ?? "-"}] ${body.code}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    response.status(status).json({ error: { ...body, requestId } });
  }

  private normalize(exception: unknown): { status: number; body: ErrorEnvelope } {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === "string") {
        return { status, body: { code: this.codeForStatus(status), message: res } };
      }
      const obj = res as Record<string, unknown>;
      return {
        status,
        body: {
          code: typeof obj.code === "string" ? obj.code : this.codeForStatus(status),
          message:
            typeof obj.message === "string"
              ? obj.message
              : Array.isArray(obj.message)
                ? obj.message.join(", ")
                : this.codeForStatus(status),
          details: obj.details,
        },
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { code: "INTERNAL", message: "Internal server error" },
    };
  }

  private codeForStatus(status: number): string {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "BAD_REQUEST";
      case HttpStatus.UNAUTHORIZED:
        return "UNAUTHORIZED";
      case HttpStatus.FORBIDDEN:
        return "FORBIDDEN";
      case HttpStatus.NOT_FOUND:
        return "NOT_FOUND";
      case HttpStatus.CONFLICT:
        return "CONFLICT";
      default:
        return "ERROR";
    }
  }
}
