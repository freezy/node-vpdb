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

import * as Router from 'koa-router';
import { ApiRouter } from '../common/api.router';
import { Scope } from '../common/scope';
import { LogEventApi } from '../log-event/log.event.api';
import { LogUserApi } from '../log-user/log.user.api';
import { ProfileApi } from './profile.api';

export class ProfileApiRouter implements ApiRouter {

	private readonly router: Router;

	constructor() {
		const api = new ProfileApi();
		this.router = api.apiRouter();

		this.router.get('/v1/profile',               api.auth(api.view.bind(api), 'user', 'view', [ Scope.ALL, Scope.COMMUNITY ]));
		this.router.patch('/v1/profile',             api.auth(api.update.bind(api), 'user', 'update', [ Scope.ALL ]));
		this.router.get('/v1/profile/confirm/:tkn', api.confirm.bind(api));
		this.router.post('/v1/profile/request-password-reset', api.requestResetPassword.bind(api));
		this.router.post('/v1/profile/password-reset',         api.resetPassword.bind(api));

		const logApi = new LogUserApi();
		this.router.get('/v1/profile/logs',          api.auth(logApi.list.bind(api), 'user', 'view', [ Scope.ALL ]));

		const eventsApi = new LogEventApi();
		this.router.get('/v1/profile/events',        api.auth(eventsApi.list({ loggedUser: true }).bind(eventsApi), 'user', 'view', [ Scope.ALL ]));

		// deprecated, remove when clients are updated.
		this.router.get('/v1/user',               api.auth(api.view.bind(api), 'user', 'view', [ Scope.ALL, Scope.COMMUNITY ]));
		this.router.patch('/v1/user',             api.auth(api.update.bind(api), 'user', 'update', [ Scope.ALL ]));
		this.router.get('/v1/user/logs',          api.auth(logApi.list.bind(api), 'user', 'view', [ Scope.ALL ]));
		this.router.get('/v1/user/events',        api.auth(eventsApi.list({ loggedUser: true }).bind(eventsApi), 'user', 'view', [ Scope.ALL ]));
		this.router.get('/v1/user/confirm/:tkn', api.confirm.bind(api));
	}

	public getRouter(): Router {
		return this.router;
	}
}
