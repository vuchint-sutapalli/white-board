import React, {
	useRef,
	useState,
	useEffect,
	useCallback,
	useLayoutEffect,
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
} from "./element";
import { LabelEditor } from "./LabelEditor";

const CanvasWhiteboard: React.FC = () => {
	const containerRef = useRef<HTMLDivElement>(null);
	const staticCanvasRef = useRef<HTMLCanvasElement>(null);
	const activeCanvasRef = useRef<HTMLCanvasElement>(null);
	const textAreaRef = useRef<HTMLTextAreaElement>(null);
	const elementCanvasMap = useRef<WeakMap<Element, HTMLCanvasElement>>(
		new WeakMap()
	);

	const [width, setWidth] = useState(0);
	const [height, setHeight] = useState(0);
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

	useLayoutEffect(() => {
		const updateCanvasSize = () => {
			const container = containerRef.current;
			if (container) {
				const newWidth = container.offsetWidth;
				const newHeight = container.offsetHeight;
				if (newWidth !== width || newHeight !== height) {
					setWidth(newWidth);
					setHeight(newHeight);
					// on resize, we need to invalidate the cache
					elementCanvasMap.current = new WeakMap();
				}
			}
		};

		updateCanvasSize(); // Initial size

		window.addEventListener("resize", updateCanvasSize);
		return () => window.removeEventListener("resize", updateCanvasSize);
	}, [width, height]); // Rerun on size change to handle potential external changes

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

	useKeyboard({ onDelete: handleDeleteSelected });

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
	});

	// Drawing Hook
	useDrawing({
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

		const updatedElement =
			editingElement.type === "text"
				? { ...editingElement, text: labelText }
				: { ...editingElement, label: labelText };

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
		elementCanvasMap.current = new WeakMap();
	};

	return (
		<div
			ref={containerRef}
			className="app-container font-virgil"
			style={{ width: "100%", height: "100%" }}
		>
			<div className="toolbar absolute w-100vw z-50">
				<button
					className={`toolbar-button ${
						selectedTool === "selection" ? "active" : ""
					}`}
					onClick={() => setSelectedTool("selection")}
				>
					Select
				</button>
				<button
					className={`toolbar-button ${
						selectedTool === "rectangle" ? "active" : ""
					}`}
					onClick={() => setSelectedTool("rectangle")}
				>
					Rectangle
				</button>
				<button
					className={`toolbar-button ${
						selectedTool === "diamond" ? "active" : ""
					}`}
					onClick={() => setSelectedTool("diamond")}
				>
					Diamond
				</button>
				<button
					className={`toolbar-button ${
						selectedTool === "circle" ? "active" : ""
					}`}
					onClick={() => setSelectedTool("circle")}
				>
					Circle
				</button>
				<button
					className={`toolbar-button ${
						selectedTool === "arrow" ? "active" : ""
					}`}
					onClick={() => setSelectedTool("arrow")}
				>
					Arrow
				</button>
				<button
					className={`toolbar-button ${
						selectedTool === "pencil" ? "active" : ""
					}`}
					onClick={() => setSelectedTool("pencil")}
				>
					Pencil
				</button>
				<button
					className={`toolbar-button ${
						selectedTool === "text" ? "active" : ""
					}`}
					onClick={() => setSelectedTool("text")}
				>
					Text
				</button>
				<button
					className={`toolbar-button ${
						selectedTool === "line" ? "active" : ""
					}`}
					onClick={() => setSelectedTool("line")}
				>
					Line
				</button>
				<button
					className="toolbar-button"
					onClick={handleDeleteSelected}
					disabled={selectedElements.length === 0}
				>
					Delete Selected
				</button>
				<button className="toolbar-button" onClick={handleClear}>
					Clear
				</button>
			</div>

			{editingElement && editorPosition && (
				<LabelEditor
					ref={textAreaRef}
					value={labelText}
					onChange={handleLabelChange}
					onBlur={handleLabelUpdate}
					onKeyDown={handleLabelKeyDown}
					style={{
						top: editorPosition.y,
						left: editorPosition.x,
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
					top: 0,
					border: "1px solid #ccc",
				}}
			/>
			<canvas
				ref={activeCanvasRef}
				width={width}
				height={height}
				style={{ position: "absolute", left: 0, top: 0, zIndex: 1 }}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				onDoubleClick={handleDoubleClick}
			/>
		</div>
	);
};

export default CanvasWhiteboard;
