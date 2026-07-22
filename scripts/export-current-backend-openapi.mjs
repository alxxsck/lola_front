import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const backendDirectory = path.resolve(process.argv[2] ?? "");
const target = path.resolve(process.argv[3] ?? "");
if (!process.argv[2] || !process.argv[3]) {
  throw new Error(
    "Usage: node export-current-backend-openapi.mjs <backend-directory> <target.json>",
  );
}

// OpenAPI generation only needs the Nest dependency graph and controller metadata. Keep
// provider construction deterministic and independent of a developer's production-like
// shell configuration; these values live only in this short-lived exporter process.
Object.assign(process.env, {
  NODE_ENV: "development",
  IAM_CMS_AUTH_ENABLED: "false",
  CMS_COOKIE_AUTH_ENABLED: "false",
  CMS_CORS_ALLOWED_ORIGINS: '["http://localhost:4173"]',
  ASSISTANT_CORS_ALLOWED_ORIGINS: "[]",
  IAM_WEBAUTHN_RP_ID: "localhost",
  IAM_WEBAUTHN_RP_NAME: "Lola CMS OpenAPI Export",
  IAM_MFA_CAPABILITY_KEY: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
  IAM_EMAIL_DELIVERY_ENABLED: "false",
});

process.chdir(backendDirectory);
const backendRequire = createRequire(
  path.join(backendDirectory, "package.json"),
);
backendRequire("reflect-metadata");
const { Test } = backendRequire("@nestjs/testing");
const { DocumentBuilder, SwaggerModule } = backendRequire("@nestjs/swagger");
const { AppModule } = await import(
  pathToFileURL(path.join(backendDirectory, "dist/app.module.js"))
);
const { closeScenarioAuthoringSchemas, swaggerOperationIdFactory } =
  await import(
    pathToFileURL(path.join(backendDirectory, "dist/common/openapi.js"))
  );
const { configureHttpApplication } = await import(
  pathToFileURL(
    path.join(backendDirectory, "dist/common/configure-http-application.js"),
  )
);

const moduleRef = await Test.createTestingModule({
  imports: [AppModule],
}).compile();
const app = moduleRef.createNestApplication();
try {
  configureHttpApplication(app, {
    NODE_ENV: process.env.NODE_ENV,
    CMS_CORS_ALLOWED_ORIGINS: process.env.CMS_CORS_ALLOWED_ORIGINS,
    ASSISTANT_CORS_ALLOWED_ORIGINS: process.env.ASSISTANT_CORS_ALLOWED_ORIGINS,
    CMS_COOKIE_AUTH_ENABLED: process.env.CMS_COOKIE_AUTH_ENABLED,
  });
  const config = new DocumentBuilder()
    .setTitle("Lola Backend Platform")
    .setDescription(
      "CMS, integration, chat and realtime API for Lola AI Assistant",
    )
    .setVersion("0.1.0")
    .addBearerAuth()
    .addBearerAuth(
      { type: "http", scheme: "bearer", bearerFormat: "lola_srv_*" },
      "server-key",
    )
    .addApiKey(
      { type: "apiKey", name: "x-project-key", in: "header" },
      "project-key",
    )
    .build();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: swaggerOperationIdFactory,
  });
  closeScenarioAuthoringSchemas(document);
  await writeFile(target, `${JSON.stringify(document, null, 2)}\n`, "utf8");
} finally {
  await app.close();
}
