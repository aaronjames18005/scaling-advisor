import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const generateForProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("Unauthorized: User must be authenticated");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== user._id) {
      throw new Error("Project not found or access denied");
    }

    // Clear existing compliance checks
    const existingChecks = await ctx.db
      .query("complianceChecks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const c of existingChecks) {
      await ctx.db.delete(c._id);
    }

    // Generate compliance checks
    const checks = generateComplianceChecks(project);

    for (const c of checks) {
      await ctx.db.insert("complianceChecks", {
        projectId: args.projectId,
        ...c,
        isPassed: false,
      });
    }

    // Insert or update security-oriented configurations
    const securityArtifacts = generateSecurityArtifacts(project);

    for (const art of securityArtifacts) {
      // Upsert by type under project
      const existing = await ctx.db
        .query("configurations")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .filter((q) => q.eq(q.field("type"), art.type))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          content: art.content,
          name: art.name,
          description: art.description,
        });
      } else {
        await ctx.db.insert("configurations", {
          projectId: args.projectId,
          type: art.type as any,
          name: art.name,
          content: art.content,
          description: art.description,
        });
      }
    }
  },
});

export const listComplianceByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== user._id) return [];

    return await ctx.db
      .query("complianceChecks")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

// Helpers

function generateComplianceChecks(project: any) {
  const checks: Array<{
    title: string;
    description: string;
    category: string;
    severity: "high" | "medium" | "low";
    standard: string;
    remediation: string;
  }> = [];

  // CIS AWS Checks
  checks.push({
    title: "Root account MFA enabled",
    description:
      "Ensure AWS root account has MFA enabled to prevent unauthorized access.",
    category: "iam",
    severity: "high",
    standard: "cis-aws",
    remediation:
      "Enable MFA for the root account and restrict its use. Create admin IAM users for daily operations.",
  });

  checks.push({
    title: "Least-privilege IAM policies",
    description:
      "Policies should restrict actions to necessary resources and operations only.",
    category: "iam",
    severity: "high",
    standard: "cis-aws",
    remediation:
      "Replace '*' wildcards with specific actions/resources. Segment roles per service and environment.",
  });

  checks.push({
    title: "Secrets stored in a secure vault",
    description:
      "Application secrets should not be stored in code or images.",
    category: "secrets",
    severity: "high",
    standard: "cis-aws",
    remediation:
      "Use AWS Secrets Manager or SSM Parameter Store with KMS. Rotate secrets and limit access via IAM.",
  });

  // Kubernetes CIS if target phases suggest k8s usage
  if (project.targetPhase === "scale" || project.targetPhase === "enterprise") {
    checks.push({
      title: "Kubernetes RBAC: least privilege",
      description:
        "ClusterRoles and Roles should grant minimal permissions to service accounts.",
      category: "kubernetes",
      severity: "medium",
      standard: "cis-k8s",
      remediation:
        "Define Roles with specific verbs and resources. Bind them to dedicated service accounts per workload.",
    });

    checks.push({
      title: "Restrict container capabilities and run as non-root",
      description:
        "Containers should drop unnecessary Linux capabilities and not run as root.",
      category: "kubernetes",
      severity: "medium",
      standard: "cis-k8s",
      remediation:
        "Set securityContext.runAsNonRoot=true and drop capabilities. Use readOnlyRootFilesystem where possible.",
    });
  }

  // Networking
  checks.push({
    title: "Restrict inbound access with security groups",
    description:
      "Limit inbound traffic to required ports and trusted CIDR ranges.",
    category: "networking",
    severity: "medium",
    standard: "cis-aws",
    remediation:
      "Tighten security group rules. Use ALB/NLB and private subnets for app nodes.",
  });

  // Logging/Monitoring
  checks.push({
    title: "Enable CloudTrail and centralize logs",
    description:
      "Account activity should be logged and immutable for auditing.",
    category: "observability",
    severity: "medium",
    standard: "cis-aws",
    remediation:
      "Enable CloudTrail in all regions, deliver to an S3 bucket with strong bucket policies and S3 object lock.",
  });

  return checks;
}

