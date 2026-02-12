import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import type { Construct } from "constructs";

export const basicAuthCloudFrontFunctionBuilder = (
  construct: Construct,
  id?: string,
  name?: string
) =>
  new cloudfront.Function(construct, id ?? "basic-auth-function", {
    functionName:
      name ??
      `yaon-survey-${process.env.NUXT_SYS_ENVIRONMENT}-cloudfront-functions-basic-auth`,
    runtime: cloudfront.FunctionRuntime.JS_2_0,
    code: cloudfront.FunctionCode.fromInline(`
function handler(event) {
  const middleware = "cloudfront-functions-basic-auth";
  const req = event.request;
  const res = event.response;

  // console.log({
  //   middleware,
  //   step: "start",
  //   path: req.uri,
  //   headers: req.headers,
  //   res: res,
  //   config: {
  //     appBasicAuthOnCloudFront:
  //       "${process.env.NUXT_APP_BASIC_AUTH_ON_CLOUD_FRONT}",
  //     appBasicAuth: "${process.env.NUXT_APP_BASIC_AUTH}",
  //     appBasicAuthPublicServices:
  //       "${process.env.NUXT_APP_BASIC_AUTH_PUBLIC_SERVICES}",
  //     appBasicAuthServices: "${process.env.NUXT_APP_BASIC_AUTH_SERVICES}",
  //     appBasicAuthRealms: "${process.env.NUXT_APP_BASIC_AUTH_REALMS}",
  //     appBasicAuthUsernames: "${process.env.NUXT_APP_BASIC_AUTH_USERNAMES}",
  //     appBasicAuthPasswords: "${process.env.NUXT_APP_BASIC_AUTH_PASSWORDS}",
  //   },
  // });

  // Pass through if Basic Authentication Disabled ---------------------------

  // if ("${process.env.NUXT_APP_BASIC_AUTH_ON_CLOUD_FRONT}" !== "yes") {
  //   console.log({ middleware, step: "end:no-basic-auth" });
  //   return;
  // }

  // Pass through if Public Access Path --------------------------------------

  const publicPaths =
    "${process.env.NUXT_APP_BASIC_AUTH_PUBLIC_SERVICES}".split(" ");
  for (let i = 0; i < publicPaths.length; i++) {
    const publicPath = publicPaths[i];
    // Exact match
    if (publicPath.endsWith("$")) {
      if (req.uri === publicPath.slice(0, -1)) {
        // console.log({ middleware, step: "end:public-exact-match" });
        return req;
      }
    }
    // Starts with
    else {
      if ((req.uri ?? "").startsWith(publicPath)) {
        // console.log({ middleware, step: "end:public-startswith" });
        return req;
      }
    }
  }

  // Determin Service Index --------------------------------------------------

  const services = "${process.env.NUXT_APP_BASIC_AUTH_SERVICES}".split(" "); // Services
  let serviceIndex = -1;
  for (let i = 0; i < services.length; i++) {
    const path = services[i]
      .split(":")
      .find((basePath) => (req.uri ?? "").startsWith(basePath));
    if (path) serviceIndex = i;
  }
  if (serviceIndex < 0) {
    // console.log({ middleware, step: "end:not-authorized-service" });
    return {
      statusCode: 404,
      statusDescription: "Service not found",
    };
  }

  // Return Challenge if No Basic Authentication Header ----------------------

  const realms = "${process.env.NUXT_APP_BASIC_AUTH_REALMS}".split(" "); // Realms
  const authHeader = req.headers.authorization
    ? (req.headers.authorization.value ?? "")
    : "";
  if (!authHeader.startsWith("Basic ")) {
    // console.log({ middleware, step: "end:respond-basic-auth-challenge" });
    return {
      statusCode: 401,
      statusDescription: "Authentication required",
      headers: {
        "www-authenticate": {
          value: 'Basic realm="' + realms[serviceIndex] + '"',
        },
      },
    };
  }

  // Check credentials -------------------------------------------------------

  const usernames = "${process.env.NUXT_APP_BASIC_AUTH_USERNAMES}".split(" ");
  const passwords = "${process.env.NUXT_APP_BASIC_AUTH_PASSWORDS}".split(" ");

  // Decode the base64-encoded credentials
  const encodedCredentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(encodedCredentials, "base64")
    .toString("utf8")
    .split(":");
  // Validate credentials
  if (
    credentials[0] !== usernames[serviceIndex] ||
    credentials[1] !== passwords[serviceIndex]
  ) {
    // console.log({ middleware, step: "end:invalid-credentials" });
    return {
      statusCode: 401,
      statusDescription: "Invalid credentials",
      headers: {
        "www-authenticate": {
          value: 'Basic realm="' + realms[serviceIndex] + '"',
        },
      },
    };
  }

  // If authorized, continue the request
  // console.log({ middleware, step: "end:authorized" });
  return req;
}
  `),
  });
