import React, {
	useRef,
	useState,
	useLayoutEffect,
	useEffect,
	useCallback,
} from "react";
import type { Element, ElementType } from "./types";
import { STORAGE_KEY } from "./constants";
import { useDrawing } from "./useDrawing";
import { useInteractions } from "./useInteractions";
import { useKeyboard } from "./useKeyboard";
import {
	getElementAtPosition,
	getElementCenter,
	roundElementProperties,
	resizeElement,
} from "./element";
import { LabelEditor } from "./LabelEditor";
import { Toolbar } from "./Toolbar";

// Defines the virtual canvas dimensions. All element coordinates are relative to this size.
// This allows the canvas to be responsive while maintaining a consistent coordinate system.
const VIRTUAL_WIDTH = 1280;
const VIRTUAL_HEIGHT = 720;

const CanvasWhiteboard: React.FC = () => {
	// Refs for DOM elements
	const containerRef = useRef<HTMLDivElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const staticCanvasRef = useRef<HTMLCanvasElement>(null); // Bottom canvas for static elements
	const activeCanvasRef = useRef<HTMLCanvasElement>(null); // Top canvas for active/interactive elements
	const textAreaRef = useRef<HTMLTextAreaElement>(null); // Text area for editing labels/text

	// State for canvas dimensions and layout
	const [width, setWidth] = useState(0);
	const [height, setHeight] = useState(0);
	const [toolbarHeight, setToolbarHeight] = useState(0);

	// Viewport state for panning and zooming
	const [viewTransform, setViewTransform] = useState({
		scale: 1, // Zoom level
		offsetX: 0, // Horizontal pan
		offsetY: 0, // Vertical pan
	});

	// Core application state
	const [elements, setElements] = useState<Element[]>(() => {
		// Load elements from localStorage on initial render
		try {
			const saved = localStorage.getItem(STORAGE_KEY);
			return saved ? JSON.parse(saved) : [];
		} catch (error) {
			console.error("Failed to parse elements from localStorage", error);
			return [];
		}
	});
	const [selectedTool, setSelectedTool] = useState<ElementType>("selection");
	const [selectedElements, setSelectedElements] = useState<Element[]>([]);
	const [editingElement, setEditingElement] = useState<Element | null>(null);

	// State for the label/text editor
	const [labelText, setLabelText] = useState("");
	const [editorPosition, setEditorPosition] = useState<{
		x: number;
		y: number;
	} | null>(null);

	// State for displaying angle information during rotation/drawing
	const [drawingAngleInfo, setDrawingAngleInfo] = useState<{
		angle: number;
		x: number;
		y: number;
	} | null>(null);

	// State for keyboard modifiers (for panning)
	const [isSpacePressed, setIsSpacePressed] = useState(false);
	const [isCtrlPressed, setIsCtrlPressed] = useState(false);

	// Effect to handle responsive canvas resizing
	useLayoutEffect(() => {
		const container = containerRef.current;
		const toolbar = toolbarRef.current;
		if (!container || !toolbar) return;

		// Use ResizeObserver to efficiently detect size changes of the container and toolbar
		const updateSizes = () => {
			const newToolbarHeight = toolbar.offsetHeight;
			if (newToolbarHeight !== toolbarHeight) {
				setToolbarHeight(newToolbarHeight);
			}

			// Calculate canvas size based on container and toolbar height
			const newHeight = container.offsetHeight - newToolbarHeight;
			const newWidth = container.offsetWidth;
			if (newWidth !== width || newHeight !== height) {
				setWidth(newWidth);
				setHeight(newHeight);

				// When size changes, recalculate the view transform to fit the virtual canvas
				// within the new dimensions, centered.
				if (newWidth > 0 && newHeight > 0) {
					const scale = Math.min(
						newWidth / VIRTUAL_WIDTH,
						newHeight / VIRTUAL_HEIGHT
					);
					const offsetX = (newWidth - VIRTUAL_WIDTH * scale) / 2;
					const offsetY = (newHeight - VIRTUAL_HEIGHT * scale) / 2;
					setViewTransform({ scale, offsetX, offsetY });
				}
			}
		};

		const observer = new ResizeObserver(updateSizes);
		observer.observe(container);
		observer.observe(toolbar);

		updateSizes(); // Initial call
		return () => observer.disconnect();
	}, [width, height, toolbarHeight]); // Dependencies for the effect

	// Effect to save elements to localStorage whenever they change
	useEffect(() => {
		// Round all numeric properties to 2 decimal places before saving.
		// This keeps the JSON clean and small without sacrificing precision.
		const precision = 2;
		const roundedElements = elements.map((el) =>
			roundElementProperties(el, precision)
		);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(roundedElements));
	}, [elements]);

	// Callback to delete selected elements
	const handleDeleteSelected = useCallback(() => {
		if (selectedElements.length === 0) return;
		const selectedIds = new Set(selectedElements.map((el) => el.id));
		setElements((prev) => prev.filter((el) => !selectedIds.has(el.id)));
		setSelectedElements([]);
	}, [selectedElements]);

	// Hook to handle keyboard shortcuts (delete, pan keys)
	useKeyboard({
		onDelete: handleDeleteSelected,
		setIsSpacePressed,
		setIsCtrlPressed,
	});

	// Effect to manage the label editor's state and position
	useEffect(() => {
		if (editingElement) {
			const center = getElementCenter(editingElement);
			setEditorPosition({ x: center.x, y: center.y });
			if (editingElement.type === "text") {
				setLabelText(editingElement.text);
			} else {
				setLabelText(editingElement.label || "");
			}
			// Focus after a short delay to allow the textarea to be rendered and positioned
			setTimeout(() => textAreaRef.current?.focus(), 0);
		}
	}, [editingElement]);

	/**
	 * A robust way to update elements in the state.
	 * It handles both creating new elements and updating existing ones.
	 * @param updatedElements An array of elements that have been created or modified.
	 */
	const updateElements = useCallback((updatedElements: Element[]) => {
		const updatedElementsMap = new Map(
			updatedElements.map((el) => [el.id, el])
		);

		// This handles both updates and creations in a single pass
		setElements((prevElements) => {
			const newElements = prevElements.map(
				(el) => updatedElementsMap.get(el.id) || el
			);
			const newIds = new Set(newElements.map((el) => el.id));
			// Add any new elements that weren't in the previous state
			updatedElements.forEach((updatedEl) => {
				if (!newIds.has(updatedEl.id)) {
					newElements.push(updatedEl);
				}
			});
			return newElements;
		});
	}, []);

	// Hook for handling all user interactions (drawing, selecting, moving, etc.)
	const {
		selectionRect,
		handlePointerDown,
		handlePointerMove,
		handlePointerUp,
	} = useInteractions({
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
	});

	// Hook for handling the rendering of both static and active canvases
	useDrawing({
		staticCanvasRef,
		activeCanvasRef,
		elements,
		selectedElements,
		editingElement,
		selectionRect,
		drawingAngleInfo,
		width,
		height,
		virtualWidth: VIRTUAL_WIDTH,
		virtualHeight: VIRTUAL_HEIGHT,
		viewTransform,
	});

	// Handler for double-click events to start editing an element's label/text
	const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		// This is a native event, not a React PointerEvent
		const canvas = activeCanvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		// We need to calculate the world coordinates from the screen click
		const screenPos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
		const worldPos = {
			x: (screenPos.x - viewTransform.offsetX) / viewTransform.scale,
			y: (screenPos.y - viewTransform.offsetY) / viewTransform.scale,
		};

		const element = getElementAtPosition(elements, worldPos);
		if (element) {
			setEditingElement(element);
			// Select only the double-clicked element
			setSelectedElements([element]);
		}
	};

	// Handler for changes in the label editor textarea
	const handleLabelChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setLabelText(e.target.value);
	};

	// Handler for when the label editor loses focus (onBlur)
	const handleLabelUpdate = () => {
		if (!editingElement) return;

		let updatedElement = { ...editingElement, label: labelText };

		if (editingElement.type === "text") {
			const textElement = { ...editingElement, text: labelText };
			// Update dimensions when text changes
			resizeElement(textElement, "bottom-right", 0, 0);
			updatedElement = textElement;
		}

		// If a new text element is created but the text is empty, cancel the creation.
		if (
			updatedElement.type === "text" &&
			updatedElement.text === "" &&
			!elements.some((el) => el.id === updatedElement.id)
		) {
			setEditingElement(null);
			setEditorPosition(null);
			setLabelText("");
			return;
		}

		updateElements([updatedElement]);
		// Also update the element within the `selectedElements` array to ensure consistency
		setSelectedElements((prev) =>
			prev.map((el) => (el.id === updatedElement.id ? updatedElement : el))
		);
		setEditingElement(null);
		setEditorPosition(null);
		setLabelText("");
	};

	// Handler for keyboard events within the label editor
	const handleLabelKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault(); // Prevent new line
			handleLabelUpdate();
		}
		if (e.key === "Escape") {
			// Cancel editing
			setEditingElement(null);
			setEditorPosition(null);
			setLabelText("");
		}
	};

	// Handler for the "Clear" button in the toolbar
	const handleClear = () => {
		setElements([]);
		setSelectedElements([]);
	};

	return (
		<div
			ref={containerRef}
			className="app-container font-virgil relative"
			style={{ width: "100%", height: "100%" }}
		>
			<Toolbar
				ref={toolbarRef}
				selectedTool={selectedTool}
				setSelectedTool={setSelectedTool}
				handleDeleteSelected={handleDeleteSelected}
				selectedElements={selectedElements}
				handleClear={handleClear}
			/>

			{/* Render the label editor when an element is being edited */}
			{editingElement && editorPosition && (
				<LabelEditor
					ref={textAreaRef}
					value={labelText}
					onChange={handleLabelChange}
					onBlur={handleLabelUpdate}
					onKeyDown={handleLabelKeyDown}
					style={{
						// Position the editor in screen space based on the element's world coordinates
						top:
							editorPosition.y * viewTransform.scale +
							viewTransform.offsetY +
							toolbarHeight,
						left:
							editorPosition.x * viewTransform.scale + viewTransform.offsetX,
					}}
				/>
			)}
			{/* The static canvas (bottom layer) for drawing non-interactive elements */}
			<canvas
				ref={staticCanvasRef}
				width={width}
				height={height}
				style={{
					position: "absolute",
					left: 0,
					top: `${toolbarHeight}px`,
					width: `${width}px`,
					height: `${height}px`,
					border: "1px solid #ccc",
					touchAction: "none", // Disable default touch actions like scroll/zoom
				}}
			/>
			{/* The active canvas (top layer) for drawing interactive elements and handling pointer events */}
			<canvas
				ref={activeCanvasRef}
				width={width}
				height={height}
				style={{
					position: "absolute",
					left: 0,
					top: `${toolbarHeight}px`,
					width: `${width}px`,
					height: `${height}px`,
					zIndex: 1,
					touchAction: "none", // Disable default touch actions like scroll/zoom
				}}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={(e) => handlePointerUp(e)}
				onDoubleClick={handleDoubleClick}
			/>
		</div>
	);
};

export default CanvasWhiteboard;
