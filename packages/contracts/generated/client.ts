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
  | "createReview"
  | "listReceipts";
export const paths = {
  uploads: "/v1/uploads",
  jobs: "/v1/jobs",
  motionScene: "/v1/jobs/{id}/motion-scene",
  motionSceneRollback: "/v1/jobs/{id}/motion-scene/rollback",
  motionSceneRender: "/v1/jobs/{id}/motion-scene/render",
  deliverables: "/v1/jobs/{id}/deliverables",
  scenePackage: "/v1/jobs/{id}/scene-package-download",
  reviews: "/v1/reviews",
  receipts: "/v1/receipts",
} as const;
