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

	app.get(settings.apiPath('/games'),        api.anon(api.games.list));
	app.head(settings.apiPath('/games/:id'),   api.anon(api.games.head));
	app.get(settings.apiPath('/games/:id'),    api.anon(api.games.view));
	app.patch(settings.apiPath('/games/:id'),  api.auth(api.games.update, 'games', 'update', [ scope.ALL ]));
	app.post(settings.apiPath('/games'),       api.auth(api.games.create, 'games', 'add', [ scope.ALL ]));
	app.delete(settings.apiPath('/games/:id'), api.auth(api.games.del, 'games', 'delete', [ scope.ALL ]));

	app.post(settings.apiPath('/games/:id/rating'), api.auth(api.ratings.createForGame, 'games', 'rate', [ scope.ALL, scope.COMMUNITY ]));
	app.put(settings.apiPath('/games/:id/rating'),  api.auth(api.ratings.updateForGame, 'games', 'rate', [ scope.ALL, scope.COMMUNITY ]));
	app.get(settings.apiPath('/games/:id/rating'),  api.auth(api.ratings.getForGame, 'games', 'rate', [ scope.ALL, scope.COMMUNITY ]));

	app.post(settings.apiPath('/games/:id/star'),   api.auth(api.stars.star('game'), 'games', 'star', [ scope.ALL, scope.COMMUNITY ]));
	app.delete(settings.apiPath('/games/:id/star'), api.auth(api.stars.unstar('game'), 'games', 'star', [ scope.ALL, scope.COMMUNITY ]));
	app.get(settings.apiPath('/games/:id/star'),    api.auth(api.stars.get('game'), 'games', 'star', [ scope.ALL, scope.COMMUNITY ]));

	app.post(settings.apiPath('/games/:gameId/backglasses'), api.auth(api.backglasses.create, 'backglasses', 'add', [ scope.ALL, scope.CREATE ]));
	app.get(settings.apiPath('/games/:gameId/backglasses'),  api.anon(api.backglasses.list));

	app.get(settings.apiPath('/games/:gameId/media'), api.anon(api.media.list));

	app.get(settings.apiPath('/games/:id/events'), api.anon(api.events.list({ byGame: true })));

	app.get(settings.apiPath('/games/:id/release-name'), api.auth(api.games.releaseName, 'releases', 'add', [ scope.ALL, scope.CREATE ]));

};