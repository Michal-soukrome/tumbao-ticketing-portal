import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import Panzoom, { type PanzoomObject } from "@panzoom/panzoom";
import { Minus, Plus, RotateCcw } from "lucide-react";
import type { SeatDto } from "../domain/models";
import { Button } from "./ui";

// NOTE: I now have your globals.css, so this file uses the *real* tokens
// (coral #e55f43, navy #161d35, muted #6d7280, green #17765b, line #deddd7)
// instead of the placeholder rose/slate palette I used for the earlier
// pages. Happy to pass over EventPage/AdminPage/etc. again with these exact
// values if you want everything consistent.
//
// The seat rects/text stay on plain SVG presentation attributes (fill,
// stroke, strokeWidth, fontSize…) rather than Tailwind's fill-[]/stroke-[]
// utilities. With ~800+ seats rendered per map, computing one JS object per
// seat is cheaper than building long arbitrary-value class strings per
// element, and it sidesteps things Tailwind has no direct utility for
// (decimal stroke-width like 1.8, the `.seat-selected + .seat-number`
// sibling selector — replaced below with a plain JS condition instead).
// Layout chrome (card, toolbar, viewport, legend) is full Tailwind.

interface SeatMapProps {
  seats: SeatDto[];
  selected: Set<string>;
  ownedHeld?: Set<string>;
  selectionLocked?: boolean;
  onToggle: (seat: SeatDto) => void;
}

const statusLabel = (seat: SeatDto, selected: boolean, ownedHeld: boolean) =>
  `Section ${seat.section}, row ${seat.rowLabel}, seat ${seat.seatNumber}, ${seat.priceCategory}, ${seat.priceMinor / 100} CZK, ${selected ? "selected" : ownedHeld ? "held by you" : seat.status.toLowerCase()}`;

const CATEGORY_FILL: Record<string, string> = {
  "1": "#f59a23",
  "2": "#83abe2",
  "3": "#f2ce2f",
};
const categoryFill = (category: string) =>
  CATEGORY_FILL[category[0] as "1" | "2" | "3"] ?? CATEGORY_FILL["3"];

function seatStyle(seat: SeatDto, isSelected: boolean, isOwnedHeld: boolean) {
  if (isSelected) return { fill: "#e55f43", stroke: "#551b11", strokeWidth: 2 };
  if (isOwnedHeld)
    return {
      fill: "#e4bb39",
      stroke: "#3d3108",
      strokeWidth: 2.2,
      className: "drop-shadow-[0_0_2px_rgba(255,210,45,0.85)]",
    };
  if (seat.status === "SOLD")
    return { fill: "#bcc4ce", stroke: "#757b87", cursor: "not-allowed" };
  if (seat.status === "HELD") return { fill: "#d3a93c", stroke: "#6f5210" };
  return { fill: categoryFill(seat.priceCategory), stroke: "#344252" };
}

function VenueFixtures() {
  const sectionLabels = [
    ["D", 255, 39],
    ["C", 389, 39],
    ["B", 509, 39],
    ["A", 640, 39],
    ["H", 255, 149],
    ["G", 389, 149],
    ["F", 509, 149],
    ["E", 640, 149],
    ["L", 260, 259],
    ["K", 389, 259],
    ["J", 509, 259],
    ["I", 634, 259],
  ] as const;

  const sectionLabelProps = {
    fill: "#263649",
    textAnchor: "middle" as const,
    fontWeight: 850,
    letterSpacing: "0.08em",
    fontSize: 6,
  };

  return (
    <g data-testid="interactive-venue-plan" aria-hidden="true">
      <rect
        x="1"
        y="1"
        width="898"
        height="398"
        rx="12"
        fill="#f7fafb"
        stroke="#d2dce3"
        strokeWidth={1.5}
      />
      <rect
        x="311"
        y="5"
        width="274"
        height="22"
        rx="1"
        fill="#cbdced"
        stroke="#43566c"
        strokeWidth={1}
      />
      <text {...sectionLabelProps} fontSize={7} x="448" y="19">
        PODIUM
      </text>
      {sectionLabels.map(([label, x, y]) => (
        <text key={label} {...sectionLabelProps} x={x} y={y}>
          SEKTOR {label}
        </text>
      ))}
      <text
        {...sectionLabelProps}
        x="112"
        y="108"
        transform="rotate(17 112 108)"
      >
        SEKTOR M
      </text>
      <text
        {...sectionLabelProps}
        x="800"
        y="108"
        transform="rotate(-17 800 108)"
      >
        SEKTOR M
      </text>
      <g
        fill="#d9e0e4"
        stroke="#52606c"
        strokeWidth={1}
        transform="translate(176 197)"
      >
        <circle r="22" />
        {[-75, -45, -15, 15, 45, 75].map((angle) => (
          <line
            key={angle}
            x1="0"
            y1="0"
            x2="22"
            y2="0"
            transform={`rotate(${angle})`}
          />
        ))}
      </g>
      <g
        fill="#d9e0e4"
        stroke="#52606c"
        strokeWidth={1}
        transform="translate(722 197)"
      >
        <circle r="22" />
        {[-105, -135, -165, 105, 135, 165].map((angle) => (
          <line
            key={angle}
            x1="0"
            y1="0"
            x2="22"
            y2="0"
            transform={`rotate(${angle})`}
          />
        ))}
      </g>
      <text {...sectionLabelProps} x="450" y="374">
        VCHOD
      </text>
    </g>
  );
}

