import type {
	ArrowElement,
	Element,
	Point,
	HandleType,
	RectangleElement,
	CircleElement,
	DiamondElement,
} from "./types";
import { HANDLE_SIZE, LINE_HIT_THRESHOLD } from "./constants";

export const getHandles = (
	el: Element
): { type: HandleType; x: number; y: number }[] => {
	switch (el.type) {
		case "rectangle":
		case "diamond":
			const rectEl = el as RectangleElement;
			return [
				{ type: "top-left", x: rectEl.x, y: rectEl.y },
				{ type: "top-right", x: rectEl.x + rectEl.width, y: rectEl.y },
				{ type: "bottom-left", x: rectEl.x, y: rectEl.y + rectEl.height },
				{
					type: "bottom-right",
					x: rectEl.x + rectEl.width,
					y: rectEl.y + rectEl.height,
				},
			];
		case "line":
		case "arrow":
			const lineEl = el as ArrowElement;
			return [
				{ type: "start", x: lineEl.x, y: lineEl.y },
				{ type: "end", x: lineEl.x2, y: lineEl.y2 },
			];
		case "circle":
			const circleEl = el as CircleElement;
			return [{ type: "radius", x: circleEl.x + circleEl.radius, y: circleEl.y }];
		default:
			return [];
	}
};

export const hitTestHandle = (
	el: Element,
	pos: Point
): HandleType | null => {
	const handles = getHandles(el);
	for (let h of handles) {
		if (
			Math.abs(pos.x - h.x) <= HANDLE_SIZE / 2 &&
			Math.abs(pos.y - h.y) <= HANDLE_SIZE / 2
		)
			return h.type;
	}
	return null;
};

export const getElementAtPosition = (
	elements: Element[],
	pos: Point
): Element | null => {
	for (let i = elements.length - 1; i >= 0; i--) {
		const el = elements[i];
		if (el.type === "rectangle") {
			const { x, y, width, height } = normalizeRect(el as RectangleElement);
			if (pos.x >= x && pos.x <= x + width && pos.y >= y && pos.y <= y + height) {
				return el;
			}
		} else if (el.type === "line" || el.type === "arrow") {
			const { x: x1, y: y1, x2, y2 } = el;
			const { x: px, y: py } = pos;

			// Check for hit on the line segment itself
			const lenSq = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);

			// If the line has no length, it's a point.
			if (lenSq === 0) {
				if (Math.hypot(px - x1, py - y1) < LINE_HIT_THRESHOLD) return el;
			} else {
				let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / lenSq;
				t = Math.max(0, Math.min(1, t)); // Clamp t to the [0, 1] range

				const closestX = x1 + t * (x2 - x1);
				const closestY = y1 + t * (y2 - y1);
				const dist = Math.hypot(px - closestX, py - closestY);

				if (dist < LINE_HIT_THRESHOLD) return el;
			}

			// For arrows, also check for a click near the arrowhead
			if (el.type === "arrow") {
				const distToEndpoint = Math.hypot(px - x2, py - y2);
				if (distToEndpoint < 10) return el; // Arrowhead size is roughly 10px
			}
		}
		if (el.type === "circle") {
			const dist = Math.hypot(pos.x - el.x, pos.y - el.y);
			if (dist <= (el as CircleElement).radius) {
				return el;
			}
		}
		if (el.type === "diamond") {
			const { x, y, width, height } = normalizeRect(el as DiamondElement);
			if (pos.x >= x && pos.x <= x + width && pos.y >= y && pos.y <= y + height) {
				return el;
			}
		}
	}
	return null;
};

export const moveElement = (el: Element, dx: number, dy: number) => {
	if (el.type === "rectangle") {
		el.x += dx;
		el.y += dy;
	} else if (el.type === "line") {
		el.x += dx;
		el.y += dy;
		el.x2 += dx;
		el.y2 += dy;
	} else if (el.type === "circle") {
		el.x += dx;
		el.y += dy;
	} else if (el.type === "diamond") {
		el.x += dx;
		el.y += dy;
	} else if (el.type === "arrow") {
		// same as line
		el.x += dx;
		el.y += dy;
		el.x2 += dx;
		el.y2 += dy;
	}
};

