import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const generate = mutation({
  args: {
    projectId: v.id("projects"),
    type: v.union(
      v.literal("dockerfile"),
      v.literal("kubernetes"),
      v.literal("terraform"),
      v.literal("github-actions"),
      v.literal("docker-compose")
    ),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getCurrentUser(ctx);
      if (!user) {
        throw new Error("Unauthorized: User must be authenticated");
      }

      const project = await ctx.db.get(args.projectId);
      if (!project || project.userId !== user._id) {
        throw new Error("Project not found or access denied");
      }

      const config = generateConfiguration(project, args.type);

      // Note: Using withIndex + filter; keeping behavior, improving safety with try/catch
      const existing = await ctx.db
        .query("configurations")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .filter((q) => q.eq(q.field("type"), args.type))
        .first();

      if (existing) {
        await ctx.db.patch(existing._id, {
          content: config.content,
          name: config.name,
          description: config.description,
        });
        return existing._id;
      } else {
        return await ctx.db.insert("configurations", {
          projectId: args.projectId,
          type: args.type,
          name: config.name,
          content: config.content,
          description: config.description,
        });
      }
    } catch (err) {
      console.error("configurations.generate error", { args, err });
      throw new Error("Failed to generate configuration.");
    }
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    try {
      const user = await getCurrentUser(ctx);
      if (!user) {
        return [];
      }

      const project = await ctx.db.get(args.projectId);
      if (!project || project.userId !== user._id) {
        return [];
      }

      return await ctx.db
        .query("configurations")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } catch (err) {
      console.error("configurations.listByProject error", { args, err });
      return [];
    }
  },
});

function generateConfiguration(project: any, type: string) {
  switch (type) {
    case "dockerfile":
      return generateDockerfile(project);
    case "kubernetes":
      return generateKubernetes(project);
    case "terraform":
      return generateTerraform(project);
    case "github-actions":
      return generateGithubActions(project);
    case "docker-compose":
      return generateDockerCompose(project);
    default:
      throw new Error("Unknown configuration type");
  }
}

function generateDockerfile(project: any) {
  let content = "";
  
  switch (project.techStack) {
    case "mern":
    case "nextjs":
      content = `# Node.js Dockerfile for ${project.name}
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:3000/health || exit 1

# Start the application
CMD ["npm", "start"]`;
      break;
    
    case "django":
    case "flask":
      content = `# Python Dockerfile for ${project.name}
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    gcc \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \\
  CMD curl -f http://localhost:8000/health || exit 1

# Start the application
CMD ["python", "manage.py", "runserver", "0.0.0.0:8000"]`;
      break;
    
    default:
      content = `# Generic Dockerfile for ${project.name}
FROM alpine:latest

WORKDIR /app
COPY . .

EXPOSE 8080
CMD ["./start.sh"]`;
  }

  return {
    name: "Dockerfile",
    content,
    description: `Docker configuration for ${project.name} (${project.techStack})`,
  };
}

function generateKubernetes(project: any) {
  const content = `# Kubernetes deployment for ${project.name}
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${project.name.toLowerCase().replace(/\s+/g, '-')}
  labels:
    app: ${project.name.toLowerCase().replace(/\s+/g, '-')}
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${project.name.toLowerCase().replace(/\s+/g, '-')}
  template:
    metadata:
      labels:
        app: ${project.name.toLowerCase().replace(/\s+/g, '-')}
    spec:
      containers:
      - name: app
        image: ${project.name.toLowerCase().replace(/\s+/g, '-')}:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        resources:
          requests:
            memory: "256Mi"
            cpu: "250m"
          limits:
            memory: "512Mi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: ${project.name.toLowerCase().replace(/\s+/g, '-')}-service
spec:
  selector:
    app: ${project.name.toLowerCase().replace(/\s+/g, '-')}
  ports:
    - protocol: TCP
      port: 80
      targetPort: 3000
  type: LoadBalancer`;

  return {
    name: "kubernetes.yaml",
    content,
    description: `Kubernetes deployment configuration for ${project.name}`,
  };
}

