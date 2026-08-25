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

interface SeatMapProps {
  seats: SeatDto[];
  selected: Set<string>;
  ownedHeld?: Set<string>;
  selectionLocked?: boolean;
  onToggle: (seat: SeatDto) => void;
}

const statusLabel = (seat: SeatDto, selected: boolean, ownedHeld: boolean) =>
  `Section ${seat.section}, row ${seat.rowLabel}, seat ${seat.seatNumber}, ${seat.priceCategory}, ${seat.priceMinor / 100} CZK, ${selected ? "selected" : ownedHeld ? "held by you" : seat.status.toLowerCase()}`;

const categoryClass = (category: string) => {
  if (category.startsWith("1")) return "seat-category-1";
  if (category.startsWith("2")) return "seat-category-2";
  return "seat-category-3";
};

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

  return (
    <g
      className="venue-fixtures"
      data-testid="interactive-venue-plan"
      aria-hidden="true"
    >
      <rect
        className="venue-floor"
        x="1"
        y="1"
        width="898"
        height="398"
        rx="12"
      />
      <rect
        className="venue-stage"
        x="311"
        y="5"
        width="274"
        height="22"
        rx="1"
      />
      <text className="venue-stage-label" x="448" y="19">
        STAGE
      </text>
      {sectionLabels.map(([label, x, y]) => (
        <text key={label} className="venue-section-label" x={x} y={y}>
          SECTION {label}
        </text>
      ))}
      <text
        className="venue-section-label"
        x="112"
        y="108"
        transform="rotate(17 112 108)"
      >
        SECTION M
      </text>
      <text
        className="venue-section-label"
        x="800"
        y="108"
        transform="rotate(-17 800 108)"
      >
        SECTION M
      </text>
      <g className="venue-stairs" transform="translate(176 197)">
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
      <g className="venue-stairs" transform="translate(722 197)">
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
      <text className="venue-entrance-label" x="450" y="374">
        ENTRANCE
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
    <div className="seat-map-card">
      <div className="seat-map-toolbar" aria-label="Map controls">
        <Button
          aria-label="Zoom out"
          onClick={() => panzoomRef.current?.zoomOut()}
        >
          <Minus size={18} />
        </Button>
        <span>{Math.round(zoom * 100)}%</span>
        <Button
          aria-label="Zoom in"
          onClick={() => panzoomRef.current?.zoomIn()}
        >
          <Plus size={18} />
        </Button>
        <Button
          aria-label="Reset map"
          onClick={() => panzoomRef.current?.reset()}
        >
          <RotateCcw size={18} />
        </Button>
      </div>
      <div className="seat-map-viewport">
        <svg
          ref={svgRef}
          className="seat-map seat-map-reference"
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
            return (
              <g
                key={seat.id}
                transform={`translate(${seat.x} ${seat.y}) rotate(${seat.rotation})`}
              >
                <rect
                  className={`seat-block ${categoryClass(seat.priceCategory)} seat-${seat.status.toLowerCase()} ${isSelected ? "seat-selected" : ""} ${isOwnedHeld ? "seat-owned-held" : ""}`}
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
                <text className="seat-number" x="0" y="1.6" aria-hidden="true">
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
