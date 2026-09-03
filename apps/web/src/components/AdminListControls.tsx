import type { ReactNode } from "react";

export function ProblemPanel({
  title,
  message,
  signInHref,
  signInLabel,
}: {
  readonly title: string;
  readonly message: string;
  readonly signInHref?: string;
  readonly signInLabel?: string;
}) {
  return (
    <section className="panel">
      <h1>{title}</h1>
      <p>{message}</p>
      {signInHref ? (
        <a className="button button-primary" href={signInHref}>
          {signInLabel}
        </a>
      ) : null}
    </section>
  );
}

export function FilterBar({
  action,
  children,
  t,
  className,
  landmark = "filters",
}: {
  readonly action: string;
  readonly children: ReactNode;
  readonly t: (key: "applyFilters" | "clear") => string;
  readonly className?: string;
  readonly landmark?: string;
}) {
  return (
    <form
      className={className ? `filter-bar ${className}` : "filter-bar"}
      action={action}
      method="get"
      data-landmark={landmark}
    >
      <div className="filter-fields">{children}</div>
      <div className="filter-actions">
        <button className="button button-primary" type="submit">
          {t("applyFilters")}
        </button>
        <a className="button" href={action}>
          {t("clear")}
        </a>
      </div>
    </form>
  );
}
