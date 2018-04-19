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

const error = require('../../modules/error')('api', 'tag');
const acl = require('../../../src/common/acl');
const api = require('./api');
const Tag = require('mongoose').model('Tag');

const TagSerializer = require('../../serializers/tag.serializer');

exports.list = function(req, res) {

	let q;
	if (req.user) {
		// logged users also get their own tags even if inactive.
		q = { $or: [{ is_active: true }, { _created_by: req.user._id }] };
	} else {
		q = { is_active: true };
	}

	return Promise.try(() => Tag.find(q).exec()).then(tags => {

		// reduce
		tags = _.map(tags, tag => TagSerializer.simple(tag, req));
		return api.success(res, tags);

	}).catch(api.handleError(res, error, 'Error listing tags'));
};

exports.create = function(req, res) {

	let newTag;
	return Promise.try(() => {

		newTag = new Tag(_.extend(req.body, {
			_id: req.body.name ? req.body.name.replace(/(^[^a-z0-9]+)|([^a-z0-9]+$)/gi, '').replace(/[^a-z0-9]+/gi, '-').toLowerCase() : '-',
			is_active: false,
			created_at: new Date(),
			_created_by: req.user._id
		}));
		return newTag.validate();

	}).then(function() {
		return newTag.save();

	}).then(function() {
		logger.info('[api|tag:create] Tag "%s" successfully created.', newTag.name);
		return api.success(res, TagSerializer.simple(newTag, req), 201);

	}).catch(api.handleError(res, error, 'Error creating tag'));
};


/**
 * Deletes a tag.
 *
 * @param {Request} req
 * @param {Response} res
 */
exports.del = function(req, res) {

	let tag, canGloballyDeleteTags;

	return Promise.try(() => {

		return acl.isAllowed(req.user.id, 'tags', 'delete');

	}).then(canDelete => {

		canGloballyDeleteTags = canDelete;
		if (!canDelete) {
			return acl.isAllowed(req.user.id, 'tags', 'delete-own');
		} else {
			return true;
		}

	}).then(canDelete => {

		if (!canDelete) {
			throw error('You cannot delete tags.').status(401).log();
		}
		return Tag.findById(req.params.id);

	}).then(t => {
		tag = t;

		// tag must exist
		if (!tag) {
			throw error('No such tag with ID "%s".', req.params.id).status(404);
		}

		// only allow deleting own tags
		if (!canGloballyDeleteTags && (!tag._created_by || !tag._created_by.equals(req.user._id))) {
			throw error('Permission denied, must be owner.').status(403).log();
		}
		// todo check if there are references
		return tag.remove();

	}).then(function() {

		logger.info('[api|tag:delete] Tag "%s" (%s) successfully deleted.', tag.name, tag._id);
		return api.success(res, null, 204);

	}).catch(api.handleError(res, error, 'Error deleting tag'));
};
