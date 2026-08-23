import type { HTMLAttributes, ReactNode } from "react";

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
