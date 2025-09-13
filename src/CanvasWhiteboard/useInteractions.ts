import { useState, useCallback, useEffect, RefObject } from "react";
import type {
	Element,
	Action,
	ElementType,
	Point,
	HandleType,
	RectangleElement,
} from "./types";
import {
	hitTestHandle,
	getElementAtPosition,
	moveElement,
	resizeElement,
	isElementIntersectingRect,
} from "./elementUtils";
import { generateId } from "./utils";

interface UseInteractionsProps {
	activeCanvasRef: RefObject<HTMLCanvasElement>;
	elements: Element[];
	selectedElements: Element[];
	setSelectedElements: (elements: Element[]) => void;
	updateElements: (updatedElements: Element[]) => void;
	selectedTool: ElementType;
	setSelectedTool: (tool: ElementType) => void;
	setDrawingAngleInfo: (info: { angle: number; x: number; y: number } | null) => void;
}

export const useInteractions = ({
	activeCanvasRef,
	elements,
	selectedElements,
	setSelectedElements,
	updateElements,
	selectedTool,
	setSelectedTool,
	setDrawingAngleInfo,
}: UseInteractionsProps) => {
	const [action, setAction] = useState<Action>("none");
	const [selectionRect, setSelectionRect] = useState<RectangleElement | null>(
		null
	);
	const [resizeHandle, setResizeHandle] = useState<HandleType | null>(null);
	const [startPos, setStartPos] = useState<Point>({ x: 0, y: 0 });
	const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

	// Cursor effect
	useEffect(() => {
		const canvas = activeCanvasRef.current;
		if (!canvas) return;

		switch (selectedTool) {
			case "selection":
				canvas.style.cursor = "default";
				break;
			case "rectangle":
			case "line":
				canvas.style.cursor = "crosshair";
				break;
		}
	}, [selectedTool, activeCanvasRef]);

	const getCanvasPos = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = activeCanvasRef.current!;
			const rect = canvas.getBoundingClientRect();
			return { x: event.clientX - rect.left, y: event.clientY - rect.top };
		},
		[activeCanvasRef]
	);

	const handlePointerDown = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			const pos = getCanvasPos(e);
			if (selectedTool === "selection") {
				const el = getElementAtPosition(elements, pos);
				if (el) {
					const isAlreadySelected = selectedElements.some(
						(selected) => selected.id === el.id
					);
					const handle = hitTestHandle(el, pos);
					if (handle) {
						setAction("resizing");
						setResizeHandle(handle);
						setStartPos(pos);
						setSelectedElements([el]);
					} else {
						setAction("dragging");
						setDragOffset({ x: pos.x - el.x, y: pos.y - el.y });
						if (!isAlreadySelected) {
							setSelectedElements([el]);
						}
					}
				} else {
					setAction("multi-selecting");
					setStartPos(pos);
					setSelectionRect({
						id: "selection",
						type: "rectangle",
						x: pos.x,
						y: pos.y,
						width: 0,
						height: 0,
					});
					setSelectedElements([]);
				}
			} else {
				const newEl: Element =
					selectedTool === "rectangle"
						? {
								id: generateId(),
								type: "rectangle",
								x: pos.x,
								y: pos.y,
								width: 0,
								height: 0,
						  }
						: selectedTool === "circle"
						? {
								id: generateId(),
								type: "circle",
								x: pos.x,
								y: pos.y,
								radius: 0,
						  }
						: selectedTool === "diamond"
						? {
								id: generateId(),
								type: "diamond",
								x: pos.x,
								y: pos.y,
								width: 0,
								height: 0,
						  }
						: selectedTool === "arrow"
						? {
								id: generateId(),
								type: "arrow",
								x: pos.x,
								y: pos.y,
								x2: pos.x,
								y2: pos.y,
						  }
						: {
								id: generateId(),
								type: "line",
								x: pos.x,
								y: pos.y,
								x2: pos.x,
								y2: pos.y,
						  };
				setSelectedElements([newEl]);
				setStartPos(pos);
				setAction("drawing");
			}
		},
		[getCanvasPos, selectedTool, elements, selectedElements, setSelectedElements, setDrawingAngleInfo]
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			const pos = getCanvasPos(e);
			const canvas = activeCanvasRef.current!;

			if (action === "none" && selectedTool === "selection") {
				const el = getElementAtPosition(elements, pos);
				if (el) {
					const handle = hitTestHandle(el, pos);
					if (handle) {
						switch (handle) {
							case "top-left":
							case "bottom-right":
								canvas.style.cursor = "nwse-resize";
								break;
							case "top-right":
							case "bottom-left":
								canvas.style.cursor = "nesw-resize";
								break;
							case "start":
							case "end":
								canvas.style.cursor = "pointer";
								break;
							default:
								canvas.style.cursor = "ew-resize";
								break;
						}
					} else {
						canvas.style.cursor = "move";
					}
				} else if (el) {
					canvas.style.cursor = "move";
				} else {
					canvas.style.cursor = "default";
				}
			}

			if (action === "multi-selecting" && selectionRect) {
				setSelectionRect({
					...selectionRect,
					width: pos.x - startPos.x,
					height: pos.y - startPos.y,
				});
				return;
			}

			if (action === "drawing" && selectedElements.length > 0 && startPos) {
				const updatedEl = { ...selectedElements[0] };
				if (updatedEl.type === "rectangle") {
					updatedEl.width = pos.x - startPos.x;
					updatedEl.height = pos.y - startPos.y;
					setDrawingAngleInfo(null);
				} else if (updatedEl.type === "line" || updatedEl.type === "arrow") {
					updatedEl.x2 = pos.x;
					updatedEl.y2 = pos.y;
					const dx = updatedEl.x2 - updatedEl.x;
					const dy = updatedEl.y2 - updatedEl.y;
					if (dx !== 0 || dy !== 0) {
						const angleRad = Math.atan2(dy, dx);
						const angleDeg = (angleRad * 180) / Math.PI;
						setDrawingAngleInfo({ angle: Math.round(angleDeg), x: pos.x, y: pos.y });
					} else {
						setDrawingAngleInfo(null);
					}
				} else if (updatedEl.type === "circle") {
					updatedEl.radius = Math.hypot(pos.x - startPos.x, pos.y - startPos.y);
					setDrawingAngleInfo(null);
				} else if (updatedEl.type === "diamond") {
					updatedEl.width = pos.x - startPos.x;
					updatedEl.height = pos.y - startPos.y;
					setDrawingAngleInfo(null);
				}
				setSelectedElements([updatedEl]);
			} else if (action === "dragging" && selectedElements.length > 0 && dragOffset) {
				// The element we clicked on to start the drag is the one that should follow the cursor.
				// It might not be the first in the array if we shift-clicked to select.
				const leadElement =
					getElementAtPosition(selectedElements, startPos) || selectedElements[0];
				const dx = pos.x - dragOffset.x - leadElement.x;
				const dy = pos.y - dragOffset.y - leadElement.y;
				const newSelectedElements = selectedElements.map((el) => {
					const newEl = { ...el };
					moveElement(newEl, dx, dy);
					return newEl;
				});
				setSelectedElements(newSelectedElements);
			} else if (action === "resizing" && selectedElements.length > 0 && resizeHandle && startPos) {
				const activeElement = selectedElements[0];
				const dx = pos.x - startPos.x;
				const dy = pos.y - startPos.y;
				const resizedEl = { ...activeElement };
				resizeElement(resizedEl, resizeHandle, dx, dy);
				setSelectedElements([resizedEl]);
				setStartPos(pos);
			}
		},
		[action, getCanvasPos, selectedTool, selectedElements, startPos, dragOffset, resizeHandle, elements, selectionRect, activeCanvasRef, setSelectedElements, setDrawingAngleInfo]
	);

	const handlePointerUp = useCallback(() => {
		if (action === "multi-selecting" && selectionRect) {
			const selected = elements.filter((el) => isElementIntersectingRect(el, selectionRect));
			setSelectedElements(selected);
			setSelectionRect(null);
		} else if ((action === "drawing" || action === "resizing" || action === "dragging") && selectedElements.length > 0) {
			updateElements(selectedElements);
		}

		setAction("none");
		setDrawingAngleInfo(null);
		setResizeHandle(null);

		if (action === "drawing") {
			setSelectedTool("selection");
		}
	}, [action, selectedElements, updateElements, elements, selectionRect, setSelectedElements, setSelectedTool, setDrawingAngleInfo]);

	return { selectionRect, handlePointerDown, handlePointerMove, handlePointerUp };
};
