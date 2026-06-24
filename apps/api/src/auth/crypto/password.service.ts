import { Injectable } from "@nestjs/common";
import { hash, verify } from "@node-rs/argon2";

/** Password hashing with Argon2id (sensible library defaults). */
@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return hash(plain);
  }

  async verify(passwordHash: string, plain: string): Promise<boolean> {
    try {
      return await verify(passwordHash, plain);
    } catch {
      // A malformed/unsupported hash should read as "does not match", never throw to the caller.
      return false;
    }
  }
}
