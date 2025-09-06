import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

export const generateForProject = mutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("User must be authenticated");
    }

    const project = await ctx.db.get(args.projectId);
    if (!project || project.userId !== user._id) {
      throw new Error("Project not found or access denied");
    }

    // Clear existing recommendations
    const existingRecs = await ctx.db
      .query("recommendations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
    
    for (const rec of existingRecs) {
      await ctx.db.delete(rec._id);
    }

    // Generate new recommendations based on tech stack and phase
    const recommendations = getRecommendationsForProject(project);
    
    for (const rec of recommendations) {
      await ctx.db.insert("recommendations", {
        projectId: args.projectId,
        ...rec,
        isCompleted: false,
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
      .query("recommendations")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();
  },
});

export const toggleComplete = mutation({
  args: { id: v.id("recommendations") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("User must be authenticated");
    }

    const recommendation = await ctx.db.get(args.id);
    if (!recommendation) {
      throw new Error("Recommendation not found");
    }

    const project = await ctx.db.get(recommendation.projectId);
    if (!project || project.userId !== user._id) {
      throw new Error("Access denied");
    }

    await ctx.db.patch(args.id, {
      isCompleted: !recommendation.isCompleted,
    });
  },
});

function getRecommendationsForProject(project: any) {
  const recommendations = [];

  // Base recommendations for all projects
  if (project.currentPhase === "startup") {
    recommendations.push({
      title: "🐳 Containerize with Docker",
      description: "Package your application in containers for consistent deployment across environments",
      priority: "high" as const,
      category: "containerization",
      estimatedImpact: "High - Enables consistent deployments",
      implementationTime: "1-2 days",
    });

    recommendations.push({
      title: "⚙️ Set up CI/CD Pipeline",
      description: "Automate testing and deployment with GitHub Actions or similar",
      priority: "high" as const,
      category: "automation",
      estimatedImpact: "High - Reduces deployment errors",
      implementationTime: "2-3 days",
    });
  }

  if (project.currentPhase === "growth") {
    recommendations.push({
      title: "⚖️ Add Load Balancer",
      description: "Distribute traffic across multiple instances for better performance",
      priority: "high" as const,
      category: "load-balancing",
      estimatedImpact: "High - Improves availability",
      implementationTime: "1 day",
    });

    recommendations.push({
      title: "🧊 Implement Redis Caching",
      description: "Add Redis for session storage and frequently accessed data",
      priority: "medium" as const,
      category: "caching",
      estimatedImpact: "Medium - Reduces database load",
      implementationTime: "2-3 days",
    });

    recommendations.push({
      title: "📈 Enable Auto-scaling",
      description: "Automatically scale instances based on traffic and resource usage",
      priority: "medium" as const,
      category: "scaling",
      estimatedImpact: "High - Handles traffic spikes",
      implementationTime: "3-4 days",
    });
  }

  if (project.currentPhase === "scale") {
    recommendations.push({
      title: "🗄️ Database Optimization",
      description: "Implement read replicas and query optimization",
      priority: "high" as const,
      category: "database",
      estimatedImpact: "High - Improves query performance",
      implementationTime: "1 week",
    });

    recommendations.push({
      title: "☸️ Migrate to Kubernetes",
      description: "Use Kubernetes for advanced orchestration and scaling",
      priority: "medium" as const,
      category: "orchestration",
      estimatedImpact: "High - Better resource management",
      implementationTime: "2-3 weeks",
    });

    recommendations.push({
      title: "📊 Advanced Monitoring",
      description: "Set up comprehensive monitoring with Prometheus and Grafana",
      priority: "medium" as const,
      category: "monitoring",
      estimatedImpact: "Medium - Better observability",
      implementationTime: "1 week",
    });
  }

  // Tech stack specific recommendations
  if (project.techStack === "mern") {
    recommendations.push({
      title: "🔄 Optimize React Bundle",
      description: "Implement code splitting and lazy loading for better performance",
      priority: "medium" as const,
      category: "frontend",
      estimatedImpact: "Medium - Faster page loads",
      implementationTime: "2-3 days",
    });
  }

  return recommendations;
}
