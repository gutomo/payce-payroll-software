import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { requestContextStorage } from "./request-context";

/** Establishes the per-request context (request id + client IP) for the duration of the request. */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const headerId = req.headers["x-request-id"];
    const requestId = (Array.isArray(headerId) ? headerId[0] : headerId) ?? randomUUID();
    res.setHeader("x-request-id", requestId);
    requestContextStorage.run({ requestId, ip: req.ip }, () => {
      next();
    });
  }
}
