#!/usr/bin/env node

// Usage:
//   Bootstrapping:
//     cdk --profile sai --context env=stg bootstrap aws://440744255687/us-east-1
//     cdk --profile sai --context env=stg bootstrap aws://440744255687/ap-northeast-1
//   Check difference:
//     cdk --profile sai --context env=stg diff --all
//   Deploy:
//     cdk --profile sai --context env=stg deploy --all

// ---------------------------------------------------------------------------

import * as cdk from "aws-cdk-lib";
import * as dotenv from "dotenv";
import * as path from "path";
import { CdkStack } from "./lib/cdk-stack";
import { CdkStackGlobal } from "./lib/cdk-stack-global";

// Determine and load environment-specific .env file
// ex. cdk --profile sai deploy --context env=dev

const app = new cdk.App();
const env = app.node.tryGetContext("env");
const dotenvPath = path.resolve(__dirname, `.env.${env}`);
console.log({ dotenvPath });
dotenv.config({ path: dotenvPath, override: true });

const team_name = process.env.NUXT_SYS_TEAM_NAME || "standardai";
const project_name = process.env.NUXT_SYS_PROJECT_NAME || "survey";
const client_name = process.env.NUXT_SYS_CLIENT_NAME || "standardai";
const service_name = process.env.NUXT_SYS_SERVICE_NAME || "survey-sundai";
const product_name = process.env.NUXT_SYS_PRODUCT_NAME || "survey";

const props: cdk.StackProps = {
  tags: {
    // Standard AI Tags
    team: team_name,
    project: project_name,
    client: client_name,
    environment: env,
    service: service_name,
    product: product_name,

    // ServerWorks Tags (Cost Allocation Tags)
    Owner: team_name,
    Category1: project_name,
    Category2: client_name,
    Category3: env,
    Application: product_name,
  },
};
for (const key in props.tags) {
  cdk.Tags.of(app).add(key, props.tags[key]);
}

const config: any = {
  app: {
    name: `${process.env.NUXT_SYS_SERVICE_NAME}-${env}`,
    project: process.env.NUXT_SYS_SERVICE_NAME,
    env,
  },
};

// Global CDK Stack (Certificates, Web ACL)

console.info({ step: "create-stack-global", name: config.app.name, config });
new CdkStackGlobal(app, `${config.app.name}-global`, {
  env: {
    account: process.env.NUXT_AWS_ACCOUNT_ID,
    region: "us-east-1",
  },
  ...props,
  config,
} as any);

// Regional CDK Stack (Applocation and else)

console.info({ step: "create-stack-regional", name: config.app.name, config });
new CdkStack(app, config.app.name, {
  env: {
    account: process.env.NUXT_AWS_ACCOUNT_ID,
    region: process.env.NUXT_AWS_REGION,
  },
  ...props,
  config,
} as any);

app.synth();