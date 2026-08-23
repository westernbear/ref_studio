import { z } from "zod";
import { JobStateSchema, PublicJobStates } from "./lifecycle.js";

export const JobSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  creatorId: z.string(),
  uploadId: z.string(),
  sceneId: z.string(),
  state: JobStateSchema,
  attempt: z.number().int().positive(),
  progress: z
    .object({ framesRendered: z.number(), framesTotal: z.number() })
    .optional(),
  artifact: z
    .object({ id: z.string(), contentType: z.string(), expiresAt: z.string() })
    .nullable(),
  error: z.object({ code: z.string(), message: z.string() }).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Job = z.infer<typeof JobSchema>;
export const CreatorJobProjectionSchema = JobSchema.extend({
  state: z.enum(PublicJobStates),
}).omit({ creatorId: true });
export const AdminJobProjectionSchema = JobSchema.extend({
  internal: z.object({
    deletionEpoch: z.number(),
    retryClass: z.string().nullable(),
  }),
});
export type CreatorJobProjection = z.infer<typeof CreatorJobProjectionSchema>;
export type AdminJobProjection = z.infer<typeof AdminJobProjectionSchema>;
export function projectJob(
  job: Job,
  view: "CREATOR" | "ADMIN",
): CreatorJobProjection | AdminJobProjection {
  if (view === "ADMIN")
    return { ...job, internal: { deletionEpoch: 0, retryClass: null } };
  if (!PublicJobStates.includes(job.state as (typeof PublicJobStates)[number]))
    throw new Error("INTERNAL_ERROR");
  return CreatorJobProjectionSchema.parse({
    id: job.id,
    tenantId: job.tenantId,
    uploadId: job.uploadId,
    sceneId: job.sceneId,
    state: job.state,
    attempt: job.attempt,
    ...(job.progress ? { progress: job.progress } : {}),
    artifact: job.artifact,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
  });
}
