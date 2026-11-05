// R4-2b: DynamicIcon (libs/icons) accepts Phosphor and Lucide icons and any
// small component with { className, size }, and keeps the 1.2em box the app's
// `.lucide` rule gives Lucide icons. The icons lib has no vitest project, so
// these runtime checks live here, next to its biggest caller.
import { createRef } from "react";
import { render } from "@testing-library/react";
import { CaretDownIcon, TrashIcon } from "@phosphor-icons/react";
import { ChevronDownIcon } from "lucide-react";
import {
  DynamicIcon,
  type DynamicIconComponent,
  type DynamicIconProps,
} from "@storyteller/icons";

// --- constants ---

const DEFAULT_SIZE = "1.2em";

// Compile-time only: Lucide, Phosphor and a plain component all fit the prop.
const ACCEPTED: DynamicIconComponent[] = [
  CaretDownIcon,
  TrashIcon,
  ChevronDownIcon,
  ({ className, size }) => (
    <i data-testid="plain" className={className} data-size={String(size)} />
  ),
];
const PROPS_SHAPE: DynamicIconProps = { icon: CaretDownIcon, className: "x" };

// --- helpers ---

function svgOf(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector("svg");
  expect(svg).not.toBeNull();
  return svg as SVGSVGElement;
}

// --- tests ---

describe("R4-2b DynamicIcon", () => {
  it("type-level list is non-empty (Lucide, Phosphor and plain components accepted)", () => {
    expect(ACCEPTED).toHaveLength(4);
    expect(PROPS_SHAPE.icon).toBe(CaretDownIcon);
  });

  it("renders a Phosphor icon at the default 1.2em box", () => {
    const { container } = render(<DynamicIcon icon={CaretDownIcon} />);
    const svg = svgOf(container);
    expect(svg.getAttribute("width")).toBe(DEFAULT_SIZE);
    expect(svg.getAttribute("height")).toBe(DEFAULT_SIZE);
  });

  it("renders a Lucide icon at the same 1.2em box (existing callers)", () => {
    const { container } = render(<DynamicIcon icon={ChevronDownIcon} />);
    const svg = svgOf(container);
    expect(svg.getAttribute("width")).toBe(DEFAULT_SIZE);
    expect(svg.getAttribute("class") ?? "").toContain("lucide");
  });

  it("explicit size wins over the default, numbers and strings alike", () => {
    const a = render(<DynamicIcon icon={CaretDownIcon} size={16} />);
    expect(svgOf(a.container).getAttribute("width")).toBe("16");
    const b = render(<DynamicIcon icon={CaretDownIcon} size="2rem" />);
    expect(svgOf(b.container).getAttribute("width")).toBe("2rem");
  });

  it("size={0} is kept, not replaced by the default", () => {
    const { container } = render(<DynamicIcon icon={CaretDownIcon} size={0} />);
    expect(svgOf(container).getAttribute("width")).toBe("0");
  });

  it("size={undefined} falls back to the default", () => {
    const { container } = render(
      <DynamicIcon icon={CaretDownIcon} size={undefined} />,
    );
    expect(svgOf(container).getAttribute("width")).toBe(DEFAULT_SIZE);
  });

  it("forwards className and aria attributes to the icon", () => {
    const { container } = render(
      <DynamicIcon
        icon={TrashIcon}
        className="text-xs w-4"
        aria-label="Delete"
      />,
    );
    const svg = svgOf(container);
    expect(svg.getAttribute("class")).toContain("text-xs");
    expect(svg.getAttribute("class")).toContain("w-4");
    expect(svg.getAttribute("aria-label")).toBe("Delete");
  });

  it("forwards the ref to the Phosphor svg element", () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(<DynamicIcon ref={ref} icon={CaretDownIcon} />);
    expect(ref.current).toBe(svgOf(container));
  });

  it("forwards the ref to the Lucide svg element", () => {
    const ref = createRef<SVGSVGElement>();
    const { container } = render(
      <DynamicIcon ref={ref} icon={ChevronDownIcon} />,
    );
    expect(ref.current).toBe(svgOf(container));
  });

  it("works with a plain component that only takes className and size", () => {
    const { getByTestId } = render(
      <DynamicIcon icon={ACCEPTED[3]} className="h-4" />,
    );
    const el = getByTestId("plain");
    expect(el.className).toBe("h-4");
    expect(el.getAttribute("data-size")).toBe(DEFAULT_SIZE);
  });

  it("switching the icon at runtime swaps the rendered glyph", () => {
    const { container, rerender } = render(<DynamicIcon icon={CaretDownIcon} />);
    const first = svgOf(container).innerHTML;
    rerender(<DynamicIcon icon={TrashIcon} />);
    expect(svgOf(container).innerHTML).not.toBe(first);
  });
});
