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

const acl = require('../../../src/common/acl');
const api = require('./api');
const Build = require('mongoose').model('Build');
const Release = require('mongoose').model('Release');
const LogEvent = require('mongoose').model('LogEvent');
const BuildSerializer = require('../../serializers/build.serializer');

const error = require('../../modules/error')('api', 'tag');

/**
 * Lists all current builds.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.list = function(req, res) {

	let q;
	if (req.user) {
		// logged users also get their own builds even if inactive.
		q = { $or: [{ is_active: true }, { _created_by: req.user._id }] };
	} else {
		q = { is_active: true };
	}

	Promise.resolve().then(function() {
		return Build.find(q).exec();

	}).then(builds => {

		// reduce
		builds = _.map(builds, build => BuildSerializer.simple(build, req));
		return api.success(res, builds);

	}).catch(api.handleError(res, error, 'Error listing builds'));
};

/**
 * Updates an existing build.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.update = function(req, res) {

	const updateableFields = ['id', 'platform', 'major_version', 'label', 'download_url', 'support_url', 'built_at',
		'description', 'type', 'is_range', 'is_active'];

	let oldBuild;
	return Promise.try(() => {
		return Build.findOne({ id: req.params.id });

	}).then(build => {

		// build must exist
		if (!build) {
			throw error('No such build with ID "%s".', req.params.id).status(404);
		}

		oldBuild  = _.cloneDeep(BuildSerializer.detailed(build, req));

		// check fields and assign to object
		api.assertFields(req, updateableFields, error);
		_.assign(build, _.pick(req.body, updateableFields));


		// those fields are empty if data comes from initialization, so populate them.
		if (!build.created_at) {
			build.created_at = new Date();
		}
		if (!build._created_by) {
			build._created_by = req.user._id;
		}

		return build.save();

	}).then(newBuild => {

		logger.info('[api|build:update] Build "%s" successfully updated.', newBuild.id);
		api.success(res, BuildSerializer.detailed(newBuild, req), 200);

		// log event
		LogEvent.log(req, 'update_build', false, LogEvent.diff(oldBuild, req.body), { build: newBuild._id });

		return null;

	}).catch(api.handleError(res, error, 'Error updating build'));
};

/**
 * View details of a given build.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.view = function(req, res) {

	return Promise.try(() => {
		return Build.findOne({ id: req.params.id });

	}).then(build => {

		// build must exist
		if (!build) {
			throw error('No such build with ID "%s".', req.params.id).status(404);
		}
		return api.success(res, BuildSerializer.detailed(build, req), 200);

	}).catch(api.handleError(res, error, 'Error viewing build'));
};

/**
 * Creates a new build.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.create = function(req, res) {

	let newBuild;
	return Promise.try(() => {
		newBuild = new Build(req.body);

		const idFromLabel = newBuild.label ? newBuild.label.replace(/(^[^a-z0-9._-]+)|([^a-z0-9._-]+$)/gi, '').replace(/[^a-z0-9._-]+/gi, '-').toLowerCase() : '-';
		newBuild.id = newBuild.id || idFromLabel;
		newBuild.is_active = false;
		newBuild.created_at = new Date();
		newBuild._created_by = req.user._id;
		return newBuild.save();

	}).then(function() {
		logger.info('[api|build:create] Build "%s" successfully created.', newBuild.label);
		api.success(res, BuildSerializer.simple(newBuild, req), 201);

		// log event
		LogEvent.log(req, 'create_build', false, BuildSerializer.detailed(newBuild, req), { build: newBuild._id });

		return null;

	}).catch(api.handleError(res, error, 'Error creating build'));
};


/**
 * Deletes a build.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.del = function(req, res) {

	let build, canGloballyDeleteBuilds;

	return Promise.try(() => {

		return acl.isAllowed(req.user.id, 'builds', 'delete');

	}).then(canDelete => {

		canGloballyDeleteBuilds = canDelete;
		if (!canGloballyDeleteBuilds) {
			return acl.isAllowed(req.user.id, 'builds', 'delete-own');
		} else {
			return true;
		}

	}).then(canDeleteOwn => {

		if (!canDeleteOwn) {
			throw error('You cannot delete builds.').status(401).log();
		}
		return Build.findOne({ id: req.params.id });

	}).then(b => {
		build = b;

		// build must exist
		if (!build) {
			throw error('No such build with ID "%s".', req.params.id).status(404);
		}

		// only allow deleting own builds
		if (!canGloballyDeleteBuilds && (!build._created_by || !build._created_by.equals(req.user._id))) {
			throw error('Permission denied, must be owner.').status(403).log();
		}

		return Release.find({ 'versions.files._compatibility': build._id }).exec();

	}).then(releases => {

		if (releases.length !== 0) {
			throw error('Cannot delete referenced build. The following releases must be unlinked first: ["%s"].', releases.map(r => r.id).join('", "')).status(400);
		}
		return build.remove();

	}).then(function() {

		logger.info('[api|build:delete] Build "%s" (%s) successfully deleted.', build.label, build.id);
		api.success(res, null, 204);

		// log event
		LogEvent.log(req, 'delete_build', false, BuildSerializer.simple(build, req), { build: build._id });

		return null;

	}).catch(api.handleError(res, error, 'Error deleting tag'));
};
