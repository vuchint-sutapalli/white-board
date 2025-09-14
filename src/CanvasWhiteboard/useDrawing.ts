import { useLayoutEffect, useCallback, useRef, useEffect } from "react";
import type { RefObject } from "react";
import type {
	Element,
	Point,
	RectangleElement,
	TextElement,
	PencilElement,
} from "./types";
import { HANDLE_SIZE } from "./constants";
import { getHandles, getElementCenter } from './element';
import { normalizeRect } from './geometry';

/**
 * Draws the resize and rotation handles for a given element.
 * @param ctx The canvas rendering context.
 * @param el The element for which to draw handles.
 * @param copyIcon The image for the copy handle.
 * @param rotationIcon The image for the rotation handle.
 */
const drawResizeHandles = (
	ctx: CanvasRenderingContext2D,
	el: Element,
	copyIcon: HTMLImageElement | null,
	rotationIcon: HTMLImageElement | null
) => {
	const handles = getHandles(el);

	handles.forEach((h) => {
		if (h.type === "copy") {
			if (copyIcon) {
				const iconSize = 24;
				ctx.drawImage(
					copyIcon,
					h.x - iconSize / 2,
					h.y - iconSize / 2,
					iconSize,
					iconSize
				);
			} else {
				// Fallback to green square if icon isn't loaded yet
				ctx.fillStyle = "green";
				ctx.fillRect(
					h.x - HANDLE_SIZE / 2,
					h.y - HANDLE_SIZE / 2,
					HANDLE_SIZE,
					HANDLE_SIZE
				);
			}
			return;
		} else if (h.type === "rotation") {
			if (rotationIcon) {
				const iconSize = 24;
				ctx.drawImage(rotationIcon, h.x - iconSize / 2, h.y - iconSize / 2, iconSize, iconSize);
			} else {
				// Fallback to green square if icon isn't loaded yet
				ctx.fillStyle = "green";
				ctx.fillRect(
					h.x - HANDLE_SIZE / 2,
					h.y - HANDLE_SIZE / 2,
					HANDLE_SIZE,
					HANDLE_SIZE
				);
			}
			return;
		} else if (h.type === "curve") {
			ctx.fillStyle = "orange";
		} else {
			ctx.fillStyle = "blue";
		}

		if (el.type === "line" || el.type === "arrow" || h.type === "curve") {
			ctx.beginPath();
			ctx.arc(h.x, h.y, HANDLE_SIZE / 2, 0, 2 * Math.PI);
			ctx.fill();
		} else {
			ctx.fillRect(
				h.x - HANDLE_SIZE / 2,
				h.y - HANDLE_SIZE / 2,
				HANDLE_SIZE,
				HANDLE_SIZE
			);
		}
	});
};

/**
 * Draws a text label at the center of an element.
 * @param ctx The canvas rendering context.
 * @param label The text of the label.
 * @param center The center point of the element.
 */
const drawLabel = (
	ctx: CanvasRenderingContext2D,
	label: string,
	center: Point
) => {
	ctx.save();
	ctx.font = "16px sans-serif";
	ctx.fillStyle = "black";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	// Simple multi-line support
	label.split("\n").forEach((line, index) => {
		ctx.fillText(line, center.x, center.y + index * 20);
	});
	ctx.restore();
};

/**
 * Draws a pencil (free-hand) element with smoothed lines.
 * @param ctx The canvas rendering context.
 * @param element The pencil element to draw.
 */
const drawPencilElement = (
	ctx: CanvasRenderingContext2D,
	element: PencilElement
) => {
	if (element.points.length === 0) {
		return;
	}

	ctx.save();
	// Inherit strokeStyle from the main drawElement function for highlighting
	ctx.lineWidth = 2;
	ctx.lineCap = "round";
	ctx.lineJoin = "round";

	ctx.beginPath();
	ctx.moveTo(element.points[0].x, element.points[0].y);

	// Use quadraticCurveTo for a smoother line
	for (let i = 1; i < element.points.length - 1; i++) {
		const p1 = element.points[i];
		const p2 = element.points[i + 1];
		const midPoint = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
		ctx.quadraticCurveTo(p1.x, p1.y, midPoint.x, midPoint.y);
	}

	// Draw the last segment as a straight line
	if (element.points.length > 1) {
		const lastPoint = element.points[element.points.length - 1];
		ctx.lineTo(lastPoint.x, lastPoint.y);
	}

	ctx.stroke();
	ctx.restore();
};

/**
 * The core function for drawing a single element on the canvas.
 * It handles different element types, rotation, and highlight states.
 * @param ctx The canvas rendering context.
 * @param el The element to draw.
 * @param highlight If true, draws the element in a highlighted state (e.g., red, dashed).
 * @param copyIcon The image for the copy handle (if highlighted).
 * @param rotationIcon The image for the rotation handle (if highlighted).
 */
