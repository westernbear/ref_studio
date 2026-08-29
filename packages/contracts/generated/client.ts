export type ApiOperation =
  | "createUpload"
  | "createJob"
  | "getJob"
  | "getMotionScene"
  | "patchMotionScene"
  | "getDeliverables"
  | "downloadScenePackage"
  | "createReview"
  | "listReceipts";
export const paths = {
  uploads: "/v1/uploads",
  jobs: "/v1/jobs",
  motionScene: "/v1/jobs/{id}/motion-scene",
  deliverables: "/v1/jobs/{id}/deliverables",
  scenePackage: "/v1/jobs/{id}/scene-package-download",
  reviews: "/v1/reviews",
  receipts: "/v1/receipts",
} as const;
