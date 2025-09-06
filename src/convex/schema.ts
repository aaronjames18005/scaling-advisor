import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { Infer, v } from "convex/values";

// default user roles. can add / remove based on the project as needed
export const ROLES = {
  ADMIN: "admin",
  USER: "user",
  MEMBER: "member",
} as const;

export const roleValidator = v.union(
  v.literal(ROLES.ADMIN),
  v.literal(ROLES.USER),
  v.literal(ROLES.MEMBER),
);
export type Role = Infer<typeof roleValidator>;

// Project tech stacks
export const TECH_STACKS = {
  MERN: "mern",
  DJANGO: "django", 
  NEXTJS: "nextjs",
  LARAVEL: "laravel",
  RAILS: "rails",
  FLASK: "flask",
  SPRING: "spring",
  DOTNET: "dotnet",
} as const;

export const techStackValidator = v.union(
  v.literal(TECH_STACKS.MERN),
  v.literal(TECH_STACKS.DJANGO),
  v.literal(TECH_STACKS.NEXTJS),
  v.literal(TECH_STACKS.LARAVEL),
  v.literal(TECH_STACKS.RAILS),
  v.literal(TECH_STACKS.FLASK),
  v.literal(TECH_STACKS.SPRING),
  v.literal(TECH_STACKS.DOTNET),
);

// Scaling phases
export const SCALING_PHASES = {
  STARTUP: "startup",
  GROWTH: "growth", 
  SCALE: "scale",
  ENTERPRISE: "enterprise",
} as const;

export const scalingPhaseValidator = v.union(
  v.literal(SCALING_PHASES.STARTUP),
  v.literal(SCALING_PHASES.GROWTH),
  v.literal(SCALING_PHASES.SCALE),
  v.literal(SCALING_PHASES.ENTERPRISE),
);

const schema = defineSchema(
  {
    // default auth tables using convex auth.
    ...authTables, // do not remove or modify

    // the users table is the default users table that is brought in by the authTables
    users: defineTable({
      name: v.optional(v.string()), // name of the user. do not remove
      image: v.optional(v.string()), // image of the user. do not remove
      email: v.optional(v.string()), // email of the user. do not remove
      emailVerificationTime: v.optional(v.number()), // email verification time. do not remove
      isAnonymous: v.optional(v.boolean()), // is the user anonymous. do not remove

      role: v.optional(roleValidator), // role of the user. do not remove
    }).index("email", ["email"]), // index for the email. do not remove or modify

    // Projects table
    projects: defineTable({
      userId: v.id("users"),
      name: v.string(),
      description: v.optional(v.string()),
      techStack: techStackValidator,
      currentPhase: scalingPhaseValidator,
      targetPhase: scalingPhaseValidator,
      currentInfra: v.string(), // Current infrastructure description
      scalingGoals: v.array(v.string()), // Array of scaling goals
      status: v.union(v.literal("active"), v.literal("completed"), v.literal("archived")),
    }).index("by_user", ["userId"]),

    // Scaling recommendations
    recommendations: defineTable({
      projectId: v.id("projects"),
      title: v.string(),
      description: v.string(),
      priority: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      category: v.string(), // e.g., "caching", "load-balancing", "database"
      estimatedImpact: v.string(),
      implementationTime: v.string(),
      isCompleted: v.boolean(),
    }).index("by_project", ["projectId"]),

    // Generated configurations
    configurations: defineTable({
      projectId: v.id("projects"),
      type: v.union(
        v.literal("dockerfile"),
        v.literal("kubernetes"),
        v.literal("terraform"),
        v.literal("github-actions"),
        v.literal("docker-compose"),
        // Add security advisor generated artifacts
        v.literal("iam-policy"),
        v.literal("secrets-management"),
        v.literal("terraform-cis")
      ),
      name: v.string(),
      content: v.string(), // The actual configuration content
      description: v.optional(v.string()),
    }).index("by_project", ["projectId"]),

    // Scaling templates
    templates: defineTable({
      name: v.string(),
      description: v.string(),
      techStack: techStackValidator,
      phase: scalingPhaseValidator,
      category: v.string(),
      content: v.string(), // Template content (YAML/JSON)
      tags: v.array(v.string()),
      isPublic: v.boolean(),
      createdBy: v.optional(v.id("users")),
    }).index("by_tech_stack", ["techStack"])
      .index("by_phase", ["phase"])
      .index("by_category", ["category"]),

    // Roadmap steps
    roadmapSteps: defineTable({
      projectId: v.id("projects"),
      title: v.string(),
      description: v.string(),
      order: v.number(),
      isCompleted: v.boolean(),
      estimatedDuration: v.string(),
      dependencies: v.array(v.string()),
      resources: v.array(v.object({
        title: v.string(),
        url: v.string(),
        type: v.union(v.literal("documentation"), v.literal("tutorial"), v.literal("tool"))
      })),
    }).index("by_project", ["projectId"]),

    // Compliance checks (Security Advisor)
    complianceChecks: defineTable({
      projectId: v.id("projects"),
      title: v.string(),
      description: v.string(),
      category: v.string(), // e.g., "iam", "secrets", "networking", "kubernetes"
      severity: v.union(v.literal("high"), v.literal("medium"), v.literal("low")),
      standard: v.string(), // e.g., "cis-aws", "cis-k8s"
      remediation: v.string(),
      isPassed: v.boolean(),
    }).index("by_project", ["projectId"]),
  },
  {
    schemaValidation: false,
  },
);

export default schema;