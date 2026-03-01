import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cdk from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as cloudfrontOrigins from "aws-cdk-lib/aws-cloudfront-origins";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as path from "path";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as s3 from "aws-cdk-lib/aws-s3";
import { basicAuthCloudFrontFunctionBuilder } from "./cloudfront-functions/basic-authentication";
import type { Construct } from "constructs";
import { Tags } from "aws-cdk-lib";

export class CdkStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const { config } = props as any;

    // Route 53 - Hosted Zone ------------------------------------------------

    const isAppDomainHosting =
      process.env.NUXT_AWS_R53_APP_DOMAIN_HOSTING == "yes";
    const hostedZone = isAppDomainHosting
      ? route53.HostedZone.fromLookup(this, "route53-hosted-zone", {
          domainName: process.env.NUXT_AWS_R53_APP_HOSTED_ZONE_DOMAIN || "",
        })
      : undefined;

    console.log({ isAppDomainHosting, hostedZone });

    // S3 --------------------------------------------------------------------

    // System Bucket ---------------------------

    const systemBucket = new s3.Bucket(this, "s3-system", {
      bucketName: process.env.NUXT_AWS_S3_SYSTEM_BUCKET_NAME, // Replace with a unique name
      versioned: false, // Disable versioning
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Auto-delete bucket when stack is destroyed
      autoDeleteObjects: true, // Automatically delete objects in the bucket when destroyed
      publicReadAccess: false, // Disable public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Block public access to the bucket
      enforceSSL: true,
    });

    // Application Public Bucket----------------

    const staticBucket = new s3.Bucket(this, "s3-static", {
      bucketName: process.env.NUXT_AWS_S3_PUBLIC_BUCKET_NAME, // Replace with a unique name
      versioned: false, // Disable versioning
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Auto-delete bucket when stack is destroyed
      autoDeleteObjects: true, // Automatically delete objects in the bucket when destroyed
      publicReadAccess: false, // Disable public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Block public access to the bucket
    });

    // Application Storage Bucket----------------

    const storageBucket = new s3.Bucket(this, "s3-storage", {
      bucketName: process.env.NUXT_AWS_S3_STORAGE_BUCKET_NAME, // Replace with a unique name
      versioned: false, // Disable versioning
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Auto-delete bucket when stack is destroyed
      autoDeleteObjects: true, // Automatically delete objects in the bucket when destroyed
      publicReadAccess: false, // Disable public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Block public access to the bucket
    });

    // Application Cache Bucket----------------

    const cacheBucket = new s3.Bucket(this, "s3-cache", {
      bucketName: process.env.NUXT_AWS_S3_STORAGE_CACHE_BUCKET_NAME, // Replace with a unique name
      versioned: false, // Disable versioning
      removalPolicy: cdk.RemovalPolicy.DESTROY, // Auto-delete bucket when stack is destroyed
      autoDeleteObjects: true, // Automatically delete objects in the bucket when destroyed
      publicReadAccess: false, // Disable public access
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL, // Block public access to the bucket
      lifecycleRules: [
        {
          id: "delete-downloads",
          prefix: process.env.NUXT_AWS_S3_STORAGE_CACHE_DOWNLOAD_BASE_PATH,
          expiration: cdk.Duration.days(1),
        },
        {
          id: "delete-uploads",
          prefix: process.env.NUXT_AWS_S3_STORAGE_CACHE_UPLOAD_BASE_PATH,
          expiration: cdk.Duration.days(1),
        },
      ],
      cors: [
        {
          allowedOrigins: [
            process.env.NUXT_APP_SURVEY_URL!,
            process.env.NUXT_AWS_S3_STORAGE_CACHE_LOCALHOST_ACCESS === "yes"
              ? "http://localhost:3000"
              : "",
          ],
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.PUT,
            s3.HttpMethods.POST,
            s3.HttpMethods.DELETE,
            s3.HttpMethods.HEAD,
          ],
          allowedHeaders: ["*"],
          exposedHeaders: ["ETag"],
          maxAge: 3000,
        },
      ],
    });

    // Lambda ----------------------------------------------------------------

    // Survey Application ----------------------

    const appCodeBucket = s3.Bucket.fromBucketName(
      this,
      "app-code-bucket",
      process.env.NUXT_APP_SURVEY_CODE_BUCKET_NAME || "",
    );
    const appCodeLambdaBasePath =
      process.env.NUXT_APP_SURVEY_CODE_LAMBDA_BASE_PATH || "";
    const appLambda = new lambda.Function(this, "app", {
      functionName: `${config.app.name}-app`,
      runtime: lambda.Runtime.NODEJS_24_X, // Runtime for the Lambda function
      code: lambda.Code.fromBucketV2(
        appCodeBucket,
        `${appCodeLambdaBasePath}app/server.zip`,
      ),
      handler: "index.handler", // File is index.js, function is "handler"
      memorySize: 1024, // 1 GB of memory (128 - 10,240 MB)
      timeout: cdk.Duration.seconds(300), // 30 seconds timeout (30 - 900 sec)
      // role: lambdaRole,
      // environment: {
      //   LOG_GROUP_NAME: logGroup.logGroupName, // Example of passing log group info to the Lambda function
      // },
    });

    // Enable Function URL with IAM auth (Using OAC)
    const appFunctionUrl = appLambda.addFunctionUrl({
      authType:
        process.env.NUXT_AWS_OCA_FOR_LAMBDA_FUNC_URLS == "yes"
          ? lambda.FunctionUrlAuthType.AWS_IAM
          : lambda.FunctionUrlAuthType.NONE,
    });

    // Glue ------------------------------------------------------------------

    // Batch Application -----------------------

    // IAM Role for the Glue Job
    const glueJobRole = new iam.Role(this, "glue-job-role", {
      assumedBy: new iam.ServicePrincipal("glue.amazonaws.com"),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          "service-role/AWSGlueServiceRole",
        ),
      ],
    });

    // Grant S3 permissions to the Glue job
    systemBucket.grantReadWrite(glueJobRole);

    // Define the Glue Python Shell Jobs
    const appCodeGlueBasePath =
      process.env.NUXT_APP_SURVEY_CODE_GLUE_BASE_PATH || "";

    const glue_job_keys = "import_respondent_list,report_status_summary";
    for (const glue_job_key of glue_job_keys.split(",")) {
      new glue.CfnJob(this, `glue-job-${glue_job_key}`, {
        name: `${config.app.name}-${glue_job_key}`,
        role: glueJobRole.roleArn,
        command: {
          name: "glueshell", // Use 'glueshell' for Python Shell, 'glueetl' for ETL
          scriptLocation: appCodeBucket.s3UrlForObject(
            `${appCodeGlueBasePath}app/${glue_job_key}.py`,
          ),
          pythonVersion: "3.9",
        },
        // defaultArguments: {
        //   "--APP_ENV": "stg",
        //   "--LOG_LEVEL": "DEBUG",
        // },
        maxRetries: 1,
        timeout: 60, // Timeout in minutes
        // glueVersion: "2.0", // Use appropriate Glue version
        workerType: "Standard", // Or G.1X, G.2X, etc.
        numberOfWorkers: 2,
      });
    }

    // CloudFront ------------------------------------------------------------

    // Domain Name of Application --------------
    const domainNames = [];
    if (
      process.env.NUXT_AWS_R53_APP_HOSTNAME &&
      process.env.NUXT_AWS_R53_APP_HOSTED_ZONE_DOMAIN
    ) {
      const domainName = `${process.env.NUXT_AWS_R53_APP_HOSTNAME}.${process.env.NUXT_AWS_R53_APP_HOSTED_ZONE_DOMAIN}`;
      domainNames.push(domainName);
    }

    // Certificate -----------------------------
    let certificate = undefined;
    if (process.env.NUXT_AWS_ACM_APP_CERT_ARN) {
      certificate = acm.Certificate.fromCertificateArn(
        this,
        "ExistingCertificate",
        process.env.NUXT_AWS_ACM_APP_CERT_ARN,
      );
    }

    // CloudFront Functions --------------------

    const functionAssociations: cdk.aws_cloudfront.FunctionAssociation[] = [];

    if (process.env.NUXT_APP_BASIC_AUTH_ON_CLOUD_FRONT == "yes") {
      functionAssociations.push({
        eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
        function: basicAuthCloudFrontFunctionBuilder(this),
      });
    }

    // Response Header Policy ------------------
    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "pass-www-authenticate-policy",
      {
        responseHeadersPolicyName: "pass-www-authenticate-policy",
        comment: "Passes through the Www-Authenticate header.",
        customHeadersBehavior: {
          customHeaders: [
            {
              header: "WWW-Authenticate",
              value: "Basic",
              override: false,
            },
          ],
        },
      },
    );

    // S3 Backet Origin ------------------------

    const staticBucketOrigin =
      cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(staticBucket, {
        originId: `${config.app.name}-static-assets-origin`,
      });

    const cacheBucketOrigin =
      cloudfrontOrigins.S3BucketOrigin.withOriginAccessControl(cacheBucket, {
        originId: `${config.app.name}-cached-assets-origin`,
      });

    const lambdaOrigin = new cloudfrontOrigins.FunctionUrlOrigin(
      appFunctionUrl,
      {
        originId: `${config.app.name}-lambda-function-origin`,
        customHeaders: {
          [process.env.NUXT_APP_ACCESS_KEY_NAME as string]: process.env
            .NUXT_APP_ACCESS_KEY_VALUE as string,
        },
      },
    );

    // CloudFront Distribution -----------------

    const distribution = new cloudfront.Distribution(this, `cloudfront`, {
      domainNames,
      certificate,
      defaultBehavior: {
        origin: lambdaOrigin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        responseHeadersPolicy,
        functionAssociations, // CloudFront Functions
      },
      additionalBehaviors: {
        // Route requests matching "/_nuxt/*" to app assets in public S3 bucket
        "/_nuxt/*": {
          origin: staticBucketOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
        // Route requests matching "/api/*" to lambda function (to handling /api/*.*)
        "/api/*": {
          origin: lambdaOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy:
            cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
          responseHeadersPolicy,
          functionAssociations, // CloudFront Functions
        },
        // Route requests matching "/storage/*" to caching S3 bucket for uploads/downloads
        "/storage/download/*": {
          origin: cacheBucketOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
          functionAssociations,
        },
        "/storage/upload/*": {
          origin: cacheBucketOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          functionAssociations,
        },
        // Route requests matching "/*.*" to app assets in public S3 bucket
        "/*.*": {
          origin: staticBucketOrigin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        },
      },
      // webAclId: process.env.NUXT_AWS_WAF_ACL_ARN,
      // logBucket: systemBucket,
      // logFilePrefix: `${config.app.name}/cloudfront/{YYYY}/{MM}/{DD}/`,

      comment: config.app.name,
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200, // Minimum area including Japan
    });
    Tags.of(distribution).add("Name", `${config.app.name}-cloudfront`);

    // DynamoDB --------------------------------------------------------------

    // Entries Table ---------------------------

    const entriesTable = new dynamodb.Table(this, `dynamodb-table:Entries`, {
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "step_id", type: dynamodb.AttributeType.STRING },
      tableName: `${process.env.NUXT_AWS_DYNAMO_TABLE_PREFIX}Entries`,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled:
          process.env.NUXT_AWS_DYNAMO_POINT_IN_TIME_RECOVERY == "yes",
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: (process.env.NUXT_AWS_DYNAMO_REMOVAL_POLICY ||
        cdk.RemovalPolicy.RETAIN) as cdk.RemovalPolicy,
    });

    // Entries Table : GSIs --------------------
    // [!] Only single GSI create/remove operation is allowed at a time
    //     Repeat deployment after uncomment/comment GSI definitions
    for (const [name, primaryKey] of [
      ["round", "round_id"], // Round index - round_id
      ["respondent", "respondent_id"], // Respondent index - respondent_id
    ]) {
      entriesTable.addGlobalSecondaryIndex({
        indexName: `${process.env.NUXT_AWS_DYNAMO_TABLE_PREFIX}Entries-${name}-index`,
        partitionKey: {
          name: primaryKey,
          type: dynamodb.AttributeType.STRING,
        },
        sortKey: { name: "id", type: dynamodb.AttributeType.STRING },
        projectionType: dynamodb.ProjectionType.INCLUDE,
        nonKeyAttributes: [
          "step_id",
          "respondent_id",
          "web_member_number",
          "email",
          "kana_name",
          "kanji_name",
          "call_pattern",
          "classification",
          "call_target",
          "created_at", // Non-key attributes
        ].filter((item) => item !== primaryKey),
      });
    }

    // // Entries Table : GSI for sync ------------
    // entriesTable.addGlobalSecondaryIndex({
    //   indexName: `${process.env.NUXT_AWS_DYNAMO_TABLE_PREFIX}Entries-sync-index`,
    //   partitionKey: {
    //     name: "id",
    //     type: dynamodb.AttributeType.STRING,
    //   },
    //   sortKey: { name: "sortKey", type: dynamodb.AttributeType.STRING },
    //   projectionType: dynamodb.ProjectionType.INCLUDE,
    //   nonKeyAttributes: ["createdAt", "deletedAt"],
    // });

    // Transaction Table ---------------------------

    const transactionTable = new dynamodb.Table(
      this,
      `dynamodb-table:Transactions`,
      {
        partitionKey: { name: "type_id", type: dynamodb.AttributeType.STRING },
        sortKey: { name: "id", type: dynamodb.AttributeType.STRING },
        tableName: `${process.env.NUXT_AWS_DYNAMO_TABLE_PREFIX}Transactions`,
        pointInTimeRecoverySpecification: {
          pointInTimeRecoveryEnabled:
            process.env.NUXT_AWS_DYNAMO_POINT_IN_TIME_RECOVERY == "yes",
        },
        billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        removalPolicy: (process.env.NUXT_AWS_DYNAMO_REMOVAL_POLICY ||
          cdk.RemovalPolicy.RETAIN) as cdk.RemovalPolicy,
      },
    );

    // DNS Records -----------------------------------------------------------

    // Application -----------------------------

    if (isAppDomainHosting) {
      new route53.ARecord(this, "app-dns-alias-record", {
        zone: hostedZone!,
        recordName: process.env.NUXT_AWS_R53_APP_HOSTNAME,
        target: route53.RecordTarget.fromAlias(
          new route53Targets.CloudFrontTarget(distribution),
        ),
      });
    }

    // Outputs ---------------------------------------------------------------

    // Output the CloudFront distribution domain name
    new cdk.CfnOutput(this, "cloudfront-domain-name", {
      value: distribution.domainName,
    });
  }
}
