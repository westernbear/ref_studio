import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly children?: ReactNode;
  readonly disabledReason?: string | undefined;
  readonly operationId: string | null;
  readonly sourceId: string;
  readonly state: string;
};

export function ActionButton({
  children,
  disabled,
  disabledReason,
  sourceId,
  operationId,
  state,
  ...props
}: ButtonProps) {
  const isDisabled = disabled ?? state.startsWith("disabled");
  return (
    <button
      {...props}
      data-control-id={sourceId}
      data-operation-id={operationId ?? "local"}
      aria-disabled={state.startsWith("disabled") ? "true" : "false"}
      disabled={isDisabled}
      aria-describedby={disabledReason ? `${sourceId}-reason` : undefined}
    >
      {children}
    </button>
  );
}

export function DisabledReason({
  id,
  reason,
}: {
  readonly id: string;
  readonly reason: string;
}) {
  return (
    <span id={id} className="sr-only">
      {reason}
    </span>
  );
}

export function Panel({
  children,
  ...props
}: HTMLAttributes<HTMLElement> & { readonly children?: ReactNode }) {
  return (
    <section {...props} className={`panel ${props.className ?? ""}`}>
      {children}
    </section>
  );
}
