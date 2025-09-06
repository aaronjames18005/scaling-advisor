"use node";

import { action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

export const run = action({
  args: {},
  handler: async (ctx) => {
    const results: Array<{ step: string; ok: boolean; message: string }> = [];

    // Helper to run a step and capture error message
    async function testStep(step: string, fn: () => Promise<any>) {
      try {
        await fn();
        results.push({ step, ok: true, message: "ok" });
      } catch (err: any) {
        results.push({
          step,
          ok: false,
          message:
            err instanceof Error
              ? err.message
              : typeof err === "string"
              ? err
              : JSON.stringify(err),
        });
      }
    }

    // 1) Query without auth: should return [] and not throw
    await testStep("projects.list (unauthenticated)", async () => {
      await ctx.runQuery(api.projects.list, {});
    });

    // 2) Create without auth: should throw "Unauthorized"
    await testStep("projects.create (unauthenticated)", async () => {
      await ctx.runMutation(api.projects.create, {
        name: "Test Project",
        description: "Should not be created",
        techStack: "nextjs",
        currentPhase: "startup",
        targetPhase: "growth",
        currentInfra: "single instance",
        scalingGoals: ["goal1"],
      });
    });

    // 3) configurations.listByProject without auth: validator requires an Id, so we provide a bogus-but-shaped id.
    // It will fail at handler auth check or at DB get if the id doesn't exist.
    const bogusProjectId = "000000000000000000000000" as Id<"projects">;
    await testStep("configurations.listByProject (unauthenticated)", async () => {
      await ctx.runQuery(api.configurations.listByProject, { projectId: bogusProjectId });
    });

    // 4) configurations.generate without auth: should throw "Unauthorized"
    await testStep("configurations.generate (unauthenticated)", async () => {
      await ctx.runMutation(api.configurations.generate, {
        projectId: bogusProjectId,
        type: "dockerfile",
      });
    });

    // 5) roadmap.listByProject without auth: should return [] and not throw
    await testStep("roadmap.listByProject (unauthenticated)", async () => {
      await ctx.runQuery(api.roadmap.listByProject, { projectId: bogusProjectId });
    });

    // 6) roadmap.generateForProject without auth: should throw "Unauthorized"
    await testStep("roadmap.generateForProject (unauthenticated)", async () => {
      await ctx.runMutation(api.roadmap.generateForProject, { projectId: bogusProjectId });
    });

    // 7) roadmap.toggleComplete without auth: validator requires step id; use bogus id shape.
    const bogusStepId = "000000000000000000000000" as Id<"roadmapSteps">;
    await testStep("roadmap.toggleComplete (unauthenticated)", async () => {
      await ctx.runMutation(api.roadmap.toggleComplete, { id: bogusStepId });
    });

    return {
      summary: {
        total: results.length,
        passed: results.filter((r) => r.ok).length,
        failed: results.filter((r) => !r.ok).length,
      },
      results,
    };
  },
});
