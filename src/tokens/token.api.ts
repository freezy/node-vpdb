/*
 * VPDB - Visual Pinball Database
 * Copyright (C) 2016 freezy <freezy@xbmc.org>
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

import { extend, includes, pick } from 'lodash';

import { state } from '../state';
import { Api } from '../common/api';
import { acl } from '../common/acl';
import { ApiError } from '../common/api.error';
import { Context } from '../common/types/context';
import { config } from '../common/settings';
import { logger } from '../common/logger';
import { Scope, scope } from '../common/scope';
import { Token } from './token';
import { User } from '../users/user';

const jwt = require('jwt-simple');

export class TokenApi extends Api {

	public async create(ctx: Context) {

		// default type is "personal".
		ctx.request.body.type = ctx.request.body.type || 'personal';

		// check if the plan allows application token creation
		if (scope.has(ctx.request.body.scopes, Scope.ALL) && !ctx.state.user.planConfig.enableAppTokens) {
			throw new ApiError('Your current plan "%s" does not allow the creation of application "all" access tokens. Upgrade or contact an admin.', ctx.state.user.planConfig.id).status(401);
		}

		// tokenType == "jwt" means the token comes from a "fresh" login (not a
		// refresh token) from either user/password or oauth2.
		if (ctx.state.tokenType === 'jwt') {

			// in this case, the user is allowed to create login tokens without
			// additionally supplying the password.
			if (!scope.has(ctx.request.body.scopes, Scope.LOGIN) && !ctx.request.body.password) {
				throw new ApiError('You cannot create other tokens but login tokens without supplying a password, ' +
					'even when logged with a "short term" token.').warn().status(401);
			}
		} else {

			// if the token type is not "jwt" (but "jwt-refreshed" or "access-token"),
			// the user must provide a password.
			if (!ctx.request.body.password) {
				throw new ApiError('When logged with a "long term" token (either from a X-Token-Refresh header or ' +
					'from an access token), you must provide your password.').warn().status(401);
			}
		}

		// in any case, if a password is supplied, check it.
		if (ctx.request.body.password) {

			if (!ctx.state.user.passwordSet()) {
				throw new ApiError('First set a password under your profile before adding tokens.').status(400);
			}
			if (!ctx.state.user.authenticate(ctx.request.body.password)) {
				throw new ApiError('Wrong password.').warn().status(401);
			}
		}

		// for application tokens, check additional permissions.
		let newToken: Token;
		if (ctx.request.body.type === 'application') {
			const granted = await acl.isAllowed(ctx.state.user.id, 'tokens', 'application-token');
			if (!granted) {
				throw new ApiError('Permission denied.').status(401);
			}
			newToken = new state.models.Token(extend(ctx.request.body, {
				label: ctx.request.body.label,
				is_active: true,
				created_at: new Date(),
				expires_at: new Date(new Date().getTime() + 315360000000), // 10 years
				_created_by: ctx.state.user._id
			}));

		} else {
			newToken = new state.models.Token(extend(ctx.request.body, {
				label: ctx.request.body.label || ctx.get('user-agent'),
				is_active: true,
				created_at: new Date(),
				expires_at: new Date(new Date().getTime() + 31536000000), // 1 year
				_created_by: ctx.state.user._id
			}));
		}
		await newToken.save();

		logger.info('[TokenApi.create] Token "%s" successfully created.', newToken.label);
		return this.success(ctx, state.serializers.Token.detailed(ctx, newToken), 201);
	}

	public async view(ctx: Context) {

		const token = ctx.params.id;
		let tokenInfo: Token;

		// app token?
		if (/[0-9a-f]{32,}/i.test(token)) {

			const appToken = await state.models.Token.findOne({ token: token }).populate('_created_by').exec();

			// fail if not found
			if (!appToken) {
				throw new ApiError('Invalid token.').status(404);
			}

			tokenInfo = {
				label: appToken.label,
				type: appToken.type,
				scopes: appToken.scopes,
				created_at: appToken.created_at,
				expires_at: appToken.expires_at,
				is_active: appToken.is_active,
			} as Token;

			// additional props for application token
			if (appToken.type === 'application') {
				tokenInfo.provider = appToken.provider;
			} else {
				tokenInfo.for_user = (appToken._created_by as User).id;
			}

		// Otherwise, assume it's a JWT.
		} else {

			// decode
			let decoded;
			try {
				decoded = jwt.decode(token, config.vpdb.secret, false, 'HS256');
			} catch (e) {
				throw new ApiError('Invalid token.').status(404);
			}
			tokenInfo = {
				type: decoded.irt ? 'jwt-refreshed' : 'jwt',
				scopes: ['all'],
				expires_at: new Date(decoded.exp),
				is_active: true, // JTWs cannot be revoked, so they are always active
				for_user: decoded.iss,
			} as Token;

			if (decoded.path) {
				tokenInfo.for_path = decoded.path;
			}
		}
		return this.success(ctx, tokenInfo, 200);
	}

	public async list(ctx:Context) {

		const query = { _created_by: ctx.state.user._id, type: 'personal' };
		const allowedTypes = [ 'personal', 'application' ];

		// filter by type?
		if (ctx.query.type && includes(allowedTypes, ctx.query.type)) {
			query.type = ctx.query.type;
		}
		let tokens = await state.models.Token.find().exec();

		// reduce
		tokens = tokens.map(token => state.serializers.Token.simple(ctx, token));
		return this.success(ctx, tokens);
	}

	public async update(ctx: Context) {
		const updatableFields = ['label', 'is_active', 'expires_at', 'scopes']; // TODO enable expires_at only in debug, not in prod
		const token = await state.models.Token.findOne({ id: ctx.params.id, _created_by: ctx.state.user._id }).exec();
		extend(token, pick(ctx.request.body, updatableFields));
		await token.save();
		logger.info('[TokenApi.update] Token "%s" successfully updated.', token.label);
		return this.success(ctx, state.serializers.Token.simple(ctx, token), 200);
	}

	public async del(ctx: Context) {
		const token = await state.models.Token.findOne({ id: ctx.params.id, _created_by: ctx.state.user._id }).exec();
		if (!token) {
			throw new ApiError('No such token').status(404);
		}
		await token.remove();
		return this.success(ctx, null, 204);
	}
}
