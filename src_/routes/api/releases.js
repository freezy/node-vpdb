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

'use strict';

const scope = require('../../../src/common/scope');
const settings = require('../../../src/common/settings');

exports.register = function(app, api) {

	app.get(settings.apiPath('/releases'),        api.anon(api.releases.list));
	app.get(settings.apiPath('/releases/:id'),    api.anon(api.releases.view));
	app.patch(settings.apiPath('/releases/:id'),  api.auth(api.releases.update, 'releases', 'update-own', [ scope.ALL, scope.CREATE ]));
	app.post(settings.apiPath('/releases'),       api.auth(api.releases.create, 'releases', 'add', [ scope.ALL, scope.CREATE ]));
	app.delete(settings.apiPath('/releases/:id'), api.auth(api.releases.del, 'releases', 'delete-own', [ scope.ALL, scope.CREATE ]));

	app.post(settings.apiPath('/releases/:id/versions'), api.auth(api.releases.addVersion, 'releases', 'add', [ scope.ALL, scope.CREATE ]));
	app.patch(settings.apiPath('/releases/:id/versions/:version'), api.auth(api.releases.updateVersion, 'releases', 'update-own', [ scope.ALL, scope.CREATE ]));
	app.post(settings.apiPath('/releases/:id/versions/:version/files/:file/validate'), api.auth(api.releases.validateFile, 'releases', 'validate', [ scope.ALL, scope.CREATE ]));

	app.get(settings.apiPath('/releases/:id/comments'), api.anon(api.comments.listForRelease));
	app.post(settings.apiPath('/releases/:id/comments'), api.auth(api.comments.createForRelease, 'comments', 'add', [ scope.ALL, scope.COMMUNITY ]));

	app.post(settings.apiPath('/releases/:id/rating'), api.auth(api.ratings.createForRelease, 'releases', 'rate', [ scope.ALL, scope.COMMUNITY ]));
	app.put(settings.apiPath('/releases/:id/rating'), api.auth(api.ratings.updateForRelease, 'releases', 'rate', [ scope.ALL, scope.COMMUNITY ]));
	app.get(settings.apiPath('/releases/:id/rating'), api.auth(api.ratings.getForRelease, 'releases', 'rate', [ scope.ALL, scope.COMMUNITY ]));

	app.post(settings.apiPath('/releases/:id/star'), api.auth(api.stars.star('release'), 'releases', 'star', [ scope.ALL, scope.COMMUNITY ]));
	app.delete(settings.apiPath('/releases/:id/star'), api.auth(api.stars.unstar('release'), 'releases', 'star', [ scope.ALL, scope.COMMUNITY ]));
	app.get(settings.apiPath('/releases/:id/star'), api.auth(api.stars.get('release'), 'releases', 'star', [ scope.ALL, scope.COMMUNITY ]));

	app.post(settings.apiPath('/releases/:id/moderate'), api.auth(api.releases.moderate, 'releases', 'moderate', [ scope.ALL ]));
	app.post(settings.apiPath('/releases/:id/moderate/comments'), api.auth(api.comments.createForReleaseModeration, 'releases', 'add', [ scope.ALL ]));
	app.get(settings.apiPath('/releases/:id/moderate/comments'), api.auth(api.comments.listForReleaseModeration, 'releases', 'add', [ scope.ALL ]));

	app.get(settings.apiPath('/releases/:id/events'), api.anon(api.events.list({ byRelease: true })));
};