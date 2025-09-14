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

const drawElement = (
	ctx: CanvasRenderingContext2D,
	el: Element,
	highlight: boolean,
	copyIcon: HTMLImageElement | null,
	rotationIcon: HTMLImageElement | null
) => {
	ctx.save();
	const center = getElementCenter(el);
	if (el.rotation && center) {
		ctx.translate(center.x, center.y);
		ctx.rotate((el.rotation * Math.PI) / 180);
		ctx.translate(-center.x, -center.y);
	}

	ctx.strokeStyle = "black";
	ctx.lineWidth = 2;

	// Common highlight style
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

interface UseDrawingProps {
	staticCanvasRef: RefObject<HTMLCanvasElement>;
	activeCanvasRef: RefObject<HTMLCanvasElement>;
	elementCanvasMap: RefObject<WeakMap<Element, HTMLCanvasElement>>;
	elements: Element[];
	selectedElements: Element[];
	editingElement: Element | null;
	selectionRect: RectangleElement | null;
	drawingAngleInfo: { angle: number; x: number; y: number } | null;
	width: number;
	height: number;
}

export const useDrawing = ({
	staticCanvasRef,
	activeCanvasRef,
	elementCanvasMap,
	elements,
	selectedElements,
	editingElement,
	selectionRect,
	drawingAngleInfo,
	width,
	height,
}: UseDrawingProps) => {
	const copyIconRef = useRef<HTMLImageElement | null>(null);
	const rotationIconRef = useRef<HTMLImageElement | null>(null);

	useEffect(() => {
		const icon = new Image();
		const copyIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="green" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`;
		icon.src = `data:image/svg+xml;utf8,${encodeURIComponent(copyIconSvg)}`;
		icon.onload = () => {
			copyIconRef.current = icon;
		};

		const rotIcon = new Image();
		const rotationIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#0000ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21.5 2v6h-6M2.5 22v-6h6"/><path d="M22 11.5A10 10 0 0 0 3.5 12.5"/><path d="M2 12.5a10 10 0 0 0 18.5-1"/></svg>`;
		rotIcon.src = `data:image/svg+xml;utf8,${encodeURIComponent(rotationIconSvg)}`;
		rotIcon.onload = () => {
			rotationIconRef.current = rotIcon;
		};
	}, []);

	const createElementSnapshot = useCallback(
		(el: Element) => {
			const offCanvas = document.createElement("canvas");
			offCanvas.width = width;
			offCanvas.height = height;
			const ctx = offCanvas.getContext("2d")!;
			drawElement(ctx, el, false, null, null);
			elementCanvasMap.current?.set(el, offCanvas);
		},
		[elementCanvasMap, width, height]
	);

	useLayoutEffect(() => {
		if (width === 0 || height === 0) {
			return;
		}

		const staticCanvas = staticCanvasRef.current;
		if (!staticCanvas) return;
		const staticCtx = staticCanvas.getContext("2d")!;
		staticCtx.clearRect(0, 0, staticCanvas.width, staticCanvas.height);

		const selectedIds = new Set(
			selectedElements.map((el) => el.id).concat(editingElement ? [editingElement.id] : [])
		);

		elements
			.filter((el) => !selectedIds.has(el.id))
			.forEach((el) => {
				if (!elementCanvasMap.current?.has(el)) {
					createElementSnapshot(el);
				}
				const snapshot = elementCanvasMap.current?.get(el);
				if (snapshot) {
					staticCtx.drawImage(snapshot, 0, 0);
				}
			});

		const activeCanvas = activeCanvasRef.current;
		if (!activeCanvas) return;
		const activeCtx = activeCanvas.getContext("2d")!;
		activeCtx.clearRect(0, 0, activeCanvas.width, activeCanvas.height);

		selectedElements.forEach((el) => {
			// Draw the element with its highlight, which won't include the label
			drawElement(activeCtx, el, true, copyIconRef.current, rotationIconRef.current);
			// Now, manually draw the label if it exists and is not being edited
			if (el.label && el.id !== editingElement?.id) {
				drawLabel(activeCtx, el.label, getElementCenter(el));
			}
		});

		if (selectionRect) {
			drawSelectionRect(activeCtx, selectionRect);
		}

		if (drawingAngleInfo) {
			drawAngleIndicator(activeCtx, drawingAngleInfo);
		}
	}, [
		elements,
		selectedElements,
		editingElement,
		selectionRect,
		staticCanvasRef,
		activeCanvasRef,
		elementCanvasMap,
		createElementSnapshot,
		drawingAngleInfo,
		width,
		height,
	]);
};
