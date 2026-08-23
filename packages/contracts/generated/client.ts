export type ApiOperation = "createUpload" | "createJob" | "getJob" | "createReview" | "listReceipts"
export const paths = { uploads: "/v1/uploads", jobs: "/v1/jobs", reviews: "/v1/reviews", receipts: "/v1/receipts" } as const
