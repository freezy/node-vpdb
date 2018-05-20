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

import { Context as KoaContext } from 'koa';
import { User } from '../../users/user';
import { Token } from '../../tokens/token';
import { ApiError } from '../api.error';

export interface Context extends KoaContext {

	state: {
		/**
		 * The currently logged user or null if not authenticated.
		 */
		user: User;

		/**
		 * If logged with an app token, this is it
		 */
		appToken: Token;

		/**
		 * The type of the token used for authentication.
		 * One of: [ `jwt-refreshed`, `jwt`, `application` ]
		 */
		tokenType: string;

		tokenScopes: string[];

		/**
		 * If app token, the name of the auth provider, e.g. "github", "google".
		 */
		tokenProvider: string;

		/**
		 * Set when authentication failed.
		 */
		authError: ApiError;
	}
}