export const resizeElement = (
	el: Element,
	handle: HandleType | null,
	dx: number,
	dy: number
) => {
	if (!handle) return;

	if (el.type === "rectangle" || el.type === "diamond") {
		switch (handle) {
			case "top-left":
				el.x += dx;
				el.y += dy;
				el.width -= dx;
				el.height -= dy;
				break;
			case "top-right":
				el.y += dy;
				el.width += dx;
				el.height -= dy;
				break;
			case "bottom-left":
				el.x += dx;
				el.width -= dx;
				el.height += dy;
				break;
			case "bottom-right":
				el.width += dx;
				el.height += dy;
				break;
		}
	} else if (el.type === "line" || el.type === "arrow") {
		if (handle === "start") {
			el.x += dx;
			el.y += dy;
		} else if (handle === "end") {
			el.x2 += dx;
			el.y2 += dy;
		}
	} else if (el.type === "circle") {
		if (handle === "radius") {
			el.radius = Math.max(0, el.radius + dx);
		}
	}
};

export const getElementCenter = (element: Element): Point => {
	if (element.type === "rectangle") {
		const { x, y, width, height } = normalizeRect(element as RectangleElement);
		return { x: x + width / 2, y: y + height / 2 };
	} else if (element.type === "line") {
		return { x: (element.x + element.x2) / 2, y: (element.y + element.y2) / 2 };
	} else if (element.type === "circle") {
		return { x: element.x, y: element.y };
	} else if (element.type === "diamond") {
		const { x, y, width, height } = normalizeRect(element as DiamondElement);
		return { x: x + width / 2, y: y + height / 2 };
	} else if (element.type === "arrow") {
		return {
			x: (element.x + element.x2) / 2,
			y: (element.y + element.y2) / 2,
		};
	}
	// Fallback for unknown types
	return { x: element.x, y: element.y };
};

// New helper to handle rectangles drawn in any direction
export const normalizeRect = (rect: RectangleElement): RectangleElement => {
	const x = rect.width < 0 ? rect.x + rect.width : rect.x;
	const y = rect.height < 0 ? rect.y + rect.height : rect.y;
	const width = Math.abs(rect.width);
	const height = Math.abs(rect.height);
	return { ...rect, x, y, width, height };
};

export const isElementIntersectingRect = (
	element: Element,
	selectionRect: RectangleElement
): boolean => {
	const { x: rx, y: ry, width: rw, height: rh } = normalizeRect(selectionRect);

	if (element.type === "rectangle") {
		// AABB intersection test
		const { x: ex, y: ey, width: ew, height: eh } = normalizeRect(element as RectangleElement);
		return rx < ex + ew && rx + rw > ex && ry < ey + eh && ry + rh > ey;
	} else if (element.type === "line") {
		// Check if the line's bounding box intersects with the selection rectangle
		const lineRect = {
			id: "", // dummy id
			type: "rectangle" as const,
			x: Math.min(element.x, element.x2),
			y: Math.min(element.y, element.y2),
			width: Math.abs(element.x - element.x2),
			height: Math.abs(element.y - element.y2),
		};
		// AABB test for line's bounding box and selection rect
		return (
			rx < lineRect.x + lineRect.width &&
			rx + rw > lineRect.x &&
			ry < lineRect.y + lineRect.height &&
			ry + rh > lineRect.y
		);
	} else if (element.type === "circle") {
		const { radius } = element as CircleElement;
		const circle = { x: element.x, y: element.y, radius };
		// https://yal.cc/rectangle-circle-intersection-test/
		const dx = circle.x - Math.max(rx, Math.min(circle.x, rx + rw));
		const dy = circle.y - Math.max(ry, Math.min(circle.y, ry + rh));
		return dx * dx + dy * dy < circle.radius * circle.radius;
	} else if (element.type === "diamond") {
		const { x: ex, y: ey, width: ew, height: eh } = normalizeRect(element as DiamondElement);
		return rx < ex + ew && rx + rw > ex && ry < ey + eh && ry + rh > ey;
	} else if (element.type === "arrow") {
		// same as line
		const lineRect = {
			x: Math.min(element.x, element.x2),
			y: Math.min(element.y, element.y2),
			width: Math.abs(element.x - element.x2),
			height: Math.abs(element.y - element.y2),
		};
		return (
			rx < lineRect.x + lineRect.width &&
			rx + rw > lineRect.x &&
			ry < lineRect.y + lineRect.height &&
			ry + rh > lineRect.y
		);
	}
	return false;
};
