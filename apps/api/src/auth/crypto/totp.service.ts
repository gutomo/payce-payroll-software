import { Injectable } from "@nestjs/common";
import { authenticator } from "otplib";

/** TOTP (RFC 6238) enrolment and verification for MFA. */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /** otpauth:// URI for QR enrolment in an authenticator app. */
  keyUri(account: string, issuer: string, secret: string): string {
    return authenticator.keyuri(account, issuer, secret);
  }

  verify(token: string, secret: string): boolean {
    return authenticator.verify({ token, secret });
  }
}
