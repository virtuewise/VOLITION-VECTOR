import { describe, expect, it } from "vitest";
import { Button, SkipLink, VisuallyHidden } from "./index.js";

describe("Button", () => {
  it("renders a native button with a non-submitting default type", () => {
    const element = Button({ children: "Save" });

    expect(element.type).toBe("button");
    expect(element.props).toMatchObject({
      children: "Save",
      type: "button",
      "data-variant": "primary",
      className: "vv-button",
    });
  });

  it("preserves native disabled and form semantics", () => {
    const element = Button({
      children: "Continue",
      type: "submit",
      variant: "secondary",
      disabled: true,
      className: "custom-button",
    });

    expect(element.props).toMatchObject({
      type: "submit",
      "data-variant": "secondary",
      disabled: true,
      className: "vv-button custom-button",
    });
  });
});

describe("SkipLink", () => {
  it("targets the documented main landmark by default", () => {
    const element = SkipLink({ children: "Skip to content" });

    expect(element.type).toBe("a");
    expect(element.props).toMatchObject({
      href: "#main-content",
      children: "Skip to content",
      className: "vv-skip-link",
    });
  });

  it("supports an explicit target without discarding caller attributes", () => {
    const element = SkipLink({
      href: "#results",
      children: "Skip to results",
      className: "custom-link",
      title: "Jump to results",
    });

    expect(element.props).toMatchObject({
      href: "#results",
      title: "Jump to results",
      className: "vv-skip-link custom-link",
    });
  });
});

describe("VisuallyHidden", () => {
  it("keeps content in the accessibility tree using a dedicated class", () => {
    const element = VisuallyHidden({
      children: "Search results updated",
      id: "search-status",
      role: "status",
      className: "custom-status",
    });

    expect(element.type).toBe("span");
    expect(element.props).toMatchObject({
      children: "Search results updated",
      id: "search-status",
      role: "status",
      className: "vv-visually-hidden custom-status",
    });
    expect(element.props["aria-hidden"]).toBeUndefined();
  });
});
