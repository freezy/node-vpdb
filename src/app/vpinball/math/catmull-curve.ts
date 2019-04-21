/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2019 freezy <freezy@vpdb.io>
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License
 * as published by the Free Software Foundation; either version 2
 * of the License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program; if not, write to the Free Software
 * Foundation, Inc., 51 Franklin Street, Fifth Floor, Boston, MA  02110-1301, USA.
 */

import { f4 } from './float';
import { IRenderVertex, RenderVertex, RenderVertex3D } from './vertex';
import { Vertex2D } from './vertex2d';
import { Vertex3D } from './vertex3d';

/**
 * VPinball's implementation of the Catmull Curve.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/mesh.h#L55
 */
export class CatmullCurve {

	private c: { x: number[], y: number[], z?: number[] } = {
		x: [0, 0, 0, 0],
		y: [0, 0, 0, 0],
		z: [0, 0, 0, 0],
	};

	public static fromVertex3D(v0: Vertex3D, v1: Vertex3D, v2: Vertex3D, v3: Vertex3D): CatmullCurve {
		return CatmullCurve.fromVertex2D(v0.xy(), v1.xy(), v2.xy(), v3.xy());
	}

	public static fromVertex2D(v0: Vertex2D, v1: Vertex2D, v2: Vertex2D, v3: Vertex2D): CatmullCurve {

		let dt0 = f4(Math.sqrt(v1.clone().sub(v0).length()));
		let dt1 = f4(Math.sqrt(v2.clone().sub(v1).length()));
		let dt2 = f4(Math.sqrt(v3.clone().sub(v2).length()));

		// check for repeated control points
		if (dt1 < 1e-4) {
			dt1 = 1.0;
		}
		if (dt0 < 1e-4) {
			dt0 = dt1;
		}
		if (dt2 < 1e-4) {
			dt2 = dt1;
		}
		return new CatmullCurve(v0, v1, v2, v3, dt0, dt1, dt2);
	}

	public constructor(v0: Vertex2D, v1: Vertex2D, v2: Vertex2D, v3: Vertex2D, dt0: number, dt1: number, dt2: number) {
		this.c.x = CatmullCurve.initNonuniformCatmullCoeffs(v0.x, v1.x, v2.x, v3.x, dt0, dt1, dt2);
		this.c.y = CatmullCurve.initNonuniformCatmullCoeffs(v0.y, v1.y, v2.y, v3.y, dt0, dt1, dt2);
	}

	public getPoint2At(t: number): IRenderVertex {
		const t2 = f4(t * t);
		const t3 = f4(t2 * t);
		return new RenderVertex(
			f4(f4(f4(this.c.x[3] * t3) + f4(this.c.x[2] * t2)) + f4(this.c.x[1] * t)) + this.c.x[0],
			f4(f4(f4(this.c.y[3] * t3) + f4(this.c.y[2] * t2)) + f4(this.c.y[1] * t)) + this.c.y[0],
		);
	}

	public getPoint3At(t: number): IRenderVertex {
		const t2 = f4(t * t);
		const t3 = f4(t2 * t);
		return new RenderVertex3D(
			f4(f4(f4(this.c.x[3] * t3) + f4(this.c.x[2] * t2)) + f4(this.c.x[1] * t)) + this.c.x[0],
			f4(f4(f4(this.c.y[3] * t3) + f4(this.c.y[2] * t2)) + f4(this.c.y[1] * t)) + this.c.y[0],
			f4(f4(f4(this.c.z[3] * t3) + f4(this.c.z[2] * t2)) + f4(this.c.z[1] * t)) + this.c.z[0],
		);
	}

	private static initNonuniformCatmullCoeffs(x0: number, x1: number, x2: number, x3: number, dt0: number, dt1: number, dt2: number): number[] {

		// compute tangents when parameterized in [t1,t2]
		let t1 = f4(f4(f4(f4(x1 - x0) / dt0) - f4(f4(x2 - x0) / f4(dt0 + dt1))) + f4(f4(x2 - x1) / dt1));
		let t2 = f4(f4(f4(f4(x2 - x1) / dt1) - f4(f4(x3 - x1) / f4(dt1 + dt2))) + f4(f4(x3 - x2) / dt2));

		// rescale tangents for parametrization in [0,1]
		t1 = f4(t1 * dt1);
		t2 = f4(t2 * dt1);

		return CatmullCurve.initCubicSplineCoeffs(x1, x2, f4(t1), f4(t2));
	}

	private static initCubicSplineCoeffs(x0: number, x1: number, t0: number, t1: number) {
		const out: number[] = [];
		out[0] = f4(x0);
		out[1] = f4(t0);
		out[2] = f4(f4(f4(-3.0 * x0) + f4(3.0 * x1)) - f4(2.0 * t0) - t1);
		out[3] = f4(f4(f4(f4(2.0 * x0) - f4(2.0 * x1)) + t0) + t1);
		return out;
	}
}