function generateTerraform(project: any) {
  const slug = project.name.toLowerCase().replace(/\s+/g, '-');
  const content = `# Terraform configuration for ${project.name}
terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-west-2"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

# VPC
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = {
    Name        = "${slug}-vpc"
    Environment = var.environment
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${slug}-igw"
    Environment = var.environment
  }
}

# Public Subnets
resource "aws_subnet" "public" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.\${count.index + 1}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  map_public_ip_on_launch = true

  tags = {
    Name        = "${slug}-public-\${count.index + 1}"
    Environment = var.environment
  }
}

data "aws_availability_zones" "available" {
  state = "available"
}

# Route Table
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = {
    Name        = "${slug}-public-rt"
    Environment = var.environment
  }
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Security Group
resource "aws_security_group" "app" {
  name_prefix = "${slug}-"
  vpc_id      = aws_vpc.main.id

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "${slug}-sg"
    Environment = var.environment
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${slug}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.app.id]
  subnets            = aws_subnet.public[*].id

  tags = {
    Name        = "${slug}-alb"
    Environment = var.environment
  }
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

# -------------------------------------------------------------------
# Secrets Management (AWS Secrets Manager + KMS) - Least Privilege
# -------------------------------------------------------------------

# KMS key for encrypting secrets
resource "aws_kms_key" "secrets" {
  description             = "${slug} secrets encryption key"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = {
    Name        = "${slug}-secrets-kms"
    Environment = var.environment
  }
}

# Secrets Manager secret container
resource "aws_secretsmanager_secret" "app" {
  name       = "${slug}/\${var.environment}/app"
  kms_key_id = aws_kms_key.secrets.arn

  tags = {
    Name        = "${slug}-app-secret"
    Environment = var.environment
  }
}

# Initial secret version (example payload; replace with CI-injected values)
resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode({
    DATABASE_URL = "postgresql://user:password@host:5432/${slug}"
    API_KEY      = "change-me"
  })
}

# -----------------------------------------------------------------------------
# OPTIONAL: Secret Rotation (enable by providing a rotation Lambda)
# -----------------------------------------------------------------------------
# To enable rotation, deploy a rotation Lambda (AWS provides blueprints) and set
# its ARN below. Then uncomment the aws_secretsmanager_secret_rotation resource.
#
# variable "rotation_lambda_arn" {
#   description = "ARN of the Lambda function that performs secret rotation"
#   type        = string
#   default     = ""
# }
#
# resource "aws_secretsmanager_secret_rotation" "app" {
#   secret_id           = aws_secretsmanager_secret.app.id
#   rotation_lambda_arn = var.rotation_lambda_arn
#
#   rotation_rules {
#     automatically_after_days = 90  # rotate every 90 days
#   }
# }
#
# Notes:
# - Use AWS-provided rotation templates for common engines (e.g., RDS, DocumentDB).
# - Ensure the Lambda's execution role can:
#   * Read/write the secret (secretsmanager:GetSecretValue, PutSecretValue, DescribeSecret)
#   * Decrypt with KMS (kms:Decrypt)
#   * Update the secret's staging labels (secretsmanager:UpdateSecretVersionStage)
# - Validate rotated credentials before promoting AWSCURRENT; roll back on failure.

# IAM policy granting read access to only this secret
resource "aws_iam_policy" "app_secrets_read" {
  name   = "${slug}-secrets-read"
  path   = "/"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AppSecretsReadOnly"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [aws_secretsmanager_secret.app.Arn]
      }
    ]
  })
}

# Note: Attach the policy above to your app/compute role (ECS task role, EKS service account via IRSA, EC2 instance profile, etc.)
# Example (uncomment and bind to your role ARN):
# resource "aws_iam_role_policy_attachment" "app_secrets_read_attach" {
#   role       = aws_iam_role.app_role.name
#   policy_arn = aws_iam_policy.app_secrets_read.arn
# }

# -------------------------------------------------------------------
# CloudTrail + CloudWatch logging for secret access auditing
# -------------------------------------------------------------------

# CloudWatch log group for CloudTrail
resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/aws/cloudtrail/${slug}"
  retention_in_days = 90

  tags = {
    Name        = "${slug}-cloudtrail-logs"
    Environment = var.environment
  }
}

# IAM role for CloudTrail to publish logs to CloudWatch
data "aws_iam_policy_document" "cloudtrail_assume_role" {
  statement {
    effect = "Allow"
    principals {
      type        = "Service"
      identifiers = ["cloudtrail.amazonaws.com"]
    }
    actions = ["sts:AssumeRole"]
  }
}

resource "aws_iam_role" "cloudtrail" {
  name               = "${slug}-cloudtrail-role"
  assume_role_policy = data.aws_iam_policy_document.cloudtrail_assume_role.json
  tags = {
    Name        = "${slug}-cloudtrail-role"
    Environment = var.environment
  }
}

# Policy allowing CloudTrail to write to CloudWatch Logs
data "aws_iam_policy_document" "cloudtrail_to_cwlogs" {
  statement {
    sid     = "AllowWriteCWLogs"
    effect  = "Allow"
    actions = [
      "logs:CreateLogStream",
      "logs:PutLogEvents"
    ]
    resources = ["\${aws_cloudwatch_log_group.cloudtrail.arn}:*"]
  }
}

resource "aws_iam_role_policy" "cloudtrail_to_cwlogs" {
  name   = "${slug}-cloudtrail-to-cwlogs"
  role   = aws_iam_role.cloudtrail.id
  policy = data.aws_iam_policy_document.cloudtrail_to_cwlogs.json
}

# CloudTrail capturing management events, integrated with CW Logs and encrypted by KMS
resource "aws_cloudtrail" "main" {
  name                          = "${slug}-trail"
  s3_bucket_name                = aws_s3_bucket.logs.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true

  # Encrypt trail logs (optional but recommended)
  kms_key_id = aws_kms_key.secrets.arn

  cloud_watch_logs_group_arn = aws_cloudwatch_log_group.cloudtrail.arn
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail.arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true
  }

  tags = {
    Name        = "${slug}-trail"
    Environment = var.environment
  }
}

# Metric filter for Secrets Manager access (GetSecretValue / PutSecretValue)
resource "aws_cloudwatch_log_metric_filter" "secrets_access" {
  name           = "${slug}-secrets-access"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = "{ ($.eventSource = \"secretsmanager.amazonaws.com\") && (($.eventName = \"GetSecretValue\") || ($.eventName = \"PutSecretValue\")) }"

  metric_transformation {
    name      = "${slug}-secrets-access-count"
    namespace = "Security"
    value     = "1"
  }
}

# Example alarm: spike in secret access events
resource "aws_cloudwatch_metric_alarm" "secrets_access_spike" {
  alarm_name          = "${slug}-secrets-access-spike"
  alarm_description   = "Alerts on spikes of Secrets Manager access events (Get/PutSecretValue)."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 20
  metric_name         = aws_cloudwatch_log_metric_filter.secrets_access.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.secrets_access.metric_transformation[0].namespace
  period              = 300
  statistic           = "Sum"

  # Add SNS topics as needed
  # alarm_actions = [aws_sns_topic.security_alerts.arn]
  # ok_actions    = [aws_sns_topic.security_alerts.arn]

  tags = {
    Name        = "${slug}-secrets-access-spike"
    Environment = var.environment
  }
}

# Metric filter for Secrets Manager updates (Create/Update/Rotate/Delete)
resource "aws_cloudwatch_log_metric_filter" "secrets_update" {
  name           = "${slug}-secrets-update"
  log_group_name = aws_cloudwatch_log_group.cloudtrail.name
  pattern        = "{ ($.eventSource = \"secretsmanager.amazonaws.com\") && (($.eventName = \"CreateSecret\") || ($.eventName = \"UpdateSecret\") || ($.eventName = \"UpdateSecretVersionStage\") || ($.eventName = \"RotateSecret\") || ($.eventName = \"DeleteSecret\")) }"

  metric_transformation {
    name      = "${slug}-secrets-update-count"
    namespace = "Security"
    value     = "1"
  }
}

# Alarm: alert on any Secrets Manager update events
resource "aws_cloudwatch_metric_alarm" "secrets_update_change" {
  alarm_name          = "${slug}-secrets-update-change"
  alarm_description   = "Alerts on Secrets Manager update events (Create/Update/Rotate/Delete)."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = 1
  threshold           = 1
  metric_name         = aws_cloudwatch_log_metric_filter.secrets_update.metric_transformation[0].name
  namespace           = aws_cloudwatch_log_metric_filter.secrets_update.metric_transformation[0].namespace
  period              = 300
  statistic           = "Sum"

  # Add SNS topics as needed
  # alarm_actions = [aws_sns_topic.security_alerts.arn]
  # ok_actions    = [aws_sns_topic.security_alerts.arn]

  tags = {
    Name        = "${slug}-secrets-update-change"
    Environment = var.environment
  }
}
`;

  return {
    name: "main.tf",
    content,
    description: `Terraform infrastructure configuration (with Secrets Manager + KMS + CloudTrail/CW logs for ${project.name})`,
  };
}

