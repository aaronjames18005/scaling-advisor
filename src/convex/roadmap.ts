import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const generateForProject = mutation({
  args: { projectId: v.id("projects") },
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

      const existingSteps = await ctx.db
        .query("roadmapSteps")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();

      for (const step of existingSteps) {
        await ctx.db.delete(step._id);
      }

      const steps = generateRoadmapSteps(project);

      for (const step of steps) {
        await ctx.db.insert("roadmapSteps", {
          projectId: args.projectId,
          ...step,
          isCompleted: false,
        });
      }
    } catch (err) {
      console.error("roadmap.generateForProject error", { args, err });
      throw new Error("Failed to generate roadmap.");
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
        .query("roadmapSteps")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    } catch (err) {
      console.error("roadmap.listByProject error", { args, err });
      return [];
    }
  },
});

export const toggleComplete = mutation({
  args: { id: v.id("roadmapSteps") },
  handler: async (ctx, args) => {
    try {
      const user = await getCurrentUser(ctx);
      if (!user) {
        throw new Error("Unauthorized: User must be authenticated");
      }

      const step = await ctx.db.get(args.id);
      if (!step) {
        throw new Error("Roadmap step not found");
      }

      const project = await ctx.db.get(step.projectId);
      if (!project || project.userId !== user._id) {
        throw new Error("Access denied");
      }

      await ctx.db.patch(args.id, {
        isCompleted: !step.isCompleted,
      });
    } catch (err) {
      console.error("roadmap.toggleComplete error", { args, err });
      throw new Error("Failed to update roadmap step.");
    }
  },
});

function generateRoadmapSteps(project: any) {
  const steps = [];

  // Phase 1: Foundation
  steps.push({
    title: "🏗️ Foundation Setup",
    description: "Set up basic infrastructure and development workflow",
    order: 1,
    estimatedDuration: "1-2 weeks",
    dependencies: [],
    resources: [
      {
        title: "Docker Documentation",
        url: "https://docs.docker.com/",
        type: "documentation" as const,
      },
      {
        title: "Git Workflow Guide",
        url: "https://guides.github.com/introduction/flow/",
        type: "tutorial" as const,
      },
    ],
  });

  // Phase 2: Containerization
  steps.push({
    title: "🐳 Containerization",
    description: "Package your application in Docker containers",
    order: 2,
    estimatedDuration: "3-5 days",
    dependencies: ["Foundation Setup"],
    resources: [
      {
        title: "Dockerfile Best Practices",
        url: "https://docs.docker.com/develop/dev-best-practices/",
        type: "documentation" as const,
      },
      {
        title: "Docker Compose Tutorial",
        url: "https://docs.docker.com/compose/gettingstarted/",
        type: "tutorial" as const,
      },
    ],
  });

  // Phase 3: CI/CD
  steps.push({
    title: "⚙️ CI/CD Pipeline",
    description: "Automate testing and deployment processes",
    order: 3,
    estimatedDuration: "1 week",
    dependencies: ["Containerization"],
    resources: [
      {
        title: "GitHub Actions Documentation",
        url: "https://docs.github.com/en/actions",
        type: "documentation" as const,
      },
      {
        title: "CI/CD Best Practices",
        url: "https://docs.github.com/en/actions/learn-github-actions/essential-features-of-github-actions",
        type: "tutorial" as const,
      },
    ],
  });

  if (project.targetPhase === "growth" || project.targetPhase === "scale" || project.targetPhase === "enterprise") {
    // Phase 4: Load Balancing
    steps.push({
      title: "⚖️ Load Balancing",
      description: "Distribute traffic across multiple instances",
      order: 4,
      estimatedDuration: "3-5 days",
      dependencies: ["CI/CD Pipeline"],
      resources: [
        {
          title: "AWS Application Load Balancer",
          url: "https://docs.aws.amazon.com/elasticloadbalancing/latest/application/",
          type: "documentation" as const,
        },
        {
          title: "NGINX Load Balancing",
          url: "https://nginx.org/en/docs/http/load_balancing.html",
          type: "documentation" as const,
        },
      ],
    });

    // Phase 5: Caching
    steps.push({
      title: "🧊 Caching Layer",
      description: "Implement Redis caching for better performance",
      order: 5,
      estimatedDuration: "1 week",
      dependencies: ["Load Balancing"],
      resources: [
        {
          title: "Redis Documentation",
          url: "https://redis.io/documentation",
          type: "documentation" as const,
        },
        {
          title: "Caching Strategies",
          url: "https://redis.io/docs/manual/patterns/",
          type: "tutorial" as const,
        },
      ],
    });
  }

  if (project.targetPhase === "scale" || project.targetPhase === "enterprise") {
    // Phase 6: Auto-scaling
    steps.push({
      title: "📈 Auto-scaling",
      description: "Automatically scale based on demand",
      order: 6,
      estimatedDuration: "1-2 weeks",
      dependencies: ["Caching Layer"],
      resources: [
        {
          title: "Kubernetes Horizontal Pod Autoscaler",
          url: "https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/",
          type: "documentation" as const,
        },
        {
          title: "AWS Auto Scaling",
          url: "https://docs.aws.amazon.com/autoscaling/",
          type: "documentation" as const,
        },
      ],
    });

    // Phase 7: Database Optimization
    steps.push({
      title: "🗄️ Database Optimization",
      description: "Optimize database performance and implement read replicas",
      order: 7,
      estimatedDuration: "2-3 weeks",
      dependencies: ["Auto-scaling"],
      resources: [
        {
          title: "Database Performance Tuning",
          url: "https://www.postgresql.org/docs/current/performance-tips.html",
          type: "documentation" as const,
        },
        {
          title: "Read Replicas Guide",
          url: "https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_ReadRepl.html",
          type: "tutorial" as const,
        },
      ],
    });
  }

  if (project.targetPhase === "enterprise") {
    // Phase 8: Kubernetes Migration
    steps.push({
      title: "☸️ Kubernetes Migration",
      description: "Migrate to Kubernetes for advanced orchestration",
      order: 8,
      estimatedDuration: "3-4 weeks",
      dependencies: ["Database Optimization"],
      resources: [
        {
          title: "Kubernetes Documentation",
          url: "https://kubernetes.io/docs/",
          type: "documentation" as const,
        },
        {
          title: "Kubernetes Migration Guide",
          url: "https://kubernetes.io/docs/concepts/workloads/",
          type: "tutorial" as const,
        },
      ],
    });

    // Phase 9: Advanced Monitoring
    steps.push({
      title: "📊 Advanced Monitoring",
      description: "Implement comprehensive monitoring and alerting",
      order: 9,
      estimatedDuration: "2-3 weeks",
      dependencies: ["Kubernetes Migration"],
      resources: [
        {
          title: "Prometheus Documentation",
          url: "https://prometheus.io/docs/",
          type: "documentation" as const,
        },
        {
          title: "Grafana Tutorials",
          url: "https://grafana.com/tutorials/",
          type: "tutorial" as const,
        },
      ],
    });
  }

  return steps;
}