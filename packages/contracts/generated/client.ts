import type {
  MotionSceneRenderV1,
  MotionSceneRollbackV1,
  MotionSceneSnapshotV1,
  SceneOperationBatchV1,
} from "../src/motion.js";
export type MotionMutationHeaders = Readonly<{
  "If-Match": string;
  "Idempotency-Key": string;
}>;
export type MotionApiRequests = Readonly<{
  patchMotionScene: {
    headers: MotionMutationHeaders;
    body: SceneOperationBatchV1;
  };
  rollbackMotionScene: {
    headers: MotionMutationHeaders;
    body: MotionSceneRollbackV1;
  };
  renderMotionScene: {
    headers: MotionMutationHeaders;
    body: MotionSceneRenderV1;
  };
  refinePrompt: {
    headers: MotionMutationHeaders;
    body: Readonly<{ prompt: string; locale?: string }>;
  };
}>;
export type MotionApiResponses = Readonly<{
  getMotionScene: MotionSceneSnapshotV1;
  patchMotionScene: MotionSceneSnapshotV1;
  rollbackMotionScene: MotionSceneSnapshotV1;
}>;
export type ApiOperation =
  | "createUpload"
  | "createJob"
  | "getJob"
  | "getMotionScene"
  | "patchMotionScene"
  | "rollbackMotionScene"
  | "renderMotionScene"
  | "getDeliverables"
  | "downloadScenePackage"
  | "downloadDelivery"
  | "downloadReport"
  | "refinePrompt"
  | "createReview"
  | "listReceipts";
export const paths = {
  uploads: "/v1/uploads",
  jobs: "/v1/jobs",
  motionScene: "/v1/jobs/{id}/motion-scene",
  motionSceneRollback: "/v1/jobs/{id}/motion-scene/rollback",
  motionSceneRender: "/v1/jobs/{id}/motion-scene/render",
  refinePrompt: "/v1/jobs/{id}/refine-prompt",
  deliverables: "/v1/jobs/{id}/deliverables",
  delivery: "/v1/jobs/{id}/delivery-download",
  report: "/v1/jobs/{id}/report-download",
  scenePackage: "/v1/jobs/{id}/scene-package-download",
  reviews: "/v1/reviews",
  receipts: "/v1/receipts",
} as const;
