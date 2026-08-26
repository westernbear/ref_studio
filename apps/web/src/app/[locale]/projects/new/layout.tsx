import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isAuthProblem, liveApiGet } from "../../../lib/server-api";

export default async function NewProjectLayout({
  children,
}: {
  readonly children: ReactNode;
}) {
  const session = await liveApiGet("/v1/jobs?limit=1");
  if (!session.ok && isAuthProblem(session.code))
    redirect(`/sign-in?returnTo=${encodeURIComponent("/projects/new")}`);
  return children;
}
