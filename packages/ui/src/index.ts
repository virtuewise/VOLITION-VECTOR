import { createElement, type ComponentPropsWithoutRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary";

export type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  readonly variant?: ButtonVariant;
};

export function Button({
  type = "button",
  variant = "primary",
  className,
  ...props
}: ButtonProps) {
  return createElement("button", {
    ...props,
    className: joinClassNames("vv-button", className),
    type,
    "data-variant": variant,
  });
}

export type SkipLinkProps = ComponentPropsWithoutRef<"a"> & {
  readonly "aria-hidden"?: false;
};

export function SkipLink({
  href = "#main-content",
  className,
  ...props
}: SkipLinkProps) {
  return createElement("a", {
    ...props,
    href,
    "aria-hidden": false,
    className: joinClassNames("vv-skip-link", className),
  });
}

export type VisuallyHiddenProps = ComponentPropsWithoutRef<"span"> & {
  readonly "aria-hidden"?: false;
};

export function VisuallyHidden({
  className,
  ...props
}: VisuallyHiddenProps) {
  return createElement("span", {
    ...props,
    "aria-hidden": false,
    className: joinClassNames("vv-visually-hidden", className),
  });
}

function joinClassNames(base: string, className?: string): string {
  return className ? `${base} ${className}` : base;
}
