import { useState, useCallback, useEffect, RefObject, useRef } from "react";
import type {
	Element,
	Action,
	ElementType,
	Point,
	HandleType,
	RectangleElement,
	PencilElement,
} from "./types";
import type { TextElement } from "./types";
import {
	hitTestHandle,
	getElementAtPosition,
	moveElement,
	resizeElement,
	getElementCenter,
	isElementIntersectingRect,
	simplifyPath,
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
	setEditingElement: (element: Element | null) => void;
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
	setEditingElement,
	setDrawingAngleInfo,
}: UseInteractionsProps) => {
	const [action, setAction] = useState<Action>("none");
	const [selectionRect, setSelectionRect] = useState<RectangleElement | null>(
		null
	);
	const [resizeHandle, setResizeHandle] = useState<HandleType | null>(null);
	const [startPos, setStartPos] = useState<Point>({ x: 0, y: 0 });
	const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
	
	const rotationCenterRef = useRef<Point | null>(null);
	const initialRotationRef = useRef<number>(0);

	// Cursor effect
	useEffect(() => {
		const canvas = activeCanvasRef.current;
		if (!canvas) return;

		switch (selectedTool) {
			case "selection":
				canvas.style.cursor = "default";
				break;
			case "rectangle":
			case "pencil":
			case "line":
			case "rotation":
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
				// Priority 1: Check for handle interaction on selected elements.
				// This is because handles can be outside the element's bounding box.
				if (selectedElements.length > 0) {
					// For simplicity, we check handles only on the first selected element.
					const activeElement = selectedElements[0];
					const handle = hitTestHandle(activeElement, pos);
					if (handle) {
						if (handle === "rotation") {
							setAction("rotating");
							rotationCenterRef.current = getElementCenter(activeElement);
							// Capture the starting angle of both the mouse and the object
							initialRotationRef.current = activeElement.rotation || 0;
							setStartPos(pos);
							return;
						}
						if (handle === "copy") {
							console.log("user wants to clone this element");
							
							// --- COPY LOGIC ---
							const newElement = JSON.parse(JSON.stringify(activeElement));
							newElement.id = generateId();
							moveElement(newElement, 15, 15);
	
							updateElements([newElement]);
							setSelectedElements([newElement]);
							setAction("none"); // It's a single-click action
							return;
						} else {
							// It's a resize handle.
							setAction("resizing");
							setResizeHandle(handle);
							setStartPos(pos);
							// The element is already selected, no need to call setSelectedElements.
							return;
						}
					}
				}

				// Priority 2: Check if we are clicking on an element to select or drag it.
				const elementUnderPointer = getElementAtPosition(elements, pos);
				if (elementUnderPointer) {
					setAction("dragging");
					setDragOffset({ x: pos.x - elementUnderPointer.x, y: pos.y - elementUnderPointer.y });
					if (!selectedElements.some(el => el.id === elementUnderPointer.id)) {
						setSelectedElements([elementUnderPointer]);
					}
				}
				// Priority 3: Click on empty space. Deselect or start multi-selection.
				else {
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
			} else if (selectedTool === "text") {
				// For text, we handle creation on pointer up (click)
				// We set a 'placing' action to distinguish a click from a drag
				setAction("placing");
				setStartPos(pos);
				return;
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
						: selectedTool === "pencil"
						? {
								id: generateId(),
								type: "pencil",
								x: pos.x,
								y: pos.y,
								points: [{ x: pos.x, y: pos.y }],
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
		[getCanvasPos, selectedTool, elements, selectedElements, setSelectedElements, setEditingElement, setDrawingAngleInfo]
	);

	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			const pos = getCanvasPos(e);
			const canvas = activeCanvasRef.current!;

			if (action === "placing") {
				const distance = Math.hypot(pos.x - startPos.x, pos.y - startPos.y);
				if (distance > 5) {
					// if user drags more than 5px, cancel placing
					setAction("none");
				}
				return;
			}
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
							case "rotation":
								canvas.style.cursor = "crosshair"; // Or a custom rotation cursor
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
				} else if (updatedEl.type === "pencil") {
					// Create a new points array to ensure React detects the change
					(updatedEl as PencilElement).points = [
						...(updatedEl as PencilElement).points,
						{ x: pos.x, y: pos.y },
					];
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
			} else if (action === "rotating" && selectedElements.length > 0 && rotationCenterRef.current) {
				const center = rotationCenterRef.current;
				const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
				const startAngle = Math.atan2(startVector.y, startVector.x);
				
				const currentVector = { x: pos.x - center.x, y: pos.y - center.y };
				const currentAngle = Math.atan2(currentVector.y, currentVector.x);

				const angleDiff = currentAngle - startAngle;
				const newRotation = initialRotationRef.current + (angleDiff * 180 / Math.PI);

				const rotatedEl = { ...selectedElements[0], rotation: newRotation };
				setSelectedElements([rotatedEl]);
			} else if (action === "resizing" && selectedElements.length > 0 && resizeHandle && startPos) {
				const activeElement = selectedElements[0];
				const dx = pos.x - startPos.x;
				const dy = pos.y - startPos.y;
				const resizedEl = { ...activeElement };
				resizeElement(resizedEl, resizeHandle, dx, dy);
				setSelectedElements([resizedEl]);
				if (resizedEl.type === "line" || resizedEl.type === "arrow") {
					const rdx = resizedEl.x2 - resizedEl.x;
					const rdy = resizedEl.y2 - resizedEl.y;
					if (rdx !== 0 || rdy !== 0) {
						const angleRad = Math.atan2(rdy, rdx);
						const angleDeg = (angleRad * 180) / Math.PI;
						setDrawingAngleInfo({ angle: Math.round(angleDeg), x: pos.x, y: pos.y });
					}
				} else {
					setDrawingAngleInfo(null);
				}
				setStartPos(pos);
			}
		},
		[action, getCanvasPos, selectedTool, selectedElements, startPos, dragOffset, resizeHandle, elements, selectionRect, activeCanvasRef, setSelectedElements, setDrawingAngleInfo]
	);

	const handlePointerUp = useCallback(() => {
		if (action === "placing" && selectedTool === "text") {
			const newEl: TextElement = {
				id: generateId(),
				type: "text",
				x: startPos.x,
				y: startPos.y,
				text: "",
				fontSize: 24,
				fontFamily: "sans-serif",
			};
			setEditingElement(newEl);
			// We don't call updateElements yet, that will happen in handleLabelUpdate
		} else if (action === "multi-selecting" && selectionRect) {
			const selected = elements.filter((el) => isElementIntersectingRect(el, selectionRect));
			setSelectedElements(selected);
			setSelectionRect(null);
		} else if ((action === "drawing" || action === "resizing" || action === "dragging" || action === "rotating") && selectedElements.length > 0) {
			const finalElements = selectedElements.map(el => {
				if (el.type === 'pencil' && el.points.length > 1) {
					// Simplify the path before storing it to improve performance and reduce storage size.
					// An epsilon of 1.0 is a good starting point.
					const simplifiedPoints = simplifyPath(el.points, 1.0);
					return { ...el, points: simplifiedPoints };
				}
				return el;
			});

			updateElements(finalElements);
		}

		setAction("none");
		setDrawingAngleInfo(null);
		setResizeHandle(null);
		rotationCenterRef.current = null;

		if (action === "drawing") {
			setSelectedTool("selection");
		} else if (action === "placing") {
			setSelectedTool("selection");
		}
	}, [action, selectedElements, updateElements, elements, selectionRect, setSelectedElements, setSelectedTool, setDrawingAngleInfo, setEditingElement, startPos, selectedTool]);

	return { selectionRect, handlePointerDown, handlePointerMove, handlePointerUp };
};
