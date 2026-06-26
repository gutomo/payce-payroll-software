import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

const PRESIGN_TTL_SECONDS = 3600; // 1 hour

@Injectable()
export class StorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string | null;

  constructor(config: ConfigService) {
    const bucket = config.get<string>("S3_BUCKET_PAYSLIPS");
    if (bucket) {
      this.bucket = bucket;
      this.client = new S3Client({
        region: config.get<string>("AWS_REGION") ?? "us-east-1",
        ...(config.get<string>("AWS_ENDPOINT_URL")
          ? { endpoint: config.get<string>("AWS_ENDPOINT_URL"), forcePathStyle: true }
          : {}),
      });
    } else {
      this.bucket = null;
      this.client = null;
    }
  }

  /** Upload an object. No-op when S3 is not configured (local/test). */
  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    if (!this.client || !this.bucket) return;
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /**
   * Generate a presigned GET URL for a stored object.
   * When S3 is not configured, returns a local placeholder URL so the DB record and endpoint
   * contract still work in development / integration tests.
   */
  async presignedUrl(key: string, expiresIn = PRESIGN_TTL_SECONDS): Promise<string> {
    if (!this.client || !this.bucket) {
      return `http://localhost:4566/payce-payslips-local/${key}`;
    }
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, cmd, { expiresIn });
  }
}
