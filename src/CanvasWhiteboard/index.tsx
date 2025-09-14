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

const VIRTUAL_WIDTH = 1280;
const VIRTUAL_HEIGHT = 720;

const CanvasWhiteboard: React.FC = () => {
	const containerRef = useRef<HTMLDivElement>(null);
	const toolbarRef = useRef<HTMLDivElement>(null);
	const staticCanvasRef = useRef<HTMLCanvasElement>(null);
	const activeCanvasRef = useRef<HTMLCanvasElement>(null);
	const textAreaRef = useRef<HTMLTextAreaElement>(null);

	const [width, setWidth] = useState(0);
	const [height, setHeight] = useState(0);
	const [toolbarHeight, setToolbarHeight] = useState(0);
	const [viewTransform, setViewTransform] = useState({
		scale: 1,
		offsetX: 0,
		offsetY: 0,
	});
	const [elements, setElements] = useState<Element[]>(() => {
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
	const [labelText, setLabelText] = useState("");
	const [editorPosition, setEditorPosition] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [drawingAngleInfo, setDrawingAngleInfo] = useState<{
		angle: number;
		x: number;
		y: number;
	} | null>(null);
	const [isSpacePressed, setIsSpacePressed] = useState(false);
	const [isCtrlPressed, setIsCtrlPressed] = useState(false);

	useLayoutEffect(() => {
		const container = containerRef.current;
		const toolbar = toolbarRef.current;
		if (!container || !toolbar) return;

		const updateSizes = () => {
			const newToolbarHeight = toolbar.offsetHeight;
			if (newToolbarHeight !== toolbarHeight) {
				setToolbarHeight(newToolbarHeight);
			}

			const newHeight = container.offsetHeight - newToolbarHeight;
			const newWidth = container.offsetWidth;
			if (newWidth !== width || newHeight !== height) {
				setWidth(newWidth);
				setHeight(newHeight);

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

	// Load/Save effects
	useEffect(() => {
		// Round all numeric properties to 2 decimal places before saving.
		// This keeps the JSON clean and small without sacrificing precision.
		const precision = 2;
		const roundedElements = elements.map((el) =>
			roundElementProperties(el, precision)
		);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(roundedElements));
	}, [elements]);

	const handleDeleteSelected = useCallback(() => {
		if (selectedElements.length === 0) return;
		const selectedIds = new Set(selectedElements.map((el) => el.id));
		setElements((prev) => prev.filter((el) => !selectedIds.has(el.id)));
		setSelectedElements([]);
	}, [selectedElements]);

	useKeyboard({
		onDelete: handleDeleteSelected,
		setIsSpacePressed,
		setIsCtrlPressed,
	});

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

	const updateElements = useCallback((updatedElements: Element[]) => {
		const updatedElementsMap = new Map(
			updatedElements.map((el) => [el.id, el])
		);

		// This handles both updates and creations
		setElements((prevElements) => {
			const newElements = prevElements.map(
				(el) => updatedElementsMap.get(el.id) || el
			);
			const newIds = new Set(newElements.map((el) => el.id));
			updatedElements.forEach((updatedEl) => {
				if (!newIds.has(updatedEl.id)) {
					newElements.push(updatedEl);
				}
			});
			return newElements;
		});
	}, []);

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

	// Drawing Hook
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

	const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
		// This is a native event, not a React PointerEvent
		const canvas = activeCanvasRef.current;
		if (!canvas) return;
		const rect = canvas.getBoundingClientRect();
		const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };

		const element = getElementAtPosition(elements, pos);
		if (element) {
			setEditingElement(element);
			// deselect other elements
			setSelectedElements([element]);
		}
	};

	const handleLabelChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		setLabelText(e.target.value);
	};

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
		setSelectedElements((prev) =>
			prev.map((el) => (el.id === updatedElement.id ? updatedElement : el))
		);
		setEditingElement(null);
		setEditorPosition(null);
		setLabelText("");
	};

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

			{editingElement && editorPosition && (
				<LabelEditor
					ref={textAreaRef}
					value={labelText}
					onChange={handleLabelChange}
					onBlur={handleLabelUpdate}
					onKeyDown={handleLabelKeyDown}
					style={{
						top:
							editorPosition.y * viewTransform.scale +
							viewTransform.offsetY +
							toolbarHeight,
						left:
							editorPosition.x * viewTransform.scale + viewTransform.offsetX,
					}}
				/>
			)}
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
					touchAction: "none",
				}}
			/>
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
					touchAction: "none",
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
