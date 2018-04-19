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
const util = require('util');
const logger = require('winston');

const acl = require('../../../src/common/acl');
const api = require('./api');
const File = require('mongoose').model('File');
const Game = require('mongoose').model('Game');
const Rom = require('mongoose').model('Rom');
const Backglass = require('mongoose').model('Backglass');
const LogEvent = require('mongoose').model('LogEvent');
const BackglassSerializer = require('../../serializers/backglass.serializer');
const GameSerializer = require('../../serializers/game.serializer');

const mailer = require('../../../src/common/mailer');
const error = require('../../modules/error')('api', 'backglass');

/**
 * Creates a new backglass.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.create = function(req, res) {

	const now = new Date();
	let backglass;

	return Promise.try(() => {

		return Backglass.getInstance(_.extend(req.body, {
			_created_by: req.user._id,
			created_at: now
		}));

	}).then(newBackglass => {

		backglass = newBackglass;
		if (_.isArray(backglass.versions)) {
			backglass.versions.forEach(version => {
				if (!version.released_at) {
					version.released_at = now;
				}
			});

			// if this comes from /games/:gameId/backglasses, we already have a game id.
			if (req.params.gameId) {
				return Game.findOne({ id: req.params.gameId }).exec().then(game => {
					if (!game) {
						throw error('No such game with ID "%s".', req.params.gameId).status(404);
					}
					backglass._game = game._id;
				});
			}

			// check for available rom
			if (backglass.versions[0] && !backglass._game) {
				let backglassFile;
				return File.findById(backglass.versions[0]._file).exec().then(file => {
					if (file && file.metadata && file.metadata.gamename) {
						backglassFile = file;
						return Rom.findOne({ id: file.metadata.gamename }).exec();
					}

				}).then(rom => {
					if (rom) {
						logger.info('[ctrl|backglass] Linking backglass to same game %s as rom "%s".', rom._game, backglassFile.metadata.gamename);
						backglass._game = rom._game;
					}
				});
			}
		}

	}).then(() => {
		return backglass.validate();

	}).then(() => {
		logger.info('[api|backglass:create] Validations passed.');
		return backglass.save();

	}).then(() => {
		logger.info('[api|backglass:create] Backglass "%s" successfully created.', backglass.id);
		return backglass.activateFiles();

	}).then(() => {
		return Backglass.findById(backglass._id)
			.populate({ path: '_game' })
			.populate({ path: 'authors._user' })
			.populate({ path: 'versions._file' })
			.populate({ path: '_created_by' })
			.exec();

	}).then(populatedBackglass => {

		// send moderation mail
		if (populatedBackglass.moderation.is_approved) {
			mailer.backglassAutoApproved(req.user, populatedBackglass);
		} else {
			mailer.backglassSubmitted(req.user, populatedBackglass);
		}

		// event log
		LogEvent.log(req, 'create_backglass', true, {
			backglass: BackglassSerializer.detailed(populatedBackglass, req),
			game: GameSerializer.reduced(populatedBackglass._game, req)
		}, {
			backglass: populatedBackglass._id,
			game: populatedBackglass._game._id
		});

		// return object
		return api.success(res, BackglassSerializer.detailed(populatedBackglass, req), 201);

	}).catch(api.handleError(res, error, 'Error creating backglass'));
};


/**
 * Updates a backglass.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.update = function(req, res) {

	const updateableFields = [ '_game', 'description', 'acknowledgements' ];

	let oldBackglass, backglass;
	return Promise.try(() => {
		return Backglass.findOne({ id: req.params.id });

	}).then(bg => {
		backglass = bg;

		// fail if invalid id
		if (!backglass) {
			throw error('No such backglass with ID "%s".', req.params.id).status(404).log('update');
		}

		// check for global update permissions
		return acl.isAllowed(req.user.id, 'backglasses', 'update');

	}).then(canUpdate => {

		// if user only has permissions to update own releases, check if owner.
		if (!canUpdate) {
			// fail if wrong user
			const authorIds = backglass.authors.map(a => a._user.toString());
			const creatorId = backglass._created_by.toString();
			if (![creatorId, ...authorIds].includes(req.user._id.toString())) {
				throw error('Only authors, uploader or moderators can update a backglass.').status(403).log('update');
			}
			if (!_.isUndefined(req.body.authors) && creatorId !== req.user._id.toString()) {
				throw error('Only the original uploader can edit authors.').status(403).log('update');
			}
		}

		// fail if invalid fields provided
		const submittedFields = _.keys(req.body);
		if (_.intersection(updateableFields, submittedFields).length !== submittedFields.length) {
			var invalidFields = _.difference(submittedFields, updateableFields);
			throw error('Invalid field%s: ["%s"]. Allowed fields: ["%s"]', invalidFields.length === 1 ? '' : 's', invalidFields.join('", "'), updateableFields.join('", "')).status(400).log('update');
		}
		oldBackglass = _.cloneDeep(oldBackglass);

		// apply changes
		return backglass.updateInstance(req.body);

	}).then(backglass => {

		// validate and save
		return backglass.save();

	}).then(backglass => {

		// re-fetch backglass object tree
		return Backglass.findById(backglass._id)
			.populate({ path: '_game' })
			.populate({ path: 'authors._user' })
			.populate({ path: 'versions._file' })
			.populate({ path: '_created_by' })
			.exec();

	}).then(backglass => {

		// log event
		LogEvent.log(req, 'update_backglass', false,
			LogEvent.diff(oldBackglass, req.body),
			{ backglass: backglass._id, game: backglass._game._id }
		);

		return api.success(res, BackglassSerializer.detailed(backglass, req), 200);

	}).catch(api.handleError(res, error, 'Error updating backglass'));
};

/**
 * Lists all backglasses.
 *
 * This is only on two routes:
 *
 * 		/backglasses
 * 		/games/{game_id}/backglasses
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.list = function(req, res) {

	let query = {};
	let pagination = api.pagination(req, 10, 30);
	let serializerOpts = {};
	let fields = req.query && req.query.fields ? req.query.fields.split(',') : [];
	let populate = [ 'authors._user', 'versions._file' ];

	return Promise.try(() => {

		// list roms of a game below /api/v1/games/{gameId}
		if (req.params.gameId) {
			return Game.findOne({ id: req.params.gameId });
		}

		// filter with game_id query parameter
		if (req.query.game_id) {
			return Game.findOne({ id: req.query.game_id });
		}
		return null;

	}).then(game => {

		if (!game) {
			if (req.params.gameId) {
				throw error('No such game with ID "%s".', req.params.gameId).status(404);
			}
			if (req.query.game_id) {
				throw error('No such game with ID "%s".', req.query.game_id).status(404);
			}
			populate.push('_game');

		} else {
			query._game = game._id;
		}

		// validate moderation field
		if (fields.includes('moderation')) {
			if (!req.user) {
				throw error('You must be logged in order to fetch moderation fields.').status(403);
			}
			return acl.isAllowed(req.user.id, 'backglasses', 'moderate').then(isModerator => {
				if (!isModerator) {
					throw error('You must be moderator in order to fetch moderation fields.').status(403);
				}
				serializerOpts.includedFields = [ 'moderation' ];
			});
		}
		return null;

	}).then(() => {
		return Backglass.handleModerationQuery(req, error, query);

	}).then(q => {
		return Backglass.handleGameQuery(req, q);

	}).then(query => {

		logger.info('[api|backglass:list] query: %s', util.inspect(query, { depth: null }));

		return Backglass.paginate(query, {
			page: pagination.page,
			limit: pagination.perPage,
			populate: populate,
			sort: { 'created_at': -1 }

		}).then(result => [ result.docs, result.total ]);

	}).spread((results, count) => {

		let backglasses = results.map(bg => BackglassSerializer.simple(bg, req, serializerOpts));
		return api.success(res, backglasses, 200, api.paginationOpts(pagination, count));

	}).catch(api.handleError(res, error, 'Error listing backglasses'));
};

/**
 * Returns details about a backglass.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.view = function(req, res) {

	let serializerOpts = {
		fields: []
	};

	let backglass;
	return Promise.try(() => {
		return Backglass.findOne({ id: req.params.id })
			.populate({ path: '_game' })
			.populate({ path: 'authors._user' })
			.populate({ path: 'versions._file' })
			.populate({ path: '_created_by' })
			.exec();

	}).then(b => {
		backglass = b;
		if (!backglass) {
			throw error('No such backglass with ID "%s"', req.params.id).status(404);
		}
		return req.user ? acl.isAllowed(req.user.id, 'backglasses', 'moderate') : false;

	}).then(isModerator => {
		if (!isModerator && backglass._game.isRestricted('backglass') && !backglass.isCreatedBy(req.user)) {
			throw error('No such backglass with ID "%s"', req.params.id).status(404);
		}
		return backglass.assertModeratedView(req, error).then(backglass => {
			const fields = req.query && req.query.fields ? req.query.fields.split(',') : [];
			return backglass.populateModeration(req, { includedFields: fields }, error).then(populated => {
				if (populated !== false) {
					serializerOpts.includedFields = [ 'moderation' ];
				}
				return populated;
			});
		});

	}).then(backglass => {
		return api.success(res, BackglassSerializer.detailed(backglass, req, serializerOpts));

	}).catch(api.handleError(res, error, 'Error retrieving backglass details'));
};

/**
 * Deletes a backglass.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.del = function(req, res) {

	let backglass;
	let canDelete;
	return Promise.try(() => {
		return acl.isAllowed(req.user.id, 'backglasses', 'delete');

	}).then(result => {
		canDelete = result;
		return Backglass.findOne({ id: req.params.id })
			.populate({ path: '_game' })
			.populate({ path: 'authors._user' })
			.populate({ path: 'versions._file' })
			.exec();

	}).then(result => {

		backglass = result;
		if (!backglass) {
			throw error('No such backglass with ID "%s".', req.params.id).status(404);
		}

		// only allow deleting own roms
		if (!canDelete && !backglass._created_by.equals(req.user._id)) {
			throw error('Permission denied, must be owner.').status(403);
		}
		// remove from db
		return backglass.remove();

	}).then(() => {
		logger.info('[api|backglass:delete] Backglass "%s" successfully deleted.', backglass.id);

		// event log
		LogEvent.log(req, 'delete_backglass', false, {
			backglass: _.pick(BackglassSerializer.detailed(backglass, req), [ 'id', 'authors', 'versions' ]),
			game: GameSerializer.simple(backglass._game, req)
		}, {
			backglass: backglass._id,
			game: backglass._game._id
		});

		return api.success(res, null, 204);

	}).catch(api.handleError(res, error, 'Error deleting backglass'));
};

/**
 * Moderates a backglass.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.moderate = function(req, res) {

	let backglass, moderation;
	return Promise.try(() => {
		return Backglass.findOne({ id: req.params.id })
			.populate('_game')
			.populate('_created_by')
			.exec();

	}).then(bg => {
		backglass = bg;
		if (!backglass) {
			throw error('No such backglass with ID "%s".', req.params.id).status(404);
		}
		return Backglass.handleModeration(req, error, backglass);

	}).then(m => {
		moderation = m;
		if (_.isArray(moderation.history)) {
			moderation.history.sort((m1, m2) => m2.created_at.getTime() - m1.created_at.getTime());
			const lastEvent = moderation.history[0];
			const errHandler = err => logger.error('[moderation|backglass] Error sending moderation mail: %s', err.message);
			switch (lastEvent.event) {
				case 'approved':
					return mailer.backglassApproved(backglass._created_by, backglass, lastEvent.message).catch(errHandler);
				case 'refused':
					return mailer.backglassRefused(backglass._created_by, backglass, lastEvent.message).catch(errHandler);
			}
		}
		return null;

	}).then(() => {
		return api.success(res, moderation, 200);

	}).catch(api.handleError(res, error, 'Error moderating backglass'));
};
