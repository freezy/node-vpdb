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

import { isArray, pick } from 'lodash';
import { ModerationData, ModerationDataEvent } from 'mongoose';

import { state } from '../../state';
import { UserDocument } from '../../users/user.document';
import { Serializer, SerializerLevel, SerializerOptions, SerializerReference } from '../serializer';
import { Context } from '../typings/context';
import { ModelName } from '../typings/models';

export class ModerationSerializer extends Serializer<ModerationData> {

	public readonly modelName: ModelName = null;
	public readonly references: { [level in SerializerLevel]: SerializerReference[] } = {
		reduced: [],
		simple: [],
		detailed: [{ path: 'history.created_by', modelName: 'User', level: 'reduced' }],
	};

	/* istanbul ignore next */
	protected _detailed(ctx: Context, doc: ModerationData, opts: SerializerOptions): ModerationData {
		return undefined;
	}

	/* istanbul ignore next */
	protected _reduced(ctx: Context, doc: ModerationData, opts: SerializerOptions): ModerationData {
		return undefined;
	}

	protected _simple(ctx: Context, doc: ModerationData, opts: SerializerOptions): ModerationData {
		/* istanbul ignore if */
		if (!doc) {
			return undefined;
		}
		// if user is populated that means we should populate the history, otherwise only status is returned
		const includeHistory = isArray(doc.history) && doc.history[0] && this._populated(doc.history[0], '_created_by');
		const moderationData: ModerationData = pick(doc, ['is_approved', 'is_refused', 'is_deleted', 'auto_approved']) as ModerationData;
		if (includeHistory) {
			moderationData.history = doc.history.map(h => {
				return {
					event: h.event,
					created_at: h.created_at,
					created_by: state.serializers.User.reduced(ctx, h._created_by as UserDocument, opts) as UserDocument,
				} as ModerationDataEvent;
			});
		}
		return moderationData;
	}
}
