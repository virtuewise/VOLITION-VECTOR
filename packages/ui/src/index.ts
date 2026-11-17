import { createElement, type ComponentPropsWithoutRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary";

export interface ButtonProps extends ComponentPropsWithoutRef<"button"> {
  variant?: ButtonVariant;
}

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

export interface SkipLinkProps extends ComponentPropsWithoutRef<"a"> {
  "aria-hidden"?: false;
}

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

export interface VisuallyHiddenProps extends ComponentPropsWithoutRef<"span"> {
  "aria-hidden"?: false;
}

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
