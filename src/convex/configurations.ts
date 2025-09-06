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
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("User must be authenticated");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== user._id) {
      throw new Error("Project not found or access denied");
    }

    // Generate configuration based on type and project details
    const config = generateConfiguration(project, args.type);
    
    // Check if configuration already exists
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
  },
});

export const listByProject = query({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
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
    Name        = "${project.name.toLowerCase().replace(/\s+/g, '-')}-vpc"
    Environment = var.environment
  }
}

# Internet Gateway
resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = {
    Name        = "${project.name.toLowerCase().replace(/\s+/g, '-')}-igw"
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
    Name        = "${project.name.toLowerCase().replace(/\s+/g, '-')}-public-\${count.index + 1}"
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
    Name        = "${project.name.toLowerCase().replace(/\s+/g, '-')}-public-rt"
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
  name_prefix = "${project.name.toLowerCase().replace(/\s+/g, '-')}-"
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
    Name        = "${project.name.toLowerCase().replace(/\s+/g, '-')}-sg"
    Environment = var.environment
  }
}

# Application Load Balancer
resource "aws_lb" "main" {
  name               = "${project.name.toLowerCase().replace(/\s+/g, '-')}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.app.id]
  subnets            = aws_subnet.public[*].id

  tags = {
    Name        = "${project.name.toLowerCase().replace(/\s+/g, '-')}-alb"
    Environment = var.environment
  }
}

output "load_balancer_dns" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}`;

  return {
    name: "main.tf",
    content,
    description: `Terraform infrastructure configuration for ${project.name}`,
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
