import type {
	ArrowElement,
	Element,
	Point,
	HandleType,
	RectangleElement,
	CircleElement,
	DiamondElement,
	PencilElement,
	TextElement,
} from "./types";
import { HANDLE_SIZE, LINE_HIT_THRESHOLD } from "./constants";

const COPY_HANDLE_OFFSET = -30; // Negative for above the element
const ROTATION_HANDLE_OFFSET = -55; // Even further above

export const getHandles = (
	el: Element
): { type: HandleType; x: number; y: number }[] => {
	switch (el.type) {
		case "rectangle":
		case "diamond":
			const rectEl = el as RectangleElement;
			const { x, y, width } = normalizeRect(rectEl);
			return [
				{ type: "top-left", x: x, y: y },
				{ type: "top-right", x: x + width, y: y },
				{ type: "bottom-left", x: x, y: y + el.height },
				{
					type: "bottom-right",
					x: x + width,
					y: y + el.height,
				},
				{ type: "copy", x: x + width / 2, y: y + COPY_HANDLE_OFFSET },
				{ type: "rotation", x: x + width / 2, y: y + ROTATION_HANDLE_OFFSET },
			];
		case "line":
		case "arrow": {
			const lineEl = el as ArrowElement;
			const lineHandles = [
				{ type: "start", x: lineEl.x, y: lineEl.y },
				{ type: "end", x: lineEl.x2, y: lineEl.y2 },
			];
			lineHandles.push({ type: "copy", x: (lineEl.x + lineEl.x2) / 2, y: (lineEl.y + lineEl.y2) / 2 + COPY_HANDLE_OFFSET });
			lineHandles.push({ type: "rotation", x: (lineEl.x + lineEl.x2) / 2, y: (lineEl.y + lineEl.y2) / 2 + ROTATION_HANDLE_OFFSET });
			return lineHandles;
		}
		case "text": {
			const textEl = el as TextElement;
			// `width` and `height` on text elements are not always up to date.
			// We must measure the text to get accurate dimensions for handle placement.
			const { width, height } = measureText(textEl.text, textEl.fontSize, textEl.fontFamily || 'sans-serif');
			return [
				{ type: 'bottom-right', x: textEl.x + width, y: textEl.y + height },
				{ type: 'copy', x: textEl.x + width / 2, y: textEl.y + COPY_HANDLE_OFFSET },
				{ type: 'rotation', x: textEl.x + width / 2, y: textEl.y + ROTATION_HANDLE_OFFSET },
			];
		}
		case "circle":
			const circleEl = el as CircleElement;
			return [
				{ type: "radius", x: circleEl.x + circleEl.radius, y: circleEl.y },
				{ type: "copy", x: circleEl.x, y: circleEl.y - circleEl.radius + COPY_HANDLE_OFFSET },
				{ type: "rotation", x: circleEl.x, y: circleEl.y - circleEl.radius + ROTATION_HANDLE_OFFSET },
			];
		case "pencil":
			const pencilEl = el as PencilElement;
			const { minX, minY, maxX } = getPencilElementBounds(pencilEl);
			return [{ type: "copy", x: (minX + maxX) / 2, y: minY + COPY_HANDLE_OFFSET },
					{ type: "rotation", x: (minX + maxX) / 2, y: minY + ROTATION_HANDLE_OFFSET }];
		default:
			return [];
	}
};

const measureText = (
	text: string,
	fontSize: number,
	fontFamily: string
): { width: number; height: number } => {
	// This is a simple measurement. For more accuracy, you might need a hidden DOM element or more complex canvas logic.
	// For multiline text, this would need to be more sophisticated.
	const dummyContext = document.createElement("canvas").getContext("2d")!;
	dummyContext.font = `${fontSize}px ${fontFamily}`;
	const lines = text.split("\n");
	const widths = lines.map((line) => dummyContext.measureText(line).width);
	return { width: Math.max(...widths), height: lines.length * fontSize };
};

const distanceToLineSegment = (p: Point, a: Point, b: Point): number => {
	const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
	if (l2 === 0) {
		return Math.hypot(p.x - a.x, p.y - a.y);
	}
	let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
	t = Math.max(0, Math.min(1, t));
	const closestPoint = {
		x: a.x + t * (b.x - a.x),
		y: a.y + t * (b.y - a.y),
	};
	return Math.hypot(p.x - closestPoint.x, p.y - closestPoint.y);
};

const getPencilElementBounds = (
	element: PencilElement
): { minX: number; minY: number; maxX: number; maxY: number } => {
	if (element.points.length === 0) {
		return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
	}
	let minX = Infinity,
		minY = Infinity,
		maxX = -Infinity,
		maxY = -Infinity;
	element.points.forEach((p) => {
		minX = Math.min(minX, p.x);
		minY = Math.min(minY, p.y);
		maxX = Math.max(maxX, p.x);
		maxY = Math.max(maxY, p.y);
	});
	return { minX, minY, maxX, maxY };
};

/**
 * Calculates the perpendicular distance from a point to a line.
 * @param point The point.
 * @param lineStart The start point of the line.
 * @param lineEnd The end point of the line.
 */
const perpendicularDistanceToLine = (point: Point, lineStart: Point, lineEnd: Point): number => {
    const { x: x0, y: y0 } = point;
    const { x: x1, y: y1 } = lineStart;
    const { x: x2, y: y2 } = lineEnd;

    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        return Math.hypot(x0 - x1, y0 - y1);
    }

    return Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / Math.sqrt(dx * dx + dy * dy);
};

/**
 * The Ramer-Douglas-Peucker algorithm for path simplification.
 * @param points The array of points to simplify.
 * @param epsilon The tolerance. All points within this distance from the line will be removed.
 */
