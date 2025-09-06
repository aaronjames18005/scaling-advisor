import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

const MAX_NAME_LEN = 100;
const MAX_DESC_LEN = 1000;
const MAX_INFRA_LEN = 1000;
const MAX_GOALS = 10;
const MAX_GOAL_LEN = 200;

export const create = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    techStack: v.union(
      v.literal("mern"),
      v.literal("django"),
      v.literal("nextjs"),
      v.literal("laravel"),
      v.literal("rails"),
      v.literal("flask"),
      v.literal("spring"),
      v.literal("dotnet")
    ),
    currentPhase: v.union(
      v.literal("startup"),
      v.literal("growth"),
      v.literal("scale"),
      v.literal("enterprise")
    ),
    targetPhase: v.union(
      v.literal("startup"),
      v.literal("growth"),
      v.literal("scale"),
      v.literal("enterprise")
    ),
    currentInfra: v.string(),
    scalingGoals: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getCurrentUser(ctx);
      if (!user) {
        throw new Error("Unauthorized: User must be authenticated");
      }

      // Input normalization
      const name = args.name.trim();
      const description = args.description?.trim();
      const currentInfra = args.currentInfra.trim();
      const scalingGoals = Array.from(
        new Set(
          args.scalingGoals
            .map((g) => g.trim())
            .filter((g) => g.length > 0)
        )
      );

      // Validation
      if (name.length === 0) {
        throw new Error("Validation error: Project name cannot be empty.");
      }
      if (name.length > MAX_NAME_LEN) {
        throw new Error(`Validation error: Project name must be <= ${MAX_NAME_LEN} characters.`);
      }
      if (description && description.length > MAX_DESC_LEN) {
        throw new Error(`Validation error: Description must be <= ${MAX_DESC_LEN} characters.`);
      }
      if (currentInfra.length > MAX_INFRA_LEN) {
        throw new Error(`Validation error: Current infrastructure must be <= ${MAX_INFRA_LEN} characters.`);
      }
      if (scalingGoals.length > MAX_GOALS) {
        throw new Error(`Validation error: No more than ${MAX_GOALS} scaling goals allowed.`);
      }
      for (const goal of scalingGoals) {
        if (goal.length > MAX_GOAL_LEN) {
          throw new Error(`Validation error: Each scaling goal must be <= ${MAX_GOAL_LEN} characters.`);
        }
      }

      const projectId = await ctx.db.insert("projects", {
        userId: user._id,
        name,
        description,
        techStack: args.techStack,
        currentPhase: args.currentPhase,
        targetPhase: args.targetPhase,
        currentInfra,
        scalingGoals,
        status: "active",
      });

      return projectId;
    } catch (err) {
      console.error("projects.create error", { args, err });
      throw new Error(
        err instanceof Error && err.message.startsWith("Validation error:")
          ? err.message
          : "Failed to create project. Please try again."
      );
    }
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    try {
      const user = await getCurrentUser(ctx);
      if (!user) {
        return [];
      }

      return await ctx.db
        .query("projects")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
    } catch (err) {
      console.error("projects.list error", { err });
      // Return an empty array to avoid breaking consumers
      return [];
    }
  },
});

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    try {
      const user = await getCurrentUser(ctx);
      if (!user) {
        throw new Error("Unauthorized: User must be authenticated");
      }

      const project = await ctx.db.get(args.id);
      if (!project || project.userId !== user._id) {
        throw new Error("Project not found or access denied");
      }

      return project;
    } catch (err) {
      console.error("projects.get error", { args, err });
      throw new Error("Failed to load project.");
    }
  },
});

export const update = mutation({
  args: {
    id: v.id("projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    status: v.optional(v.union(v.literal("active"), v.literal("completed"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    try {
      const user = await getCurrentUser(ctx);
      if (!user) {
        throw new Error("Unauthorized: User must be authenticated");
      }

      const project = await ctx.db.get(args.id);
      if (!project || project.userId !== user._id) {
        throw new Error("Project not found or access denied");
      }

      const updates: any = {};

      if (args.name !== undefined) {
        const name = args.name.trim();
        if (name.length === 0) {
          throw new Error("Validation error: Project name cannot be empty.");
        }
        if (name.length > MAX_NAME_LEN) {
          throw new Error(`Validation error: Project name must be <= ${MAX_NAME_LEN} characters.`);
        }
        updates.name = name;
      }

      if (args.description !== undefined) {
        const description = args.description?.trim() ?? "";
        if (description.length > MAX_DESC_LEN) {
          throw new Error(`Validation error: Description must be <= ${MAX_DESC_LEN} characters.`);
        }
        updates.description = args.description;
      }

      if (args.status !== undefined) {
        updates.status = args.status;
      }

      await ctx.db.patch(args.id, updates);
    } catch (err) {
      console.error("projects.update error", { args, err });
      throw new Error(
        err instanceof Error && err.message.startsWith("Validation error:")
          ? err.message
          : "Failed to update project."
      );
    }
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    try {
      const user = await getCurrentUser(ctx);
      if (!user) {
        throw new Error("Unauthorized: User must be authenticated");
      }

      const project = await ctx.db.get(args.id);
      if (!project || project.userId !== user._id) {
        throw new Error("Project not found or access denied");
      }

      await ctx.db.delete(args.id);
    } catch (err) {
      console.error("projects.remove error", { args, err });
      throw new Error("Failed to delete project.");
    }
  },
});