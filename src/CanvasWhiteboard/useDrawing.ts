import { useLayoutEffect, useCallback } from "react";
import type { RefObject } from "react";
import type { Element, Point, RectangleElement } from "./types";
import { HANDLE_SIZE } from "./constants";
import { getHandles, normalizeRect, getElementCenter } from "./elementUtils";

const drawResizeHandles = (
	ctx: CanvasRenderingContext2D,
	el: Element
) => {
	ctx.fillStyle = "blue";
	const handles = getHandles(el);

	if (el.type === "line" || el.type === "arrow") {
		handles.forEach((h) => {
			ctx.beginPath();
			ctx.arc(h.x, h.y, HANDLE_SIZE / 2, 0, 2 * Math.PI);
			ctx.fill();
		});
	} else {
		handles.forEach((h) =>
			ctx.fillRect(
				h.x - HANDLE_SIZE / 2,
				h.y - HANDLE_SIZE / 2,
				HANDLE_SIZE,
				HANDLE_SIZE
			)
		);
	}
};

const drawLabel = (ctx: CanvasRenderingContext2D, label: string, center: Point) => {
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

const drawElement = (
	ctx: CanvasRenderingContext2D,
	el: Element,
	highlight = false
) => {
	ctx.save();
	ctx.strokeStyle = "black";
	ctx.lineWidth = 2;
	if (el.type === "rectangle") {
		ctx.save();
		if (highlight) {
			ctx.strokeStyle = "red";
			ctx.setLineDash([5, 3]);
		}
		const { x, y, width, height } = normalizeRect(el);
		ctx.strokeRect(x, y, width, height);
		ctx.restore();
		if (highlight) drawResizeHandles(ctx, el);
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, { x: x + width / 2, y: y + height / 2 });
		}
	} else if (el.type === "diamond") {
		ctx.save();
		if (highlight) {
			ctx.strokeStyle = "red";
			ctx.setLineDash([5, 3]);
		}
		const { x, y, width, height } = normalizeRect(el);
		ctx.beginPath();
		ctx.moveTo(x + width / 2, y);
		ctx.lineTo(x + width, y + height / 2);
		ctx.lineTo(x + width / 2, y + height);
		ctx.lineTo(x, y + height / 2);
		ctx.closePath();
		ctx.stroke();
		ctx.restore();
		if (highlight) drawResizeHandles(ctx, el);
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, { x: x + width / 2, y: y + height / 2 });
		}
	} else if (el.type === "line") {
		ctx.save();
		if (highlight) {
			ctx.strokeStyle = "red";
			ctx.setLineDash([5, 3]);
		}
		ctx.beginPath();
		ctx.moveTo(el.x, el.y);
		ctx.lineTo(el.x2, el.y2);
		ctx.stroke();
		ctx.restore();
		if (highlight) drawResizeHandles(ctx, el);
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, getElementCenter(el));
		}
	} else if (el.type === "arrow") {
		ctx.save();
		if (highlight) {
			ctx.strokeStyle = "red";
			ctx.fillStyle = "red";
			ctx.setLineDash([5, 3]);
		}

		const angle = Math.atan2(el.y2 - el.y, el.x2 - el.x);
		// Draw line part
		ctx.beginPath();
		ctx.moveTo(el.x, el.y);
		ctx.lineTo(el.x2, el.y2);
		ctx.stroke();

		// Draw arrowhead
		ctx.save();
		ctx.translate(el.x2, el.y2);
		ctx.rotate(angle);
		ctx.beginPath();
		ctx.moveTo(0, 0);
		ctx.lineTo(-10, -5);
		ctx.lineTo(-10, 5);
		ctx.closePath();
		ctx.fill();
		ctx.restore(); // Restore transform

		ctx.restore(); // Restore styles

		if (highlight) drawResizeHandles(ctx, el);

		if (el.label && !highlight) {
			drawLabel(ctx, el.label, getElementCenter(el));
		}
	} else if (el.type === "circle") {
		ctx.save();
		if (highlight) {
			ctx.strokeStyle = "red";
			ctx.setLineDash([5, 3]);
		}
		ctx.beginPath();
		ctx.arc(el.x, el.y, el.radius, 0, 2 * Math.PI);
		ctx.stroke();
		ctx.restore();
		if (highlight) drawResizeHandles(ctx, el);
		if (el.label && !highlight) {
			drawLabel(ctx, el.label, { x: el.x, y: el.y });
		}
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
}: UseDrawingProps) => {
	const createElementSnapshot = useCallback((el: Element) => {
		const offCanvas = document.createElement("canvas");
		offCanvas.width = 800;
		offCanvas.height = 600;
		const ctx = offCanvas.getContext("2d")!;
		drawElement(ctx, el);
		elementCanvasMap.current?.set(el, offCanvas);
	}, [elementCanvasMap]);

	useLayoutEffect(() => {
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
			drawElement(activeCtx, el, true);
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
	}, [elements, selectedElements, editingElement, selectionRect, staticCanvasRef, activeCanvasRef, elementCanvasMap, createElementSnapshot, drawingAngleInfo]);
};
