import type { Point, RectangleElement } from '../types';

/**
 * Rotates a point around an origin.
 * @param point The point to rotate.
 * @param origin The origin of rotation.
 * @param angleRad The angle in radians.
 * @returns The new rotated point.
 */
export const rotatePoint = (point: Point, origin: Point, angleRad: number): Point => {
	const cos = Math.cos(angleRad);
	const sin = Math.sin(angleRad);
	const translatedX = point.x - origin.x;
	const translatedY = point.y - origin.y;
	const rotatedX = translatedX * cos - translatedY * sin;
	const rotatedY = translatedX * sin + translatedY * cos;
	return {
		x: rotatedX + origin.x,
		y: rotatedY + origin.y,
	};
};

/**
 * Normalizes a rectangle to have non-negative width and height.
 * @param rect The rectangle to normalize.
 * @returns A new rectangle with positive width and height.
 */
export const normalizeRect = (rect: RectangleElement): RectangleElement => {
	const x = rect.width < 0 ? rect.x + rect.width : rect.x;
	const y = rect.height < 0 ? rect.y + rect.height : rect.y;
	const width = Math.abs(rect.width);
	const height = Math.abs(rect.height);
	return { ...rect, x, y, width, height };
};

/**
 * Calculates the shortest distance from a point to a line segment.
 * @param p The point.
 * @param a The start point of the line segment.
 * @param b The end point of the line segment.
 * @returns The distance.
 */
export const distanceToLineSegment = (p: Point, a: Point, b: Point): number => {
	const l2 = (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
	if (l2 === 0) {
		return Math.hypot(p.x - a.x, p.y - a.y);
	}
	let t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / l2;
	t = Math.max(0, Math.min(1, t));
	const closestPoint = {
		x: a.x + t * (b.x - a.x),
		y: a.y + t * (b.y - a.y),
	};
	return Math.hypot(p.x - closestPoint.x, p.y - closestPoint.y);
};

/**
 * Calculates the perpendicular distance from a point to a line.
 * @param point The point.
 * @param lineStart The start point of the line.
 * @param lineEnd The end point of the line.
 */
const perpendicularDistanceToLine = (point: Point, lineStart: Point, lineEnd: Point): number => {
    const { x: x0, y: y0 } = point;
    const { x: x1, y: y1 } = lineStart;
    const { x: x2, y: y2 } = lineEnd;

    const dx = x2 - x1;
    const dy = y2 - y1;

    if (dx === 0 && dy === 0) {
        return Math.hypot(x0 - x1, y0 - y1);
    }

    return Math.abs(dy * x0 - dx * y0 + x2 * y1 - y2 * x1) / Math.sqrt(dx * dx + dy * dy);
};

/**
 * The Ramer-Douglas-Peucker algorithm for path simplification.
 * @param points The array of points to simplify.
 * @param epsilon The tolerance. All points within this distance from the line will be removed.
 */
const rdp = (points: Point[], epsilon: number): Point[] => {
    if (points.length < 3) {
        return points;
    }

    const firstPoint = points[0];
    const lastPoint = points[points.length - 1];
    let index = -1;
    let maxDist = 0;

    for (let i = 1; i < points.length - 1; i++) {
        const dist = perpendicularDistanceToLine(points[i], firstPoint, lastPoint);
        if (dist > maxDist) {
            maxDist = dist;
            index = i;
        }
    }

    if (maxDist > epsilon) {
        const left = rdp(points.slice(0, index + 1), epsilon);
        const right = rdp(points.slice(index), epsilon);
        // Combine the two simplified paths, removing the duplicate middle point
        return left.slice(0, left.length - 1).concat(right);
    } else {
        return [firstPoint, lastPoint];
    }
};

export const simplifyPath = (points: Point[], epsilon = 0.5): Point[] => {
    return rdp(points, epsilon);
};

export const getQuadraticCurveBounds = (p0: Point, p1: Point, p2: Point) => {
    let minX = Math.min(p0.x, p2.x);
    let minY = Math.min(p0.y, p2.y);
    let maxX = Math.max(p0.x, p2.x);
    let maxY = Math.max(p0.y, p2.y);

    const tx = (p0.x - p1.x) / (p0.x - 2 * p1.x + p2.x);
    if (tx > 0 && tx < 1) {
        const x = (1 - tx) * (1 - tx) * p0.x + 2 * (1 - tx) * tx * p1.x + tx * tx * p2.x;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
    }

    const ty = (p0.y - p1.y) / (p0.y - 2 * p1.y + p2.y);
    if (ty > 0 && ty < 1) {
        const y = (1 - ty) * (1 - ty) * p0.y + 2 * (1 - ty) * ty * p1.y + ty * ty * p2.y;
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
    }

    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
};

export const getPointOnQuadraticCurve = (t: number, p0: Point, p1: Point, p2: Point): Point => {
    const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
    const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
    return { x, y };
};
