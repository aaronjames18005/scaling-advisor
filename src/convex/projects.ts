import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getCurrentUser } from "./users";

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
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("User must be authenticated");
    }

    const projectId = await ctx.db.insert("projects", {
      userId: user._id,
      name: args.name,
      description: args.description,
      techStack: args.techStack,
      currentPhase: args.currentPhase,
      targetPhase: args.targetPhase,
      currentInfra: args.currentInfra,
      scalingGoals: args.scalingGoals,
      status: "active",
    });

    return projectId;
  },
});

export const list = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return [];
    }

    return await ctx.db
      .query("projects")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const get = query({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("User must be authenticated");
    }

    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== user._id) {
      throw new Error("Project not found or access denied");
    }

    return project;
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
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("User must be authenticated");
    }

    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== user._id) {
      throw new Error("Project not found or access denied");
    }

    const updates: any = {};
    if (args.name !== undefined) updates.name = args.name;
    if (args.description !== undefined) updates.description = args.description;
    if (args.status !== undefined) updates.status = args.status;

    await ctx.db.patch(args.id, updates);
  },
});

export const remove = mutation({
  args: { id: v.id("projects") },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new Error("User must be authenticated");
    }

    const project = await ctx.db.get(args.id);
    if (!project || project.userId !== user._id) {
      throw new Error("Project not found or access denied");
    }

    await ctx.db.delete(args.id);
  },
});
