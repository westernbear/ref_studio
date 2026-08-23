import { describe, expect, it } from "vitest"
import { buildAuthApp } from "./app.js"
import { hashWorkerToken, createWorkerStore } from "./workers.js"
import type { AuthStore } from "./auth.js"

const appFixture = () => {
  const token = "worker-test-token"
  const workers = createWorkerStore(hashWorkerToken(token))
  const auth: AuthStore = { users: [], credentials: [], memberships: [], assignments: [], sessions: [], apiTokens: [], audit: () => undefined }
  const app = buildAuthApp({ store: auth, expectedOrigin: "https://studio.invalid", introspectSecret: "not-a-worker-token", workers, now: () => 1_000 })
  return { app, workers, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" } }
}

describe("worker registration API", () => {
  it("Given a valid bearer token, when registering and heartbeating, then stores the worker lifecycle state", async () => {
    const fixture = appFixture()
    const registered = await fixture.app.inject({ method: "POST", url: "/v1/workers/register", headers: fixture.headers, payload: { workerId: "worker-a", capabilities: ["compiler"] } })
    const heartbeat = await fixture.app.inject({ method: "POST", url: "/v1/workers/worker-a/heartbeat", headers: fixture.headers, payload: { capabilities: ["compiler", "renderer"] } })
    expect(registered.statusCode).toBe(200); expect(registered.json()).toEqual({ workerId: "worker-a" }); expect(heartbeat.json()).toEqual({ workerId: "worker-a" }); expect(fixture.workers.workers.get("worker-a")).toMatchObject({ capabilities: ["compiler", "renderer"], lastHeartbeat: 1_000, status: "ONLINE" })
    await fixture.app.close()
  })

  it("Given no bearer token, when registering, then rejects the request without storing a worker", async () => {
    const fixture = appFixture()
    const response = await fixture.app.inject({ method: "POST", url: "/v1/workers/register", payload: { workerId: "worker-a", capabilities: ["compiler"] } })
    expect(response.statusCode).toBe(401); expect(response.json().error.code).toBe("AUTHENTICATION_REQUIRED"); expect(fixture.workers.workers.size).toBe(0)
    await fixture.app.close()
  })

  it("Given a registered worker, when claiming and completing an unknown job, then returns no job and a safe not-found error", async () => {
    const fixture = appFixture()
    await fixture.app.inject({ method: "POST", url: "/v1/workers/register", headers: fixture.headers, payload: { workerId: "worker-a", capabilities: ["compiler"] } })
    const claim = await fixture.app.inject({ method: "POST", url: "/v1/workers/worker-a/claim", headers: fixture.headers, payload: {} })
    const complete = await fixture.app.inject({ method: "POST", url: "/v1/workers/worker-a/jobs/job-missing/complete", headers: fixture.headers, payload: { result: {} } })
    expect(claim.json()).toEqual({ job: null }); expect(complete.statusCode).toBe(404); expect(complete.json().error.code).toBe("RESOURCE_NOT_FOUND")
    await fixture.app.close()
  })
})
