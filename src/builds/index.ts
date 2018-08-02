/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2018 freezy <freezy@vpdb.io>
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

import mongoose from 'mongoose';

import { EndPoint } from '../common/api.endpoint';
import { ApiRouter } from '../common/api.router';
import { state } from '../state';
import { BuildDocument } from './build.document';
import { BuildApiRouter } from './build.router';
import { buildSchema } from './build.schema';
import { BuildSerializer } from './build.serializer';
import { initialBuilds } from './initial-data/builds';

export class BuildApiEndPoint extends EndPoint {

	public readonly name: string = 'Build API';
	private readonly router = new BuildApiRouter();

	public getRouter(): ApiRouter {
		return this.router;
	}

	public registerModel(): EndPoint {
		state.models.Build = mongoose.model<BuildDocument>('Build', buildSchema);
		return this;
	}

	public registerSerializer(): EndPoint {
		state.serializers.Build = new BuildSerializer();
		return this;
	}

	public async import(): Promise<void> {
		await this.importData(state.models.Build, initialBuilds);
	}
}
