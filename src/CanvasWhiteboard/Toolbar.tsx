import React, { forwardRef } from "react";
import type { Element, ElementType } from "./types";

interface ToolbarProps {
	selectedTool: ElementType;
	setSelectedTool: (tool: ElementType) => void;
	handleDeleteSelected: () => void;
	selectedElements: Element[];
	handleClear: () => void;
}

const tools: { name: ElementType; label: string }[] = [
	{ name: "selection", label: "Select" },
	{ name: "rectangle", label: "Rectangle" },
	{ name: "diamond", label: "Diamond" },
	{ name: "circle", label: "Circle" },
	{ name: "arrow", label: "Arrow" },
	{ name: "pencil", label: "Pencil" },
	{ name: "text", label: "Text" },
	{ name: "line", label: "Line" },
];

export const Toolbar = forwardRef<HTMLDivElement, ToolbarProps>(
	(
		{
			selectedTool,
			setSelectedTool,
			handleDeleteSelected,
			selectedElements,
			handleClear,
		},
		ref
	) => {
		return (
			<div
				ref={ref}
				className="toolbar absolute w-full z-50 flex flex-wrap justify-center p-2 gap-2 bg-white shadow-md"
			>
				{tools.map(({ name, label }) => (
					<button
						key={name}
						className={`toolbar-button ${
							selectedTool === name ? "active" : ""
						}`}
						onClick={() => setSelectedTool(name)}
					>
						{label}
					</button>
				))}
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
		);
	}
);
