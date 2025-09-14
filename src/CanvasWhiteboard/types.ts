export interface BaseElement {
	id: string;
	x: number;
	y: number;
	label?: string;
	rotation?: number;
	scaleX?: number;
	scaleY?: number;
}

export interface RectangleElement extends BaseElement {
	type: "rectangle";
	width: number;
	height: number;
}

export interface LineElement extends BaseElement {
	type: "line";
	x2: number;
	y2: number;
	points?: number[];
}

export interface CircleElement extends BaseElement {
	type: "circle";
	radius: number;
}

export interface ArrowElement extends LineElement {
	type: "arrow";
}

export interface DiamondElement extends RectangleElement {
	type: "diamond";
}

// Define the structure for a pencil element
export interface PencilElement extends BaseElement {
	type: "pencil";
	points: { x: number; y: number }[];
}

// export interface TextElement extends BaseElement {
// 	type: "text";
// 	text: string;
// 	fontSize: number;
// 	fontFamily: string;
// }
export interface TextElement extends RectangleElement {
	type: "text";
	text: string;
	fontSize: number;
	fontFamily?: string;
}

export type Element =
	| RectangleElement | LineElement | CircleElement | ArrowElement | DiamondElement | TextElement | PencilElement;

export type ElementType = Element["type"] | "selection";

export type HandleType =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "start"
	| "end"
	| "radius"
	| "pencil"
	| "copy"
	| "rotation";

export type Action = "none" | "drawing" | "dragging" | "resizing" | "multi-selecting" | "placing";

export interface Point {
	x: number;
	y: number;
}
