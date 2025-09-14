import type {
	ArrowElement,
	BaseElement,
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
import { normalizeRect, rotatePoint, distanceToLineSegment, getQuadraticCurveBounds, getPointOnQuadraticCurve } from "./geometry";

let sharedDummyContext: CanvasRenderingContext2D | null = null;
const getSharedDummyContext = () => {
	if (!sharedDummyContext) {
		const canvas = document.createElement("canvas");
		sharedDummyContext = canvas.getContext("2d");
	}
	if (!sharedDummyContext) {
		// This should be practically impossible in browsers that support canvas.
		throw new Error("Could not create 2d context for text measurement");
	}
	return sharedDummyContext;
};




const measureText = (
	text: string,
	fontSize: number,
	fontFamily: string
): { width: number; height: number } => {
	const dummyContext = getSharedDummyContext();
	dummyContext.font = `${fontSize}px ${fontFamily || "'virgil', sans-serif"}`;
	const lines = text.split("\n");
	const widths = lines.map((line) => dummyContext.measureText(line).width);
	// Use Math.max(0, ...) to handle empty text gracefully
	return { width: Math.max(0, ...widths), height: lines.length * fontSize };
};

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
			let handleCenterX: number, handleCenterY: number;

			if (lineEl.cp1x && lineEl.cp1y) {
				// It's a curved line. Position handles above the curve's bounding box.
				const bounds = getQuadraticCurveBounds(
					{ x: lineEl.x, y: lineEl.y }, { x: lineEl.cp1x, y: lineEl.cp1y }, { x: lineEl.x2, y: lineEl.y2 }
				);
				handleCenterX = bounds.x + bounds.width / 2;
				handleCenterY = bounds.y; // Top of the bounding box
			} else {
				// It's a straight line. Position handles on the midpoint.
				handleCenterX = (lineEl.x + lineEl.x2) / 2;
				handleCenterY = (lineEl.y + lineEl.y2) / 2;
			}
			lineHandles.push({ type: "copy", x: handleCenterX, y: handleCenterY + COPY_HANDLE_OFFSET });
			lineHandles.push({ type: "rotation", x: handleCenterX, y: handleCenterY + ROTATION_HANDLE_OFFSET });
			if (lineEl.curveHandleX && lineEl.curveHandleY) {
				lineHandles.push({ type: "curve", x: lineEl.curveHandleX, y: lineEl.curveHandleY });
			}
			else {
				lineHandles.push({ type: "curve", x: (lineEl.x + lineEl.x2) / 2, y: (lineEl.y + lineEl.y2) / 2 });
			}
			return lineHandles;
		}
		case "text": {
			const textEl = el as TextElement;
			// `width` and `height` on text elements are not always up to date.
			// We must measure the text to get accurate dimensions for handle placement.
			const { width, height } = measureText(textEl.text, textEl.fontSize, textEl.fontFamily || "'virgil', sans-serif");
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
 * Recursively rounds all numeric properties of an object to a given precision.
 * This is useful for cleaning up element data before serialization.
 * @param obj The object or array to process.
 * @param precision The number of decimal places to round to.
 */
const roundObject = (obj: any, precision: number): any => {
	if (obj === null || typeof obj !== 'object') {
		return obj;
	}

	if (Array.isArray(obj)) {
		return obj.map((item) => roundObject(item, precision));
	}

	const newObj: { [key: string]: any } = {};
	for (const key in obj) {
		if (Object.prototype.hasOwnProperty.call(obj, key)) {
			const value = obj[key];
			if (typeof value === 'number') {
				// Use Number() to remove trailing zeros from toFixed()
				newObj[key] = Number(value.toFixed(precision));
			} else if (typeof value === 'object') {
				newObj[key] = roundObject(value, precision);
			} else {
				newObj[key] = value;
			}
		}
	}
	return newObj;
};

export const roundElementProperties = (element: Element, precision: number): Element => {
	return roundObject(element, precision) as Element;
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
		const handleSize = h.type === "copy" || h.type === "rotation" || h.type === "curve" ? 24 : HANDLE_SIZE;
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
		} else if (el.type === 'line' || el.type === 'arrow') {
			let hit = false;
			if (el.cp1x && el.cp1y) {
				const p0 = { x: el.x, y: el.y };
				const p1 = { x: el.cp1x, y: el.cp1y };
				const p2 = { x: el.x2, y: el.y2 };
				// A simple hit test: check distance to 10 points on the curve
				for (let i = 0; i <= 10; i++) {
					const t = i / 10;
					const p = getPointOnQuadraticCurve(t, p0, p1, p2);
					if (Math.hypot(p.x - localPos.x, p.y - localPos.y) < LINE_HIT_THRESHOLD) {
						hit = true;
						break;
					}
				}
			} else if (distanceToLineSegment(localPos, { x: el.x, y: el.y }, { x: el.x2, y: el.y2 }) < LINE_HIT_THRESHOLD) {
				hit = true;
			}

			if (hit) return el;

			if (el.type === "arrow") {
				const distToEndpoint = Math.hypot(localPos.x - el.x2, localPos.y - el.y2);
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
	} else if (el.type === "line" || el.type === "arrow") {
		el.x += dx;
		el.y += dy;
		el.x2 += dx;
		el.y2 += dy;
		if (el.cp1x !== undefined && el.cp1y !== undefined) {
			el.cp1x += dx;
			el.cp1y += dy;
		}
		if (el.curveHandleX !== undefined && el.curveHandleY !== undefined) {
			el.curveHandleX += dx;
			el.curveHandleY += dy;
		}
	} else if (el.type === "circle") {
		el.x += dx;
		el.y += dy;
	} else if (el.type === "diamond") {
		el.x += dx;
		el.y += dy;
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
			// Reset curve when resizing
			delete el.cp1x; delete el.cp1y; delete el.curveHandleX; delete el.curveHandleY;
		} else if (handle === "end") {
			el.x2 += dx;
			el.y2 += dy;
			// Reset curve when resizing
			delete el.cp1x; delete el.cp1y; delete el.curveHandleX; delete el.curveHandleY;
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
		const { x, y, width, height } = normalizeRect(element);
		return { x: x + width / 2, y: y + height / 2 };
	} else if (element.type === 'line' || element.type === 'arrow') {
		if (element.cp1x && element.cp1y) {
			const bounds = getQuadraticCurveBounds(
				{ x: element.x, y: element.y }, { x: element.cp1x, y: element.cp1y }, { x: element.x2, y: element.y2 }
			);
			return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
		}
		return { x: (element.x + element.x2) / 2, y: (element.y + element.y2) / 2 };
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
		const width = maxX - minX;
		const height = maxY - minY;
		return { x: minX + width / 2, y: minY + height / 2 };
	}
	// Fallback for unknown types
	return { x: element.x, y: element.y };
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
