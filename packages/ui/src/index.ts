import { createElement, type ComponentPropsWithoutRef } from "react";

export type ButtonVariant = "primary" | "secondary" | "tertiary";

export type ButtonProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "type"
> & {
  readonly type?: "button" | "submit" | "reset";
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

export type SkipLinkProps = Omit<
  ComponentPropsWithoutRef<"a">,
  "href"
> & {
  readonly href?: string;
};

export function SkipLink({
  href = "#main-content",
  className,
  ...props
}: SkipLinkProps) {
  return createElement("a", {
    ...props,
    href,
    className: joinClassNames("vv-skip-link", className),
  });
}

export type VisuallyHiddenProps = ComponentPropsWithoutRef<"span">;

export function VisuallyHidden({
  className,
  ...props
}: VisuallyHiddenProps) {
  return createElement("span", {
    ...props,
    className: joinClassNames("vv-visually-hidden", className),
  });
}

function joinClassNames(base: string, className?: string): string {
  return className ? `${base} ${className}` : base;
}