function generateGithubActions(project: any) {
  const content = `# GitHub Actions CI/CD for ${project.name}
name: CI/CD Pipeline

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: \${{ github.repository }}

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup Node.js
      uses: actions/setup-node@v4
      with:
        node-version: '18'
        cache: 'npm'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Run tests
      run: npm test
    
    - name: Run linting
      run: npm run lint
    
    - name: Build application
      run: npm run build

  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    
    permissions:
      contents: read
      packages: write
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: \${{ env.REGISTRY }}
        username: \${{ github.actor }}
        password: \${{ secrets.GITHUB_TOKEN }}
    
    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: \${{ env.REGISTRY }}/\${{ env.IMAGE_NAME }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=sha,prefix={{branch}}-
    
    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: .
        push: true
        tags: \${{ steps.meta.outputs.tags }}
        labels: \${{ steps.meta.outputs.labels }}

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    
    steps:
    - name: Deploy to production
      run: |
        echo "Deploying to production..."
        # Add your deployment commands here
        # kubectl apply -f k8s/
        # or terraform apply
        # or your preferred deployment method`;

  return {
    name: ".github/workflows/ci-cd.yml",
    content,
    description: `GitHub Actions CI/CD pipeline for ${project.name}`,
  };
}

function generateDockerCompose(project: any) {
  const content = `# Docker Compose for ${project.name}
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:password@db:5432/${project.name.toLowerCase().replace(/\s+/g, '_')}
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  db:
    image: postgres:15-alpine
    environment:
      - POSTGRES_DB=${project.name.toLowerCase().replace(/\s+/g, '_')}
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 5s
      retries: 3

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl:/etc/nginx/ssl:ro
    depends_on:
      - app
    restart: unless-stopped

volumes:
  postgres_data:
  redis_data:

networks:
  default:
    driver: bridge`;

  return {
    name: "docker-compose.yml",
    content,
    description: `Docker Compose configuration for ${project.name}`,
  };
}