const drawElement = (
	ctx: CanvasRenderingContext2D,
	el: Element,
	highlight: boolean,
	copyIcon: HTMLImageElement | null,
	rotationIcon: HTMLImageElement | null
) => {
	ctx.save();
	// Apply rotation if the element has one.
	const center = getElementCenter(el);
	if (el.rotation && center) {
		ctx.translate(center.x, center.y);
		ctx.rotate((el.rotation * Math.PI) / 180);
		ctx.translate(-center.x, -center.y);
	}

	ctx.strokeStyle = "black";
	ctx.lineWidth = 2;

	// Apply a common highlight style for selected elements.
	if (highlight) {
		ctx.strokeStyle = "red";
		ctx.fillStyle = el.type === 'arrow' ? 'red' : ctx.fillStyle;
		ctx.setLineDash([5, 3]);
	}

	if (el.type === 'rectangle') {
		const { x, y, width, height } = normalizeRect(el);
		ctx.strokeRect(x, y, width, height);
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, { x: x + width / 2, y: y + height / 2 });
		}
	} else if (el.type === "diamond") {
		const { x, y, width, height } = normalizeRect(el);
		ctx.beginPath();
		ctx.moveTo(x + width / 2, y);
		ctx.lineTo(x + width, y + height / 2);
		ctx.lineTo(x + width / 2, y + height);
		ctx.lineTo(x, y + height / 2);
		ctx.closePath();
		ctx.stroke();
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, { x: x + width / 2, y: y + height / 2 });
		}
	} else if (el.type === 'line') {
		ctx.beginPath();
		ctx.moveTo(el.x, el.y);
		if (el.cp1x && el.cp1y) {
			ctx.quadraticCurveTo(el.cp1x, el.cp1y, el.x2, el.y2);
		} else {
			ctx.lineTo(el.x2, el.y2);
		}
		ctx.stroke();
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, getElementCenter(el));
		}
	} else if (el.type === "arrow") {
		let arrowAngle;
		if (el.cp1x && el.cp1y) {
			// The tangent of a quadratic bezier at t=1 is the line from the control point to the end point.
			arrowAngle = Math.atan2(el.y2 - el.cp1y, el.x2 - el.cp1x);
		} else {
			arrowAngle = Math.atan2(el.y2 - el.y, el.x2 - el.x);
		}

		ctx.beginPath();
		ctx.moveTo(el.x, el.y);
		if (el.cp1x && el.cp1y) {
			ctx.quadraticCurveTo(el.cp1x, el.cp1y, el.x2, el.y2);
		} else {
			ctx.lineTo(el.x2, el.y2);
		}
		ctx.stroke();

		// Draw arrowhead
		ctx.save();
		ctx.translate(el.x2, el.y2);
		ctx.rotate(arrowAngle);
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(-10, -5);
		ctx.lineTo(-10, 5);
		ctx.closePath();
		ctx.fill();
		ctx.restore();
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, getElementCenter(el));
		}
	} else if (el.type === "circle") {
		ctx.beginPath();
		ctx.arc(el.x, el.y, el.radius, 0, 2 * Math.PI);
		ctx.stroke();
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, { x: el.x, y: el.y });
		}
	} else if (el.type === "text") {
		const textEl = el as TextElement;
		ctx.font = `${textEl.fontSize}px ${textEl.fontFamily || "'virgil', sans-serif"}`;
		ctx.textBaseline = "top";
		ctx.fillStyle = highlight ? "red" : "black";
		textEl.text.split("\n").forEach((line, index) => {
			ctx.fillText(line, textEl.x, textEl.y + index * textEl.fontSize);
		});
	} else if (el.type === "pencil") {
		if (highlight) {
			ctx.strokeStyle = "red";
		}
		drawPencilElement(ctx, el as PencilElement);
	}

	// Draw handles if highlighted
	if (highlight) {
		drawResizeHandles(ctx, el, copyIcon, rotationIcon);
	}

	ctx.restore();
};

/**
 * Draws the blue rectangle shown when multi-selecting elements.
 * @param ctx The canvas rendering context.
 * @param rect The selection rectangle element.
 */
const drawSelectionRect = (
	ctx: CanvasRenderingContext2D,
	rect: RectangleElement
) => {
	const { x, y, width, height } = normalizeRect(rect);
	ctx.save();
	ctx.fillStyle = "rgba(0, 0, 255, 0.1)";
	ctx.strokeStyle = "blue";
	ctx.lineWidth = 1;
	ctx.fillRect(x, y, width, height);
	ctx.strokeRect(x, y, width, height);
	ctx.restore();
};

/**
 * Draws the angle indicator tooltip that appears during rotation or line drawing.
 * @param ctx The canvas rendering context.
 * @param info The angle and position information.
 */
const drawAngleIndicator = (
	ctx: CanvasRenderingContext2D,
	info: { angle: number; x: number; y: number }
) => {
	ctx.save();

	const text = `${info.angle}°`;
	ctx.font = "12px sans-serif";
	const textMetrics = ctx.measureText(text);
	const textWidth = textMetrics.width;
	const textHeight = 12; // approximation

	const padding = 6;
	const rectWidth = textWidth + padding * 2;
	const rectHeight = textHeight + padding;

	// Position tooltip slightly offset from the cursor
	const rectX = info.x + 15;
	const rectY = info.y + 15;

	// Draw background
	ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
	ctx.beginPath();
	ctx.roundRect(rectX, rectY, rectWidth, rectHeight, 4);
	ctx.fill();

	// Draw text
	ctx.fillStyle = "white";
	ctx.textAlign = "center";
	ctx.textBaseline = "middle";
	ctx.fillText(text, rectX + rectWidth / 2, rectY + rectHeight / 2);

	ctx.restore();
};

