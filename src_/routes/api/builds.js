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

	app.get(settings.apiPath('/builds'),        api.anon(api.builds.list));
	app.post(settings.apiPath('/builds'),       api.auth(api.builds.create, 'builds', 'add', [ scope.ALL, scope.CREATE ]));
	app.get(settings.apiPath('/builds/:id'),    api.anon(api.builds.view));
	app.patch(settings.apiPath('/builds/:id'),  api.auth(api.builds.update, 'builds', 'update', [ scope.ALL, scope.CREATE ]));
	app.delete(settings.apiPath('/builds/:id'), api.auth(api.builds.del, 'builds', 'delete-own', [ scope.ALL, scope.CREATE ]));

};