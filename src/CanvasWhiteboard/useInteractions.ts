import { useState, useCallback, useEffect, RefObject, useRef } from 'react';
import type {
	Element,
	Action,
	ElementType,
	Point,
	HandleType,
	RectangleElement,
	PencilElement,
} from "./types";
import type { TextElement } from './types';
import {
	hitTestHandle,
	getElementAtPosition,
	moveElement,
	resizeElement,
	getElementCenter,
	isElementIntersectingRect,
} from './element';
import { simplifyPath, normalizeRect, rotatePoint } from './geometry';
import { generateId } from './id';

/**
 * Props for the useInteractions hook.
 */
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
	viewTransform: { scale: number; offsetX: number; offsetY: number };
	setViewTransform: (transform: { scale: number; offsetX: number; offsetY: number }) => void;
	isSpacePressed: boolean;
	isCtrlPressed: boolean;
}

/**
 * A comprehensive hook to manage all user interactions on the canvas.
 * This includes drawing, selecting, moving, resizing, rotating, curving, and panning.
 * It functions as a state machine, transitioning between different `Action` states.
 */
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
	viewTransform,
	setViewTransform,
	isSpacePressed,
	isCtrlPressed,
}: UseInteractionsProps) => {
	// The `action` state determines the current user interaction mode.
	const [action, setAction] = useState<Action>("none");

	// State for multi-selection rectangle.
	const [selectionRect, setSelectionRect] = useState<RectangleElement | null>(
		null
	);

	// State for element transformations.
	const [resizeHandle, setResizeHandle] = useState<HandleType | null>(null);
	const [startPos, setStartPos] = useState<Point>({ x: 0, y: 0 });
	const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });

	// Refs for managing complex interactions like panning and rotation.
	const activePointers = useRef<Map<number, Point>>(new Map()); // Tracks active pointers for multi-touch gestures.
	const panStartRef = useRef<{
		point: Point;
		viewTransform: { offsetX: number; offsetY: number };
	}>({ point: { x: 0, y: 0 }, viewTransform: { offsetX: 0, offsetY: 0 } });
	const rotationCenterRef = useRef<Point | null>(null);
	const initialRotationRef = useRef<number>(0);

	// Effect to update the cursor style based on the current tool and interaction.
	useEffect(() => {
		const canvas = activeCanvasRef.current;
		if (!canvas) return;

		// Panning cursor takes precedence.
		if (isSpacePressed || isCtrlPressed) {
			canvas.style.cursor = 'grab';
			return;
		}

		switch (selectedTool) {
			case "selection":
				canvas.style.cursor = "default";
				break;
			case "rectangle":
			case "diamond":
			case "circle":
			case "arrow":
			case "pencil":
			case "line":
			case "rotation":
				canvas.style.cursor = "crosshair";
				break;
			case 'text':
				canvas.style.cursor = 'text';
				break;
		}
	}, [selectedTool, activeCanvasRef, isSpacePressed, isCtrlPressed]);

	/**
	 * Converts pointer event coordinates from screen space to canvas "world" space.
	 * This accounts for the current pan and zoom level.
	 */
	const getCanvasPos = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = activeCanvasRef.current!;
			const rect = canvas.getBoundingClientRect();
			const screenX = event.clientX - rect.left;
			const screenY = event.clientY - rect.top;
			// Convert screen coordinates to world coordinates
			const worldX = (screenX - viewTransform.offsetX) / viewTransform.scale;
			const worldY = (screenY - viewTransform.offsetY) / viewTransform.scale;
			return { x: worldX, y: worldY };
		},
		[activeCanvasRef, viewTransform]
	);

	/**
	 * Converts pointer event coordinates to screen space, relative to the canvas element.
	 * This is used for interactions that don't depend on zoom/pan, like panning itself.
	 */
	const getScreenPos = useCallback(
		(event: React.PointerEvent<HTMLCanvasElement>) => {
			const canvas = activeCanvasRef.current!;
			const rect = canvas.getBoundingClientRect();
			return { x: event.clientX - rect.left, y: event.clientY - rect.top };
		},
		[activeCanvasRef]
	);

	/**
	 * Handles interactions when the "selection" tool is active.
	 * This function determines whether to start a resize, drag, rotation, or multi-selection.
	 * The order of checks is important to prioritize handle interactions over general element clicks.
	 */
	const handleSelectionInteraction = (e: React.PointerEvent<HTMLCanvasElement>, pos: Point) => {
		// Priority 1: Check for handle interaction on selected elements.
		if (selectedElements.length > 0) {
			// For simplicity, we only check handles on the first selected element.
			// Multi-element transforms could be implemented here in the future.
			const activeElement = selectedElements[0];
			const handle = hitTestHandle(activeElement, pos);
			if (handle) {
				if (handle === 'curve') {
					setAction('curving');
					return true;
				}
				else if (handle === 'rotation') {
					setAction('rotating');
					rotationCenterRef.current = getElementCenter(activeElement);
					initialRotationRef.current = activeElement.rotation || 0;
					setStartPos(pos);
					return true;
				}
				else if (handle === 'copy') {
					// Clone the element and offset it slightly.
					console.log('user wants to clone this element');
					const newElement = JSON.parse(JSON.stringify(activeElement));
					newElement.id = generateId();
					moveElement(newElement, 15, 15);
					updateElements([newElement]);
					setSelectedElements([newElement]);
					setAction('none'); // It's a one-off action.
					return true;
				} else {
					// It's a resize handle.
					setAction('resizing');
					setResizeHandle(handle);
					setStartPos(pos);
					return true;
				}
			}
		}

		// Priority 2: Check if we are clicking on an element to select or drag it.
		const elementUnderPointer = getElementAtPosition(elements, pos);
		if (elementUnderPointer) {
			setAction('dragging');
			setDragOffset({ x: pos.x - elementUnderPointer.x, y: pos.y - elementUnderPointer.y });
			// If the clicked element is not already selected, select it.
			if (!selectedElements.some((el) => el.id === elementUnderPointer.id)) {
				setSelectedElements([elementUnderPointer]);
			}
			return true;
		}

		// Priority 3: Click on empty space. Start multi-selection.
		setAction('multi-selecting');
		setStartPos(pos);
		setSelectionRect({
			id: 'selection',
			type: 'rectangle',
			x: pos.x,
			y: pos.y,
			width: 0,
			height: 0,
		});
		setSelectedElements([]); // Deselect any previously selected elements.
		return false;
	};

	/**
	 * Handles interactions when a drawing tool (rectangle, line, etc.) is active.
	 */
	const handleDrawingInteraction = (pos: Point) => {
		// For text, we just mark the position and wait for pointerUp.
		if (selectedTool === 'text') {
			setAction('placing');
			setStartPos(pos);
			return;
		}

		// For other shapes, create a new element and set the action to 'drawing'.
		const newEl: Element =
			selectedTool === 'rectangle'
				? { id: generateId(), type: 'rectangle', x: pos.x, y: pos.y, width: 0, height: 0 }
				: selectedTool === 'circle'
				? { id: generateId(), type: 'circle', x: pos.x, y: pos.y, radius: 0 }
				: selectedTool === 'diamond'
				? { id: generateId(), type: 'diamond', x: pos.x, y: pos.y, width: 0, height: 0 }
				: selectedTool === 'arrow'
				? { id: generateId(), type: 'arrow', x: pos.x, y: pos.y, x2: pos.x, y2: pos.y }
				: selectedTool === 'pencil'
				? { id: generateId(), type: 'pencil', x: pos.x, y: pos.y, points: [{ x: pos.x, y: pos.y }] }
				: { id: generateId(), type: 'line', x: pos.x, y: pos.y, x2: pos.x, y2: pos.y };

		setSelectedElements([newEl]);
		setStartPos(pos);
		setAction('drawing');
	};

	/**
	 * The main entry point for pointer down events.
	 * This function orchestrates the start of any interaction.
	 */
	const handlePointerDown = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			activePointers.current.set(e.pointerId, getScreenPos(e));

			// Panning takes precedence over all other actions.
			// It can be triggered by middle mouse, spacebar, ctrl key, or two-finger touch.
			if (e.button === 1 || isSpacePressed || isCtrlPressed || activePointers.current.size > 1) {
				// if we are drawing, we want to cancel it and switch to panning.
				if (action === 'drawing' && selectedElements.length > 0) {
					const newElements = elements.filter(el => el.id !== selectedElements[0].id);
					updateElements(newElements);
					setSelectedElements([]);
				}

				// for two-finger panning, we need to recalculate the pan start point
				// to be the center of the two fingers.
				if (action !== 'panning' && activePointers.current.size > 1) {
					setAction('panning');
					const pointers = Array.from(activePointers.current.values());
					panStartRef.current.point = {
						x: (pointers[0].x + pointers[1].x) / 2,
						y: (pointers[0].y + pointers[1].y) / 2,
					};
					panStartRef.current.viewTransform.offsetX = viewTransform.offsetX;
					panStartRef.current.viewTransform.offsetY = viewTransform.offsetY;
				}

				setAction('panning');
				panStartRef.current = {
					point: getScreenPos(e),
					viewTransform: {
						offsetX: viewTransform.offsetX,
						offsetY: viewTransform.offsetY,
					},
				};

				// If it's a two-finger pan, use the midpoint.
				if (activePointers.current.size > 1) {
					const pointers = Array.from(activePointers.current.values());
					panStartRef.current.point = {
						x: (pointers[0].x + pointers[1].x) / 2,
						y: (pointers[0].y + pointers[1].y) / 2,
					};
				}

				return;
			}

			// If not panning, determine the action based on the selected tool.
			const pos = getCanvasPos(e);
			if (selectedTool === "selection") {
				handleSelectionInteraction(e, pos);
			} else {
				handleDrawingInteraction(pos);
			}
		},
		[getCanvasPos, getScreenPos, selectedTool, elements, selectedElements, setSelectedElements, updateElements, isSpacePressed, isCtrlPressed, viewTransform.offsetX, viewTransform.offsetY, action]
	);

	/**
	 * The main handler for pointer move events.
	 * This function executes the logic for the current `action`.
	 */
	const handlePointerMove = useCallback(
		(e: React.PointerEvent<HTMLCanvasElement>) => {
			// Update pointer position for multi-touch gestures.
			if (activePointers.current.has(e.pointerId)) {
				activePointers.current.set(e.pointerId, getScreenPos(e));
			}

			const canvas = activeCanvasRef.current!;
			// --- Panning Logic ---
			if (action === 'panning') {
				canvas.style.cursor = 'grabbing';
				let currentScreenPos = getScreenPos(e);

				// For two-finger panning, use the midpoint of the pointers.
				if (activePointers.current.size > 1) {
					const pointers = Array.from(activePointers.current.values());
					currentScreenPos = {
						x: (pointers[0].x + pointers[1].x) / 2,
						y: (pointers[0].y + pointers[1].y) / 2,
					};
				}

				const panDeltaX = currentScreenPos.x - panStartRef.current.point.x;
				const panDeltaY = currentScreenPos.y - panStartRef.current.point.y;
				setViewTransform({
					...viewTransform,
					offsetX: panStartRef.current.viewTransform.offsetX + panDeltaX,
					offsetY: panStartRef.current.viewTransform.offsetY + panDeltaY,
				});
				return;
			}

			const pos = getCanvasPos(e);

			// --- Placing Text Logic ---
			if (action === "placing") {
				const distance = Math.hypot(pos.x - startPos.x, pos.y - startPos.y);
				if (distance > 5) {
					// if user drags more than 5px, cancel placing and switch to drawing a text box.
					// This is a potential future feature. For now, it just cancels.
					setAction("none");
				}
				return;
			}
			// --- Hover Logic (when no action is active) ---
			if (action === "none" && selectedTool === "selection") {
				if (isSpacePressed || isCtrlPressed) {
					canvas.style.cursor = 'grab';
					return;
				}
				const el = getElementAtPosition(elements, pos);
				if (el) {
					const handle = hitTestHandle(el, pos);
					// Set cursor based on the handle type.
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
							case "curve":
								canvas.style.cursor = "move";
								break;
							default:
								canvas.style.cursor = "ew-resize";
								break;
						}
					} else {
						canvas.style.cursor = "move";
					}
				} else {
					canvas.style.cursor = "default";
				}
			}

			// --- Multi-selecting Logic ---
			if (action === "multi-selecting" && selectionRect) {
				setSelectionRect({
					...selectionRect,
					width: pos.x - startPos.x,
					height: pos.y - startPos.y,
				});
				return;
			}

			// --- Drawing Logic ---
			if (action === "drawing" && selectedElements.length > 0 && startPos) {
				const updatedEl = { ...selectedElements[0] };
				// Update the element's properties based on its type.
				if (updatedEl.type === "rectangle" || updatedEl.type === "diamond") {
					updatedEl.width = pos.x - startPos.x;
					updatedEl.height = pos.y - startPos.y;
					setDrawingAngleInfo(null);
				} else if (updatedEl.type === "pencil") {
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
				}
				setSelectedElements([updatedEl]);
			} 
			// --- Dragging Logic ---
			else if (action === "dragging" && selectedElements.length > 0 && dragOffset) {
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
			} 
			// --- Curving Logic ---
			else if (action === 'curving' && selectedElements.length > 0 && startPos) {
				const activeElement = selectedElements[0];
				if (activeElement.type === 'line' || activeElement.type === 'arrow') {
					// Transform the mouse position into the element's local coordinate system
					// by applying the inverse rotation.
					const center = getElementCenter(activeElement);
					const localPos = activeElement.rotation
						? rotatePoint(pos, center, -activeElement.rotation * (Math.PI / 180))
						: pos;
					
					// The user drags the handle, which should be a point ON the curve.
					// We'll call this point P_handle (localPos).
					// The actual Bezier control point (P1) needs to be calculated
					// such that the curve passes through P_handle at t=0.5.
					// The formula is: P1 = 2 * P_handle - 0.5 * P0 - 0.5 * P2
					const p0 = { x: activeElement.x, y: activeElement.y };
					const p2 = { x: activeElement.x2, y: activeElement.y2 };
					const cp1x = 2 * localPos.x - 0.5 * p0.x - 0.5 * p2.x;
					const cp1y = 2 * localPos.y - 0.5 * p0.y - 0.5 * p2.y;

					const curvedEl = { ...activeElement, cp1x, cp1y, curveHandleX: localPos.x, curveHandleY: localPos.y };
					setSelectedElements([curvedEl]);
				}
				return;
			} 
			// --- Rotating Logic ---
			else if (action === "rotating" && selectedElements.length > 0 && rotationCenterRef.current) {
				const center = rotationCenterRef.current;
				const startVector = { x: startPos.x - center.x, y: startPos.y - center.y };
				const startAngle = Math.atan2(startVector.y, startVector.x);
				
				const currentVector = { x: pos.x - center.x, y: pos.y - center.y };
				const currentAngle = Math.atan2(currentVector.y, currentVector.x);

				const angleDiff = currentAngle - startAngle;
				const newRotation = initialRotationRef.current + (angleDiff * 180 / Math.PI);

				const rotatedEl = { ...selectedElements[0], rotation: newRotation };
				setSelectedElements([rotatedEl]);
			} 
			// --- Resizing Logic ---
			else if (action === "resizing" && selectedElements.length > 0 && resizeHandle && startPos) {
				const activeElement = selectedElements[0]!;
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
		[action, getCanvasPos, getScreenPos, selectedTool, selectedElements, startPos, dragOffset, resizeHandle, elements, selectionRect, activeCanvasRef, setSelectedElements, setDrawingAngleInfo, isSpacePressed, isCtrlPressed, setViewTransform, viewTransform]
	);

	/**
	 * The main handler for pointer up events.
	 * This function finalizes the current interaction.
	 */
	const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
		activePointers.current.delete(e.pointerId);
		const canvas = activeCanvasRef.current;
		if (action === 'panning') {
			if (canvas) {
				canvas.style.cursor = (isSpacePressed || isCtrlPressed) ? 'grab' : 'default';
			}
			// A pan action always ends on pointer up.
			setAction('none');
			return;
		}

		if (action === "placing" && selectedTool === "text") {
			const newEl: TextElement = {
				id: generateId(),
				type: "text",
				x: startPos.x,
				y: startPos.y,
				text: "",
				fontSize: 24,
				fontFamily: "'virgil', sans-serif",
				width: 0, // Initialize width
				height: 0, // and height
			};
			setEditingElement(newEl);
			// We don't call updateElements yet, that will happen in handleLabelUpdate
		} else if (action === "multi-selecting" && selectionRect) {
			// Finalize multi-selection
			const selected = elements.filter((el) => isElementIntersectingRect(el, selectionRect));
			setSelectedElements(selected);
			setSelectionRect(null);
		} else if ((action === 'drawing' || action === 'resizing' || action === 'dragging' || action === 'rotating' || action === 'curving') && selectedElements.length > 0) {
			// Finalize any element transformation or creation.
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

		// Reset interaction state
		setAction("none");
		setDrawingAngleInfo(null);
		setResizeHandle(null);
		rotationCenterRef.current = null;

		if (action === "drawing") {
			// Switch back to selection tool after drawing a shape (but not for pencil).
			if (selectedTool !== "pencil") {
				setSelectedTool("selection");
			}
		} else if (action === "placing") {
			setSelectedTool("selection");
		}
	}, [action, selectedElements, updateElements, elements, selectionRect, setSelectedElements, setSelectedTool, setDrawingAngleInfo, setEditingElement, startPos, selectedTool, isSpacePressed, isCtrlPressed, activeCanvasRef]);

	return { selectionRect, handlePointerDown, handlePointerMove, handlePointerUp };
};