export function SeatMap({
  seats,
  selected,
  ownedHeld = new Set(),
  selectionLocked = false,
  onToggle,
}: SeatMapProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const panzoomRef = useRef<PanzoomObject | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const instance = Panzoom(svgElement, {
      minScale: 0.8,
      maxScale: 3.5,
      contain: "outside",
      cursor: "grab",
    });
    panzoomRef.current = instance;
    const parent = svgElement.parentElement;
    const wheel = (event: WheelEvent) => instance.zoomWithWheel(event);
    parent?.addEventListener("wheel", wheel, { passive: false });
    const changed = () => setZoom(instance.getScale());
    svgElement.addEventListener("panzoomchange", changed);
    return () => {
      parent?.removeEventListener("wheel", wheel);
      svgElement.removeEventListener("panzoomchange", changed);
      instance.destroy();
    };
  }, []);

  const isTap = (event: ReactMouseEvent<SVGRectElement>) => {
    const pointerStart = pointerStartRef.current;
    pointerStartRef.current = null;
    return (
      !pointerStart ||
      Math.hypot(
        event.clientX - pointerStart.x,
        event.clientY - pointerStart.y,
      ) <= 4
    );
  };

  return (
    <div className="relative isolate mt-5 overflow-hidden rounded-2xl border border-[#deddd7] bg-white shadow-[0_12px_32px_rgba(25,30,50,0.05)]">
      <div
        className="absolute right-3 top-3 z-10 flex items-center gap-1 rounded-lg border border-[#deddd7] bg-white/92 p-1 shadow-[0_4px_16px_rgba(0,0,0,0.08)]"
        aria-label="Map controls"
      >
        <Button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#c8cbd2] p-0 text-[#252d43] hover:bg-[#f1f2f5]"
          aria-label="Zoom out"
          onClick={() => panzoomRef.current?.zoomOut()}
        >
          <Minus size={18} />
        </Button>
        <span className="min-w-[43px] text-center text-xs font-bold text-[#252d43]">
          {Math.round(zoom * 100)}%
        </span>
        <Button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#c8cbd2] p-0 text-[#252d43] hover:bg-[#f1f2f5]"
          aria-label="Zoom in"
          onClick={() => panzoomRef.current?.zoomIn()}
        >
          <Plus size={18} />
        </Button>
        <Button
          className="flex h-8 w-8 items-center justify-center rounded-md border border-[#c8cbd2] p-0 text-[#252d43] hover:bg-[#f1f2f5]"
          aria-label="Reset map"
          onClick={() => panzoomRef.current?.reset()}
        >
          <RotateCcw size={18} />
        </Button>
      </div>
      <div className="aspect-[9/4] touch-none overflow-hidden bg-[#edf3f6]">
        <svg
          ref={svgRef}
          className="block h-full w-full origin-center"
          viewBox="0 0 900 400"
          role="group"
          aria-label="Interactive seating map"
          onPointerDownCapture={(event) => {
            pointerStartRef.current = { x: event.clientX, y: event.clientY };
          }}
        >
          <VenueFixtures />
          {seats.map((seat) => {
            const isSelected = selected.has(seat.id);
            const isOwnedHeld = ownedHeld.has(seat.id);
            const disabled = seat.status !== "AVAILABLE" || selectionLocked;
            const style = seatStyle(seat, isSelected, isOwnedHeld);
            const numberFill =
              isSelected || seat.status === "SOLD" ? "white" : "#172236";
            return (
              <g
                key={seat.id}
                transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rotation})`}
              >
                <rect
                  className={[
                    "outline-none transition-[filter,stroke-width] duration-100 ease-out",
                    style.cursor === "not-allowed"
                      ? "cursor-not-allowed"
                      : "cursor-pointer",
                    !disabled &&
                      "hover:brightness-110 hover:stroke-[#b73520] hover:[stroke-width:1.8]",
                    "focus:stroke-[#081327] focus:[stroke-width:2.2]",
                    style.className,
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  fill={style.fill}
                  stroke={style.stroke}
                  strokeWidth={style.strokeWidth ?? 0.8}
                  data-seat-id={seat.id}
                  x="-5"
                  y="-5.5"
                  width="10"
                  height="11"
                  rx="0.5"
                  role="button"
                  tabIndex={disabled ? -1 : 0}
                  aria-disabled={disabled}
                  aria-pressed={isSelected}
                  aria-label={statusLabel(seat, isSelected, isOwnedHeld)}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (!disabled && isTap(event)) onToggle(seat);
                  }}
                  onKeyDown={(event) => {
                    if (
                      !disabled &&
                      (event.key === "Enter" || event.key === " ")
                    ) {
                      event.preventDefault();
                      onToggle(seat);
                    }
                  }}
                />
                <text
                  className="pointer-events-none select-none"
                  fill={numberFill}
                  textAnchor="middle"
                  fontSize={4.5}
                  fontWeight={800}
                  x="0"
                  y="1.6"
                  aria-hidden="true"
                >
                  {seat.seatNumber}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
