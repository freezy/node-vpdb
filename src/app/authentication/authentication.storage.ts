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

import { isArray, keys } from 'lodash';
import { Api } from '../common/api';
import { ApiError } from '../common/api.error';
import { logger } from '../common/logger';
import { Context } from '../common/typings/context';
import { AuthenticationUtil } from './authentication.util';

export class AuthenticationStorageApi extends Api {

	/**
	 * Creates one or more storage tokens that can be used in an URL.
	 *
	 * @see POST /v1/authenticate
	 * @param {Context} ctx
	 * @returns {Promise<boolean>}
	 */
	public async authenticateUrls(ctx: Context) {
		if (!ctx.state.user) {
			throw new ApiError('Must be authenticated in order to obtain storage token.').status(401);
		}
		if (ctx.request.body && !ctx.request.body.paths) {
			throw new ApiError().validationErrors([{
				message: 'You must provide the paths of the storage tokens.',
				path: 'paths',
			}]);
		}
		const paths: string[] = !isArray(ctx.request.body.paths) ? [ctx.request.body.paths] : ctx.request.body.paths;
		const tokens: { [key: string]: string } = {};
		const now = new Date();
		paths.forEach(path => {
			tokens[path] = AuthenticationUtil.generateStorageToken(ctx.state.user, now, path);
		});
		logger.info(ctx.state, '[AuthenticationStorageApi.authenticateUrls] Generated %d auth tokens for user <%s>.', keys(tokens).length, ctx.state.user.email);
		this.success(ctx, tokens);
	}
}
