import React, { useEffect, useState, useRef } from "react";
import { Stage, Layer, Rect, Line, Text, Transformer } from "react-konva";

type ToolType = "selection" | "rectangle" | "line";

interface Element {
	id: string;
	type: "rectangle" | "line";
	x: number;
	y: number;
	width?: number;
	height?: number;
	x2?: number;
	y2?: number;
	label?: string;
}

const STORAGE_KEY = "level0_hybrid_whiteboard";

const KonvaTestBoard: React.FC = () => {
	const [elements, setElements] = useState<Element[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [selectedTool, setSelectedTool] = useState<ToolType>("selection");
	const [drawingElement, setDrawingElement] = useState<Element | null>(null);

	const transformerRef = useRef<any>(null);

	// Load from localStorage on mount
	useEffect(() => {
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved) setElements(JSON.parse(saved));
	}, []);

	// Update Transformer when selection changes
	useEffect(() => {
		const transformer = transformerRef.current;
		if (!transformer) return;
		if (selectedId) {
			const stage = transformer.getStage();
			const selectedNode = stage?.findOne(`#${selectedId}`);
			transformer.nodes(selectedNode ? [selectedNode] : []);
			transformer.getLayer()?.batchDraw();
		} else {
			transformer.nodes([]);
			transformer.getLayer()?.batchDraw();
		}
	}, [selectedId]);

	// Save helper
	const saveElements = (newElements: Element[]) => {
		setElements(newElements);
		localStorage.setItem(STORAGE_KEY, JSON.stringify(newElements));
	};

	// Stage handlers
	const handleStageMouseDown = (e: any) => {
		if (e.target !== e.target.getStage()) return;

		const pos = e.target.getStage().getPointerPosition();
		if (!pos) return;

		if (selectedTool === "rectangle") {
			const newEl: Element = {
				id: Date.now().toString(),
				type: "rectangle",
				x: pos.x,
				y: pos.y,
				width: 0,
				height: 0,
			};
			setDrawingElement(newEl);
		} else if (selectedTool === "line") {
			const newEl: Element = {
				id: Date.now().toString(),
				type: "line",
				x: pos.x,
				y: pos.y,
				x2: pos.x,
				y2: pos.y,
			};
			setDrawingElement(newEl);
		} else {
			setSelectedId(null); // deselect if clicked empty
		}
	};

	const handleStageMouseMove = (e: any) => {
		if (!drawingElement) return;
		const pos = e.target.getStage().getPointerPosition();
		if (!pos) return;

		if (drawingElement.type === "rectangle") {
			setDrawingElement({
				...drawingElement,
				width: pos.x - drawingElement.x,
				height: pos.y - drawingElement.y,
			});
		} else if (drawingElement.type === "line") {
			setDrawingElement({
				...drawingElement,
				x2: pos.x,
				y2: pos.y,
			});
		}
	};

	const handleStageMouseUp = () => {
		if (drawingElement) {
			const updated = [...elements, drawingElement];
			saveElements(updated);
			setDrawingElement(null);
			setSelectedTool("selection"); // auto-switch after drawing
		}
	};

	// Update element after drag/resize
	const handleElementChange = (id: string, attrs: Partial<Element>) => {
		const updated = elements.map((el) =>
			el.id === id ? { ...el, ...attrs } : el
		);
		saveElements(updated);
	};

	return (
		<div>
			<div style={{ marginBottom: 10 }}>
				<span style={{ marginRight: 10 }}>
					Current Tool: <strong>{selectedTool}</strong>
				</span>
				<button onClick={() => setSelectedTool("selection")}>Select</button>
				<button onClick={() => setSelectedTool("rectangle")}>Rectangle</button>
				<button onClick={() => setSelectedTool("line")}>Line</button>
				<button
					onClick={() => {
						saveElements([]);
						setSelectedId(null);
					}}
				>
					Clear
				</button>
			</div>

			<Stage
				width={1000}
				height={800}
				style={{ border: "1px solid black" }}
				onMouseDown={handleStageMouseDown}
				onMouseMove={handleStageMouseMove}
				onMouseUp={handleStageMouseUp}
			>
				<Layer>
					{elements.map((el) => {
						if (
							el.type === "rectangle" &&
							el.width &&
							el.height !== undefined
						) {
							return (
								<React.Fragment key={el.id}>
									<Rect
										id={el.id}
										x={el.x}
										y={el.y}
										width={el.width}
										height={el.height}
										stroke="black"
										draggable
										onClick={() => setSelectedId(el.id)}
										onDragEnd={(e) =>
											handleElementChange(el.id, {
												x: e.target.x(),
												y: e.target.y(),
											})
										}
										onTransformEnd={(e) => {
											const node = e.target;
											handleElementChange(el.id, {
												x: node.x(),
												y: node.y(),
												width: node.width() * node.scaleX(),
												height: node.height() * node.scaleY(),
											});
											node.scaleX(1);
											node.scaleY(1);
										}}
									/>
									{el.label && (
										<Text
											text={el.label}
											x={el.x + 5}
											y={el.y - 20}
											fontSize={16}
											fill="black"
										/>
									)}
								</React.Fragment>
							);
						} else if (
							el.type === "line" &&
							el.x2 !== undefined &&
							el.y2 !== undefined
						) {
							return (
								<React.Fragment key={el.id}>
									<Line
										id={el.id}
										points={[el.x, el.y, el.x2, el.y2]}
										stroke="black"
										strokeWidth={2}
										draggable
										onClick={() => setSelectedId(el.id)}
										onDragEnd={(e) =>
											handleElementChange(el.id, {
												x: e.target.x(),
												y: e.target.y(),
											})
										}
									/>
									{el.label && (
										<Text
											text={el.label}
											x={(el.x + el.x2) / 2}
											y={(el.y + el.y2) / 2 - 20}
											fontSize={16}
											fill="black"
										/>
									)}
								</React.Fragment>
							);
						}
						return null;
					})}

					{/* Preview while drawing */}
					{drawingElement && drawingElement.type === "rectangle" && (
						<Rect
							x={drawingElement.x}
							y={drawingElement.y}
							width={drawingElement.width || 0}
							height={drawingElement.height || 0}
							stroke="red"
							dash={[4, 4]}
						/>
					)}
					{drawingElement && drawingElement.type === "line" && (
						<Line
							points={[
								drawingElement.x,
								drawingElement.y,
								drawingElement.x2 || drawingElement.x,
								drawingElement.y2 || drawingElement.y,
							]}
							stroke="red"
							dash={[4, 4]}
						/>
					)}

					<Transformer ref={transformerRef} />
				</Layer>
			</Stage>
		</div>
	);
};

export default KonvaTestBoard;
