import React, { forwardRef, useState } from "react";
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
		// State to manage the confirmation step for clearing the canvas.
		const [isConfirmingClear, setIsConfirmingClear] = useState(false);

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
				{isConfirmingClear ? (
					<div className="flex items-center gap-2 p-1 border border-gray-300 rounded-md bg-gray-50">
						<span className="text-sm text-gray-600 mr-1 ml-2">
							Are you sure?
						</span>
						<button
							className="toolbar-button"
							onClick={() => setIsConfirmingClear(false)}
						>
							Cancel
						</button>
						<button
							className="toolbar-button toolbar-button-danger"
							onClick={() => {
								handleClear();
								setIsConfirmingClear(false);
							}}
						>
							Confirm
						</button>
					</div>
				) : (
					<button
						className="toolbar-button"
						onClick={() => setIsConfirmingClear(true)}
					>
						Clear
					</button>
				)}
			</div>
		);
	}
);
