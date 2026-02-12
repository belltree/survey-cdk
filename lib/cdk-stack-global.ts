import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cdk from "aws-cdk-lib";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import type { Construct } from "constructs";

export class CdkStackGlobal extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    const { config } = props as any;

    // Domain settings from environment variables ----------------------------

    const zoneDomain =
      process.env.NUXT_AWS_R53_APP_HOSTED_ZONE_DOMAIN || undefined;
    const hostname = process.env.NUXT_AWS_R53_APP_HOSTNAME || undefined;
    if (!zoneDomain || !hostname) {
      throw new Error(
        "Environment variables for app domain name are not properly configured.",
      );
    }
    const appDomainName = `${hostname}.${zoneDomain}`;
    console.info({ zoneDomain, hostname, appDomainName });

    // ACM Certificate -------------------------------------------------------

    let appCertificate = undefined;
    if (process.env.NUXT_AWS_R53_APP_DOMAIN_HOSTING == "yes") {
      // Retrieve the Route 53 hosted zone
      const hostedZone = route53.HostedZone.fromLookup(this, "hosted-zone", {
        domainName: zoneDomain,
      });

      // Create an ACM certificate and automatically validate via DNS
      appCertificate = new acm.Certificate(this, "certificate", {
        domainName: appDomainName,
        validation: acm.CertificateValidation.fromDns(hostedZone), // Automatically validate via Route 53
      });
    }

    /*
    // WAF (Web Application Firewall) ----------------------------------------

    // Web ACL - WAF/ use-east-1 -----

    const webAcl = new wafv2.CfnWebACL(this, "web-acl", {
      name: `${config.app.name}-web-acl`,
      scope: "CLOUDFRONT", // WAF is attached to CloudFront
      defaultAction: { allow: {} }, // Default action: allow all traffic
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${config.app.name}-web-acl-metrics`,
        sampledRequestsEnabled: true,
      },
      rules: [
        // // Example rule: Block IPs in a specific list
        // {
        //   name: "block-specific-IPs",
        //   priority: 1,
        //   action: { block: {} },
        //   visibilityConfig: {
        //     cloudWatchMetricsEnabled: true,
        //     metricName: "block-specific-IPs",
        //     sampledRequestsEnabled: true,
        //   },
        //   statement: {
        //     ipSetReferenceStatement: {
        //       arn: `arn:aws:wafv2:REGION:ACCOUNT_ID:regional/ipset/YourIPSet/ID`,
        //     },
        //   },
        // },
      ],
    });

    // Web ACL ARN
    new cdk.CfnOutput(this, "web-acl-arn", {
      value: webAcl.attrArn,
    });
    // new ssm.StringParameter(this, "ssm-web-acl-arn", {
    //   parameterName: `/${config.app.name}/global/waf/web-acl/arn`,
    //   stringValue: webAcl.attrArn,
    // });
    */

    // Outputs ---------------------------------------------------------------

    // Output the certificate ARN
    if (appCertificate) {
      new cdk.CfnOutput(this, "certificate-arn", {
        value: appCertificate.certificateArn,
        description: `The ARN of the ACM certificate for ${appDomainName}`,
      });
    }
  }
}
