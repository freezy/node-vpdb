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

import { pick } from 'lodash';

import { Serializer, SerializerOptions } from '../common/serializer';
import { Context } from '../common/typings/context';
import { state } from '../state';
import { User } from '../users/user';
import { Comment } from './comment';

export class CommentSerializer extends Serializer<Comment> {

	/* istanbul ignore next */
	protected _reduced(ctx: Context, doc: Comment, opts: SerializerOptions): Comment {
		return this._simple(ctx, doc, opts);
	}

	protected _simple(ctx: Context, doc: Comment, opts: SerializerOptions): Comment {
		const comment = pick(doc, ['id', 'message', 'created_at']) as Comment;
		if (this._populated(doc, '_from')) {
			comment.from = state.serializers.User.reduced(ctx, doc._from as User, opts);
		}
		// if (this._populated(doc, '_ref.release')) {
		// 	comment.release = state.serializers.Release.reduced(ctx, doc._ref.release as Release, opts);
		// }
		return comment;
	}

	/* istanbul ignore next */
	protected _detailed(ctx: Context, doc: Comment, opts: SerializerOptions): Comment {
		return this._simple(ctx, doc, opts);
	}
}