const rdp = (points: Point[], epsilon: number): Point[] => {
    if (points.length < 3) {
        return points;
    }

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    let index = -1;
    let maxDist = 0;

    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistanceToLine(points[i], firstPoint, lastPoint);
        if (dist > maxDist) {
            maxDist = dist;
            index = i;
        }
    }

    if (maxDist > epsilon) {
        const left = rdp(points.slice(0, index + 1), epsilon);
        const right = rdp(points.slice(index), epsilon);
        // Combine the two simplified paths, removing the duplicate middle point
        return left.slice(0, left.length - 1).concat(right);
    } else {
        return [firstPoint, lastPoint];
    }
};

export const simplifyPath = (points: Point[], epsilon = 0.5): Point[] => {
    return rdp(points, epsilon);
};

 const rotatePoint = (point: Point, origin: Point, angleRad: number): Point => {
	const cos = Math.cos(angleRad);
	const sin = Math.sin(angleRad);
	const translatedX = point.x - origin.x;
	const translatedY = point.y - origin.y;
	const rotatedX = translatedX * cos - translatedY * sin;
	const rotatedY = translatedX * sin + translatedY * cos;
	return {
		x: rotatedX + origin.x,
		y: rotatedY + origin.y,
	};
};

export const hitTestHandle = (
	el: Element,
	pos: Point
): HandleType | null => {
	const center = getElementCenter(el);
	// To check for a hit on a handle, we must compare the mouse position
	// with the handle's position in the same coordinate system.
	// The handle positions are calculated in the element's local (un-rotated) space.
	// So, we transform the mouse position into that same local space by applying
	// the inverse rotation of the element.
	const localPos = el.rotation
		? rotatePoint(pos, center, -el.rotation * (Math.PI / 180))
		: pos;

	const handles = getHandles(el);
	for (let h of handles) {
		const handleSize = h.type === "copy" || h.type === "rotation" ? 24 : HANDLE_SIZE;
		if (Math.abs(localPos.x - h.x) <= handleSize / 2 && Math.abs(localPos.y - h.y) <= handleSize / 2)
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
		const center = getElementCenter(el);
		const localPos = el.rotation
			? rotatePoint(pos, center, -el.rotation * (Math.PI / 180))
			: pos;

		if (el.type === "rectangle") {
			const { x, y, width, height } = normalizeRect(el as RectangleElement);
			if (localPos.x >= x && localPos.x <= x + width && localPos.y >= y && localPos.y <= y + height) {
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
		if (el.type === "text") {
			const { width, height } = measureText(el.text, el.fontSize, el.fontFamily);
			if (
				localPos.x >= el.x &&
				localPos.x <= el.x + width &&
				localPos.y >= el.y &&
				localPos.y <= el.y + height
			) {
				return el;
			}
		}
		if (el.type === "circle") {
			const dist = Math.hypot(localPos.x - el.x, localPos.y - el.y);
			if (dist <= (el as CircleElement).radius) {
				return el;
			}
		}
		if (el.type === "diamond") {
			const { x, y, width, height } = normalizeRect(el as DiamondElement);
			// A more accurate diamond hit test would be better, but for now, use bounding box
			if (localPos.x >= x && localPos.x <= x + width && localPos.y >= y && localPos.y <= y + height) {
				return el;
			}
		} else if (el.type === "pencil") {
			// First, a quick bounding box check to discard elements that are obviously not a match
			const { minX, minY, maxX, maxY } = getPencilElementBounds(el);
			const buffer = LINE_HIT_THRESHOLD;
			if (pos.x >= minX - buffer && pos.x <= maxX + buffer && pos.y >= minY - buffer && pos.y <= maxY + buffer) {
				// Detailed check: find minimum distance from point to any segment in the path
				const points = (el as PencilElement).points;
				for (let i = 0; i < points.length - 1; i++) {
					const dist = distanceToLineSegment(localPos, points[i], points[i + 1]);
					if (dist < buffer) {
						return el;
					}
				}
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
	} else if (el.type === "text") {
		el.x += dx;
		el.y += dy;
	} else if (el.type === "pencil") {
		el.x += dx;
		el.y += dy;
		(el as PencilElement).points = (el as PencilElement).points.map((p) => ({
			x: p.x + dx,
			y: p.y + dy,
		}));
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
	} else if (el.type === "text") {
		if (handle === "bottom-right") {
			// A larger font size change for a more noticeable effect
			el.fontSize = Math.max(8, el.fontSize + dx * 0.5);
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
	} else if (element.type === "text") {
		const { width, height } = measureText(
			element.text,
			element.fontSize,
			element.fontFamily
		);
		return { x: element.x + width / 2, y: element.y + height / 2 };
	} else if (element.type === "pencil") {
		const { minX, minY, maxX, maxY } = getPencilElementBounds(element);
		const width = maxX - minX, height = maxY - minY;
		return { x: element.x + width / 2, y: element.y + height / 2 };
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
	} else if (element.type === "text") {
		const { width, height } = measureText(
			element.text,
			element.fontSize,
			element.fontFamily
		);
		const textRect = { x: element.x, y: element.y, width, height };
		return (
			rx < textRect.x + textRect.width && rx + rw > textRect.x && ry < textRect.y + textRect.height && ry + rh > textRect.y
		);
	} else if (element.type === "pencil") {
		const { minX, minY, maxX, maxY } = getPencilElementBounds(element);
		const pencilBounds = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
		return rx < pencilBounds.x + pencilBounds.width && rx + rw > pencilBounds.x && ry < pencilBounds.y + pencilBounds.height && ry + rh > pencilBounds.y;
	}
	return false;
};
