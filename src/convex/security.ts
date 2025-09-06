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

  // Add: Error handling and alerting for secret access failures
  checks.push({
    title: "Alert on Secrets Manager access errors",
    description:
      "Detect and alert on failed secret access attempts (e.g., AccessDenied, decryption failures) to fail fast and investigate.",
    category: "secrets",
    severity: "high",
    standard: "cis-aws",
    remediation:
      "Create a CloudWatch Logs metric filter on CloudTrail for Secrets Manager events with errorCode and wire to an alarm (e.g., threshold >= 1 in 5m) with on-call notification. Ensure applications fail closed and log redacted error details.",
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
      `## Error Handling for Secret Access`,
      `- Treat all secret access as critical path and fail-closed on irrecoverable errors.`,
      `- Implement bounded retries with exponential backoff and jitter for transient errors (throttling, timeouts).`,
      `- Use strict timeouts (e.g., 2-5s) and limit total retry duration (e.g., <= 15s) to avoid startup stalls.`,
      `- On final failure:`,
      `  - Log a security-grade error (without leaking secret values),`,
      `  - Emit a metric (e.g., counter: secrets.access.failures),`,
      `  - Exit the process or mark the service unhealthy (liveness/readiness fail).`,
      `- Never proceed with default/dev secrets in production.`,
      `- Distinguish error categories:`,
      `  - AuthN/Z (AccessDenied, InvalidSignature): do not retry, surface immediately.`,
      `  - NotFound/DecryptionFailure/InvalidRequest: do not retry, surface immediately.`,
      `  - Throttling/Timeout/Networking: retry with backoff (bounded).`,
      ``,
      `### Node.js (pseudo)`,
      `- Pseudocode:`,
      `  - try {`,
      `      const secret = await client.getSecretValue({ SecretId }).withTimeout(5s);`,
      `    } catch (e) {`,
      `      if (e.code in ['AccessDeniedException','ResourceNotFoundException','DecryptionFailure','UnrecognizedClientException']) failFast(e);`,
      `      if (e.code in ['ThrottlingException','TimeoutError','NetworkingError']) retryWithBackoff({ maxRetries: 3, baseMs: 300, jitter: true });`,
      `      else failFast(e);`,
      `    }`,
      `  - If still failing after retries: emit metric, log redacted error, terminate.`,
      ``,
      `### Python (pseudo)`,
      `- Similar categorization; use retries for throttling/timeouts only; otherwise fail fast.`,
      ``,
      `## Access Controls`,
      `- Separate prod vs non-prod paths: /${nameSlug}/prod/*`,
      `- Limit decryption to app role and CI role only.`,
      ``,
      `## Observability`,
      `- Emit metrics:`,
      `  - secrets.access.success (counter)`,
      `  - secrets.access.failure (counter, labeled by reason/category)`,
      `  - secrets.access.latency_ms (histogram)`,
      `- Integrate logs with correlation IDs and redact secret content.`,
      `- Rely on CloudTrail + CloudWatch metric filters for Secrets Manager Get/Put events (see Terraform snippets).`,
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
      `# -----------------------------------------------------------------------------`,
      `# CloudWatch integration + alerting for Secrets Manager access`,
      `# -----------------------------------------------------------------------------`,
      `resource "aws_cloudwatch_log_group" "cloudtrail" {`,
      `  name              = "/aws/cloudtrail/${nameSlug}"`,
      `  retention_in_days = 90`,
      `  tags = { Standard = "cis-aws" }`,
      `}`,
      ``,
      `data "aws_iam_policy_document" "cloudtrail_assume_role" {`,
      `  statement {`,
      `    effect = "Allow"`,
      `    principals {`,
      `      type        = "Service"`,
      `      identifiers = ["cloudtrail.amazonaws.com"]`,
      `    }`,
      `    actions = ["sts:AssumeRole"]`,
      `  }`,
      `}`,
      ``,
      `resource "aws_iam_role" "cloudtrail" {`,
      `  name               = "${nameSlug}-cloudtrail-role"`,
      `  assume_role_policy = data.aws_iam_policy_document.cloudtrail_assume_role.json`,
      `  tags = { Standard = "cis-aws" }`,
      `}`,
      ``,
      `data "aws_iam_policy_document" "cloudtrail_to_cwlogs" {`,
      `  statement {`,
      `    effect = "Allow"`,
      `    actions = ["logs:CreateLogStream", "logs:PutLogEvents"]`,
      `    resources = ["\\\${aws_cloudwatch_log_group.cloudtrail.arn}:*"]`,
      `  }`,
      `}`,
      ``,
      `resource "aws_iam_role_policy" "cloudtrail_to_cwlogs" {`,
      `  name   = "${nameSlug}-cloudtrail-to-cwlogs"`,
      `  role   = aws_iam_role.cloudtrail.id`,
      `  policy = data.aws_iam_policy_document.cloudtrail_to_cwlogs.json`,
      `}`,
      ``,
      `# Attach CW Logs to CloudTrail (update existing resource)`,
      `# cloud_watch_logs_group_arn = aws_cloudwatch_log_group.cloudtrail.arn`,
      `# cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail.arn`,
      ``,
      `resource "aws_cloudwatch_log_metric_filter" "secrets_access" {`,
      `  name           = "${nameSlug}-secrets-access"`,
      `  log_group_name = aws_cloudwatch_log_group.cloudtrail.name`,
      `  pattern        = "{ ($.eventSource = \\"secretsmanager.amazonaws.com\\") && (($.eventName = \\"GetSecretValue\\") || ($.eventName = \\"PutSecretValue\\")) }"`,
      `  metric_transformation {`,
      `    name      = "${nameSlug}-secrets-access-count"`,
      `    namespace = "Security"`,
      `    value     = "1"`,
      `  }`,
      `}`,
      ``,
      `resource "aws_cloudwatch_metric_alarm" "secrets_access_spike" {`,
      `  alarm_name          = "${nameSlug}-secrets-access-spike"`,
      `  alarm_description   = "Alerts on spikes of Secrets Manager access events."`,
      `  comparison_operator = "GreaterThanOrEqualToThreshold"`,
      `  evaluation_periods  = 1`,
      `  threshold           = 20`,
      `  metric_name         = aws_cloudwatch_log_metric_filter.secrets_access.metric_transformation[0].name`,
      `  namespace           = aws_cloudwatch_log_metric_filter.secrets_access.metric_transformation[0].namespace`,
      `  period              = 300`,
      `  statistic           = "Sum"`,
      `  # alarm_actions     = [aws_sns_topic.security_alerts.arn]`,
      `  # ok_actions        = [aws_sns_topic.security_alerts.arn]`,
      `}`,
      ``,
      `# Metric filter for Secrets Manager updates (Create/Update/Rotate/Delete)`,
      `resource "aws_cloudwatch_log_metric_filter" "secrets_update" {`,
      `  name           = "${nameSlug}-secrets-update"`,
      `  log_group_name = aws_cloudwatch_log_group.cloudtrail.name`,
      `  pattern        = "{ ($.eventSource = \\"secretsmanager.amazonaws.com\\") && (($.eventName = \\"CreateSecret\\") || ($.eventName = \\"UpdateSecret\\") || ($.eventName = \\"UpdateSecretVersionStage\\") || ($.eventName = \\"RotateSecret\\\") || ($.eventName = \\"DeleteSecret\\\")) }"`,
      `  metric_transformation {`,
      `    name      = "${nameSlug}-secrets-update-count"`,
      `    namespace = "Security"`,
      `    value     = "1"`,
      `  }`,
      `}`,
      ``,
      `# Alarm: alert on any Secrets Manager update events`,
      `resource "aws_cloudwatch_metric_alarm" "secrets_update_change" {`,
      `  alarm_name          = "${nameSlug}-secrets-update-change"`,
      `  alarm_description   = "Alerts on Secrets Manager update events (Create/Update/Rotate/Delete)."`,
      `  comparison_operator = "GreaterThanOrEqualToThreshold"`,
      `  evaluation_periods  = 1`,
      `  threshold           = 1`,
      `  metric_name         = aws_cloudwatch_log_metric_filter.secrets_update.metric_transformation[0].name`,
      `  namespace           = aws_cloudwatch_log_metric_filter.secrets_update.metric_transformation[0].namespace`,
      `  period              = 300`,
      `  statistic           = "Sum"`,
      `  # alarm_actions     = [aws_sns_topic.security_alerts.arn]`,
      `  # ok_actions        = [aws_sns_topic.security_alerts.arn]`,
      `}`,
      ``,
      `# -----------------------------------------------------------------------------`,
      `# Secrets management (KMS + AWS Secrets Manager)`,
      `# -----------------------------------------------------------------------------`,
      ``,
      `# KMS key for encrypting secrets`,
      `resource "aws_kms_key" "secrets" {`,
      `  description             = "${project.name} secrets KMS key"`,
      `  deletion_window_in_days = 30`,
      `  enable_key_rotation     = true`,
      `  tags = {`,
      `    Name     = "${nameSlug}-secrets-kms"`,
      `    Standard = "cis-aws"`,
      `  }`,
      `}`,
      ``,
      `# Optional: Alias for the KMS key`,
      `resource "aws_kms_alias" "secrets" {`,
      `  name          = "alias/${nameSlug}-secrets"`,
      `  target_key_id = aws_kms_key.secrets.id`,
      `}`,
      ``,
      `# Secrets Manager secret (logical)`,
      `resource "aws_secretsmanager_secret" "app" {`,
      `  name        = "${nameSlug}/prod/app"`,
      `  description = "Application secrets for ${project.name} (prod)"`,
      `  kms_key_id  = aws_kms_key.secrets.arn`,
      `  tags = {`,
      `    Name     = "${nameSlug}-app-secret"`,
      `    Standard = "cis-aws"`,
      `  }`,
      `}`,
      ``,
      `# Initial secret value (rotate via CI or periodic rotation)`,
      `resource "aws_secretsmanager_secret_version" "app_initial" {`,
      `  secret_id     = aws_secretsmanager_secret.app.id`,
      `  secret_string = jsonencode({`,
      `    DATABASE_URL = "postgres://user:pass@host:5432/db"`,
      `    REDIS_URL    = "redis://host:6379"`,
      `    JWT_SECRET   = "CHANGE_ME"`,
      `  })`,
      `}`,
      ``,
      `# Example IAM policy scoped to this secret`,
      `data "aws_iam_policy_document" "app_read_secret" {`,
      `  statement {`,
      `    sid    = "AllowReadAppSecret"`,
      `    effect = "Allow"`,
      `    actions = [`,
      `      "secretsmanager:GetSecretValue",`,
      `      "secretsmanager:DescribeSecret"`,
      `    ]`,
      `    resources = [aws_secretsmanager_secret.app.arn]`,
      `  }`,
      `  statement {`,
      `    sid    = "AllowDecryptKMS"`,
      `    effect = "Allow"`,
      `    actions = [`,
      `      "kms:Decrypt"`,
      `    ]`,
      `    resources = [aws_kms_key.secrets.arn]`,
      `  }`,
      `}`,
      ``,
      `resource "aws_iam_policy" "app_read_secret" {`,
      `  name   = "${nameSlug}-read-secret"`,
      `  policy = data.aws_iam_policy_document.app_read_secret.json`,
      `}`,
      ``,
      `# Attach the policy to your app role`,
      `# resource "aws_iam_role_policy_attachment" "app_secret_attach" {`,
      `#   role       = aws_iam_role.app.name`,
      `#   policy_arn = aws_iam_policy.app_read_secret.arn`,
      `# }`,
      ``,
      `# Notes:`,
      `# - Rotate secrets regularly (e.g., 90 days).`,
      `# - Use separate paths for environments: /${nameSlug}/staging/*, /${nameSlug}/prod/*`,
      `# - Attach the read policy only to the app execution role and CI role.`,
      ``,
      `# Note: Parameterize for environments and plug into existing VPC/IAM modules`,
    ].join("\n"),
  };

  return [iamPolicy, secretsMgmt, terraformCIS];
}