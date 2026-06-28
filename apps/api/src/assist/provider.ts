import { BedrockRuntimeClient } from "@aws-sdk/client-bedrock-runtime";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { type AssistProvider, TemplateAssistProvider } from "@payce/assist";
import { BedrockAssistProvider } from "./bedrock.provider";

/**
 * Chooses the Assist LLM provider once, at startup, mirroring {@link StorageService}'s "configured →
 * real client, otherwise local no-op" pattern. When `BEDROCK_MODEL_ID` is set, answers are phrased by
 * Amazon Bedrock; otherwise the deterministic, offline template provider is used so dev/test/CI never
 * need network or AWS credentials. The scoped data and the escalation verdict are identical either way.
 */
@Injectable()
export class AssistProviderService {
  private readonly logger = new Logger(AssistProviderService.name);
  private readonly provider: AssistProvider;

  constructor(config: ConfigService) {
    const modelId = config.get<string>("BEDROCK_MODEL_ID");
    if (modelId) {
      const client = new BedrockRuntimeClient({
        region: config.get<string>("AWS_REGION") ?? "us-east-1",
        ...(config.get<string>("AWS_ENDPOINT_URL")
          ? { endpoint: config.get<string>("AWS_ENDPOINT_URL") }
          : {}),
      });
      this.provider = new BedrockAssistProvider(client, modelId);
      this.logger.log(`Assist provider: bedrock (${modelId})`);
    } else {
      this.provider = new TemplateAssistProvider();
      this.logger.log("Assist provider: template (offline)");
    }
  }

  get(): AssistProvider {
    return this.provider;
  }
}
