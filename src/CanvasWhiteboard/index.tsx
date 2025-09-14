import React, { useRef, useState, useEffect, useCallback } from "react";
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
	const staticCanvasRef = useRef<HTMLCanvasElement>(null);
	const activeCanvasRef = useRef<HTMLCanvasElement>(null);
	const textAreaRef = useRef<HTMLTextAreaElement>(null);
	const elementCanvasMap = useRef<WeakMap<Element, HTMLCanvasElement>>(
		new WeakMap()
	);

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
		<div>
			<div style={{ marginBottom: 10 }}>
				<span style={{ marginRight: 10 }}>
					Current Tool: <strong>{selectedTool}</strong>
				</span>
				<button onClick={() => setSelectedTool("selection")}>Select</button>
				<button onClick={() => setSelectedTool("rectangle")}>Rectangle</button>
				<button onClick={() => setSelectedTool("diamond")}>Diamond</button>
				<button onClick={() => setSelectedTool("circle")}>Circle</button>
				<button onClick={() => setSelectedTool("arrow")}>Arrow</button>
				<button onClick={() => setSelectedTool("pencil")}>Pencil</button>
				<button onClick={() => setSelectedTool("text")}>Text</button>
				<button onClick={() => setSelectedTool("line")}>Line</button>
				<button
					onClick={handleDeleteSelected}
					disabled={selectedElements.length === 0}
				>
					Delete Selected
				</button>
				<button onClick={handleClear}>Clear</button>
			</div>

			<div style={{ position: "relative" }}>
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
					width={800}
					height={600}
					style={{
						border: "1px solid black",
						position: "absolute",
						left: 0,
						top: 0,
					}}
				/>
				<canvas
					ref={activeCanvasRef}
					width={800}
					height={600}
					style={{ position: "absolute", left: 0, top: 0 }}
					onPointerDown={handlePointerDown}
					onPointerMove={handlePointerMove}
					onPointerUp={handlePointerUp}
					onDoubleClick={handleDoubleClick}
				/>
			</div>
		</div>
	);
};

export default CanvasWhiteboard;