function generateSecurityArtifacts(project: any) {
  const nameSlug = project.name.toLowerCase().replace(/\s+/g, "-");

  const iamPolicy = {
    type: "iam-policy",
    name: `${nameSlug}-least-privilege.json`,
    description: `IAM least-privilege starter policy scaffolding for ${project.name}`,
    content: JSON.stringify(
      {
        Version: "2012-10-17",
        Statement: [
          {
            Sid: "DenyAllExceptListed",
            Effect: "Deny",
            NotAction: ["sts:AssumeRole"],
            Resource: "*",
            Condition: {},
          },
          {
            Sid: "AppReadOnlyS3Logs",
            Effect: "Allow",
            Action: ["s3:GetObject", "s3:ListBucket"],
            Resource: [
              "arn:aws:s3:::company-logs",
              "arn:aws:s3:::company-logs/*",
            ],
          },
          {
            Sid: "AppSpecificDynamoAccess",
            Effect: "Allow",
            Action: ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:Query"],
            Resource: [`arn:aws:dynamodb:*:*:table/${nameSlug}-*`],
          },
          {
            Sid: "ParameterStoreStrict",
            Effect: "Allow",
            Action: ["ssm:GetParameter", "ssm:GetParameters"],
            Resource: [`arn:aws:ssm:*:*:parameter/${nameSlug}/*`],
          },
        ],
      },
      null,
      2
    ),
  };

  const secretsMgmt = {
    type: "secrets-management",
    name: `${nameSlug}-secrets-policy.md`,
    description: `Secrets management policy and integration guide for ${project.name}`,
    content: [
      `# Secrets Management Policy`,
      ``,
      `- Store secrets in AWS Secrets Manager or SSM Parameter Store (encrypted with KMS).`,
      `- Rotate secrets every 90 days (automated if possible).`,
      `- App access via IAM role with resource-scoped permissions (no '*' wildcards).`,
      `- No secrets in Docker images, code, or environment files committed to VCS.`,
      ``,
      `## Integration (Node.js example)`,
      `- Use SDK to fetch secrets at runtime; cache in memory with TTL.`,
      `- Fail closed if secret missing; do not run with defaults in prod.`,
      ``,
      `## Access Controls`,
      `- Separate prod vs non-prod paths: /${nameSlug}/prod/*`,
      `- Limit decryption to app role and CI role only.`,
    ].join("\n"),
  };

  const terraformCIS = {
    type: "terraform-cis",
    name: `${nameSlug}-cis.tf`,
    description: `Terraform snippets aligned with CIS recommendations for ${project.name}`,
    content: [
      `# CIS-aligned Terraform snippets`,
      ``,
      `# Example: S3 bucket for logs with strict policies`,
      `resource "aws_s3_bucket" "logs" {`,
      `  bucket = "${nameSlug}-logs"`,
      `  acl    = "log-delivery-write"`,
      `  force_destroy = false`,
      `  versioning { enabled = true }`,
      `  server_side_encryption_configuration {`,
      `    rule {`,
      `      apply_server_side_encryption_by_default {`,
      `        sse_algorithm = "aws:kms"`,
      `      }`,
      `    }`,
      `  }`,
      `  lifecycle_rule {`,
      `    id      = "retention"`,
      `    enabled = true`,
      `    noncurrent_version_expiration { days = 30 }`,
      `  }`,
      `  tags = { Standard = "cis-aws" }`,
      `}`,
      ``,
      `# Example: CloudTrail`,
      `resource "aws_cloudtrail" "main" {`,
      `  name                          = "${nameSlug}-trail"`,
      `  s3_bucket_name                = aws_s3_bucket.logs.id`,
      `  include_global_service_events = true`,
      `  is_multi_region_trail         = true`,
      `  enable_log_file_validation    = true`,
      `  kms_key_id                    = "" # provide KMS key`,
      `  tags = { Standard = "cis-aws" }`,
      `}`,
      ``,
      `# Note: Parameterize for environments and plug into existing VPC/IAM modules`,
    ].join("\n"),
  };

  return [iamPolicy, secretsMgmt, terraformCIS];
}
