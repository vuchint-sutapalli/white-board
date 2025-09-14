import React, { forwardRef, useLayoutEffect, useRef } from "react";

interface LabelEditorProps {
	value: string;
	onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
	onBlur: () => void;
	onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
	style: React.CSSProperties;
}

export const LabelEditor = forwardRef<HTMLTextAreaElement, LabelEditorProps>(
	({ value, onChange, onBlur, onKeyDown, style }, ref) => {
		// Auto-resize the textarea based on content
		useLayoutEffect(() => {
			const textarea = (ref as React.RefObject<HTMLTextAreaElement>)?.current;
			if (textarea) {
				// Reset height to shrink if needed
				textarea.style.height = "auto";
				// Set height to scroll height
				textarea.style.height = `${textarea.scrollHeight}px`;
			}
		}, [value, ref]);

		const containerStyle: React.CSSProperties = {
			position: "absolute",
			...style,
			transform: "translate(-50%, -100%) translateY(-10px)", // Center above the point, with a 10px gap
			padding: "8px",
			backgroundColor: "#333",
			borderRadius: "4px",
			boxShadow: "0 6px 16px rgba(0, 0, 0, 0.3)",
			zIndex: 10,
			display: "flex",
			flexDirection: "column",
			alignItems: "center",
		};

		const textareaStyle: React.CSSProperties = {
			border: "1px solid #555",
			backgroundColor: "#444",
			color: "white",
			padding: "4px 8px",
			borderRadius: "3px",
			resize: "none",
			textAlign: "center",
			minWidth: "80px",
			outline: "none",
			fontFamily: "'vrgil', sans-serif",
			fontSize: "16px",
			overflow: "hidden", // Hide scrollbar
		};

		const arrowStyle: React.CSSProperties = {
			position: "absolute",
			bottom: "-8px",
			left: "50%",
			transform: "translateX(-50%)",
			width: 0,
			height: 0,
			borderLeft: "8px solid transparent",
			borderRight: "8px solid transparent",
			borderTop: "8px solid #333",
			filter: "drop-shadow(0 4px 4px rgba(0, 0, 0, 0.25))",
		};

		return (
			<div style={containerStyle}>
				<textarea
					ref={ref}
					value={value}
					onChange={onChange}
					onBlur={onBlur}
					onKeyDown={onKeyDown}
					style={textareaStyle}
					rows={1}
				/>
				<div style={arrowStyle} />
			</div>
		);
	}
);