/**
 * Props for the useDrawing hook.
 */
interface UseDrawingProps {
	staticCanvasRef: RefObject<HTMLCanvasElement>;
	activeCanvasRef: RefObject<HTMLCanvasElement>;
	elements: Element[];
	selectedElements: Element[];
	editingElement: Element | null;
	selectionRect: RectangleElement | null;
	drawingAngleInfo: { angle: number; x: number; y: number } | null;
	width: number;
	height: number;
	virtualWidth: number;
	virtualHeight: number;
	viewTransform: { scale: number; offsetX: number; offsetY: number };
}

/**
 * A hook that manages all rendering operations for the whiteboard.
 * It uses a double-buffering technique with two canvases:
 * - `staticCanvas` (bottom layer): Renders all non-selected, static elements. It's only redrawn when elements are added, removed, or deselected.
 * - `activeCanvas` (top layer): Renders selected elements, handles, and interaction feedback (like selection boxes). It's cleared and redrawn on every frame during an interaction.
 */
export const useDrawing = ({
	staticCanvasRef,
	activeCanvasRef,
	elements,
	selectedElements,
	editingElement,
	selectionRect,
	drawingAngleInfo,
	width,
	height,
	virtualWidth,
	virtualHeight,
	viewTransform,
}: UseDrawingProps) => {
	const copyIconRef = useRef<HTMLImageElement | null>(null);
	const rotationIconRef = useRef<HTMLImageElement | null>(null);

	// Effect to load the SVG icons for the copy and rotate handles.
	useEffect(() => {
		const icon = new Image();
		const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="green" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
		icon.src = `data:image/svg+xml;utf8,${encodeURIComponent(copyIconSvg)}`;
		icon.onload = () => {
			copyIconRef.current = icon;
		};

		const rotIcon = new Image();
		const rotationIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0000ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;
		rotIcon.src = `data:image/svg+xml;utf8,${encodeURIComponent(rotationIconSvg)}`;
		rotIcon.onload = () => {
			rotationIconRef.current = rotIcon;
		};
	}, []);

	// The main layout effect that orchestrates the drawing of both canvases.
	useLayoutEffect(() => {
		if (width === 0 || height === 0) {
			return;
		}

		const staticCanvas = staticCanvasRef.current;
		if (!staticCanvas) return;
		const staticCtx = staticCanvas.getContext("2d")!;
		staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);

		// --- Draw static canvas (bottom layer) ---
		staticCtx.save();
		staticCtx.translate(viewTransform.offsetX, viewTransform.offsetY);
		staticCtx.scale(viewTransform.scale, viewTransform.scale);

		const selectedIds = new Set(
			selectedElements.map((el) => el.id).concat(editingElement ? [editingElement.id] : [])
		);

		// Draw all elements that are NOT selected or being edited onto the static canvas.
		elements.filter((el) => !selectedIds.has(el.id)).forEach((el) => {
			drawElement(staticCtx, el, false, null, null);
		});

		staticCtx.restore();

		const activeCanvas = activeCanvasRef.current;
		if (!activeCanvas) return;
		const activeCtx = activeCanvas.getContext("2d")!;
		activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);

		// --- Draw active canvas (top layer) ---
		activeCtx.save();
		activeCtx.translate(viewTransform.offsetX, viewTransform.offsetY);
		activeCtx.scale(viewTransform.scale, viewTransform.scale);

		// Draw all selected elements in their highlighted state.
		selectedElements.forEach((el) => {
			// Draw the element with its highlight, which won't include the label
			drawElement(activeCtx, el, true, copyIconRef.current, rotationIconRef.current);
			// Manually draw the label on top, as it's not part of the highlighted element drawing.
			if (el.label && el.id !== editingElement?.id) {
				drawLabel(activeCtx, el.label, getElementCenter(el));
			}
		});

		if (selectionRect) {
			drawSelectionRect(activeCtx, selectionRect);
		}

		activeCtx.restore();

		// Draw the angle indicator in screen space, so it's not affected by canvas zoom/pan.
		if (drawingAngleInfo) {
			const screenX =
				drawingAngleInfo.x * viewTransform.scale + viewTransform.offsetX;
			const screenY =
				drawingAngleInfo.y * viewTransform.scale + viewTransform.offsetY;
			drawAngleIndicator(activeCtx, { ...drawingAngleInfo, x: screenX, y: screenY });
		}
	}, [
		elements,
		selectedElements,
		editingElement,
		selectionRect,
		staticCanvasRef,
		activeCanvasRef,		
		drawingAngleInfo,
		width,
		height,
		virtualWidth,
		virtualHeight,
		viewTransform,
	]);
};
