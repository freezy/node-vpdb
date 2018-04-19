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

const _ = require('lodash');
const logger = require('winston');
const Pusher = require('pusher');
const config = require('../../src/common/settings').current;

exports.isEnabled = config.vpdb.pusher.enabled;

/* istanbul ignore next: Pusher not enabled in tests */
if (exports.isEnabled) {
	exports.api = new Pusher(config.vpdb.pusher.options);
}

/* istanbul ignore next: Pusher not enabled in tests */
exports.addVersion = function(game, release, version) {

	// don't even bother quering..
	if (!exports.isEnabled) {
		return logger.info('[pusher] [addVersion] Disabled, skipping announce.');
	}

	const User = require('mongoose').model('User');

	User.find({ 'channel_config.subscribed_releases': release.id }, function(err, subscribedUsers) {
		/* istanbul ignore if  */
		if (err) {
			return logger.error('[pusher] [addVersion] Error retrieving subscribed users for release %s: %s', release.id, err.message);
		}
		const users = _.filter(subscribedUsers, function(user) {
			return exports.isUserEnabled(user);
		});
		logger.info('Found %d authorized user(s) subscribed to release %s.', users.length, release.id);

		const userChannels = _.uniq(_.map(users, function(user) {
			return getChannel(user);
		}));
		userChannels.forEach(function(chan) {
			logger.info('Announcing update to channel %s', chan);
			exports.api.trigger(chan, 'new_release_version', { game_id: game.id, release_id: release.id, version: version.version });
		});
	});
};

exports.star = function(type, entity, user) {
	/* istanbul ignore if: Pusher not enabled in tests */
	if (exports.isUserEnabled(user)) {
		exports.api.trigger(getChannel(user), 'star', { id: entity.id, type: type });
	}
};

exports.unstar = function(type, entity, user) {
	/* istanbul ignore if: Pusher not enabled in tests */
	if (exports.isUserEnabled(user)) {
		exports.api.trigger(getChannel(user), 'unstar', { id: entity.id, type: type });
	}
};

/**
 * Returns true if the Pusher API is enabled and the user's plan supports it.
 * @param user User to check
 * @returns {boolean} True if a message can be sent, false otherwise.
 */
exports.isUserEnabled = function(user) {
	return exports.isEnabled && user.planConfig.enableRealtime;
};

/* istanbul ignore next: Pusher not enabled in tests */
function getChannel(user) {
	return 'private-user-' + user.id;
}
