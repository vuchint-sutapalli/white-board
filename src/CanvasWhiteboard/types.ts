export interface BaseElement {
	id: string;
	x: number;
	y: number;
	label?: string;
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

export type Element =
	| RectangleElement | LineElement | CircleElement | ArrowElement | DiamondElement;

export type ElementType = Element["type"] | "selection";

export type HandleType =
	| "top-left"
	| "top-right"
	| "bottom-left"
	| "bottom-right"
	| "start"
	| "end"
	| "radius";

export type Action = "none" | "drawing" | "dragging" | "resizing" | "multi-selecting";

export interface Point {
	x: number;
	y: number;
}
