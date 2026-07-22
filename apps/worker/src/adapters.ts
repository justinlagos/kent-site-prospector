import path from "node:path";
import {
  BusinessDirectoryAdapter,
  CompanyRegistryAdapter,
  DeployAdapter,
  EmailProviderAdapter,
  EmailValidationAdapter,
  Env,
  LlmAdapter,
  type Logger,
} from "@ksp/shared";
import {
  GooglePlacesAdapter,
  MockDirectoryAdapter,
  CompaniesHouseAdapter,
  MockRegistryAdapter,
  HttpEmailValidationAdapter,
  MockEmailValidationAdapter,
} from "@ksp/discovery";
import { AnthropicAdapter, MockLlmAdapter, OpenAiCompatAdapter } from "@ksp/research";
import { NetlifyAdapter, MockDeployAdapter } from "@ksp/deployment";
import { PostmarkAdapter, MockEmailProviderAdapter } from "@ksp/email";

export interface Adapters {
  directory: BusinessDirectoryAdapter;
  registry: CompanyRegistryAdapter;
  emailValidation: EmailValidationAdapter;
  llm: LlmAdapter;
  deployer: DeployAdapter;
  emailProvider: EmailProviderAdapter;
}

/** Config-driven adapter factory. Production refuses mocks at loadEnv() time already. */
export function buildAdapters(env: Env, logger: Logger): Adapters {
  const varDir = path.resolve(env.VAR_DIR);

  return {
    directory:
      env.DIRECTORY_ADAPTER === "real"
        ? new GooglePlacesAdapter(env.GOOGLE_PLACES_API_KEY!, logger.child({ adapter: "places" }))
        : new MockDirectoryAdapter(),
    registry:
      env.REGISTRY_ADAPTER === "real"
        ? new CompaniesHouseAdapter(env.COMPANIES_HOUSE_API_KEY!, logger.child({ adapter: "companies-house" }))
        : new MockRegistryAdapter(),
    emailValidation:
      env.EMAIL_VALIDATION_ADAPTER === "real"
        ? new HttpEmailValidationAdapter(
            env.EMAIL_VALIDATION_API_URL ?? "https://api.zerobounce.net/v2/validate",
            env.EMAIL_VALIDATION_API_KEY!,
            logger.child({ adapter: "email-validation" }),
          )
        : new MockEmailValidationAdapter(),
    llm:
      env.LLM_ADAPTER !== "real"
        ? new MockLlmAdapter()
        : env.LLM_PROVIDER === "openai-compatible"
          ? new OpenAiCompatAdapter(
              env.OPENAI_COMPAT_BASE_URL!,
              env.OPENAI_COMPAT_API_KEY,
              env.OPENAI_COMPAT_MODEL!,
              logger.child({ adapter: "llm-compat" }),
            )
          : new AnthropicAdapter(env.ANTHROPIC_API_KEY!, env.ANTHROPIC_MODEL, logger.child({ adapter: "llm" })),
    deployer:
      env.DEPLOY_ADAPTER === "real"
        ? new NetlifyAdapter(env.NETLIFY_API_TOKEN!, logger.child({ adapter: "netlify" }), undefined)
        : new MockDeployAdapter(path.join(varDir, "deploys")),
    emailProvider:
      env.EMAIL_PROVIDER_ADAPTER === "real"
        ? new PostmarkAdapter(env.POSTMARK_SERVER_TOKEN!, env.POSTMARK_MESSAGE_STREAM, logger.child({ adapter: "postmark" }))
        : new MockEmailProviderAdapter(path.join(varDir, "outbox")),
  };
}
