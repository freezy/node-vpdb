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

var fs = require('fs');
var logger = require('winston');
var File = require('mongoose').model('File');
var storage = require('./storage');

/**
 * Creates a new file from a HTTP request stream.
 *
 * @param {object} fileData Model data
 * @param {Stream} readStream Binary stream of file content
 * @param {function} error Error logger
 * @param {{ [processInBackground]: boolean }} [opts] Options passed to postprocessor
 * @return {Promise.<FileSchema>}
 */
exports.create = function(fileData, readStream, error, opts) {

	var file;
	return Promise.try(function() {
		file = new File(fileData);
		return file.save();

	}).then(f => {
		file = f;
		return new Promise(function(resolve, reject) {
			var writeStream = fs.createWriteStream(file.getPath());
			writeStream.on('finish', resolve);
			writeStream.on('error', reject);
			readStream.pipe(writeStream);
		});

	}).then(() => {
		// we don't have the file size for multipart uploads before-hand, so get it now
		if (!file.bytes) {
			var stats = fs.statSync(file.getPath());
			file.bytes = stats.size;
			return File.update({ _id: file._id }, { bytes: stats.size });
		}
		return null;

	}).then(() => {
		return storage.preprocess(file);

	}).then(() => {
		return storage.metadata(file).catch(err => {

			// fail and remove file if metadata failed
			return file.remove().catch(err => {
				/* istanbul ignore next */
				logger.error('[api|file:save] Error removing file: %s', err.message);

			}).then(function() {
				throw error(err, 'Metadata parsing failed for type "%s": %s', file.mime_type, err.message).short().warn().status(400);
			});
		});

	}).then(metadata => {
		var stats = fs.statSync(file.getPath());
		File.sanitizeObject(metadata);
		file.metadata = metadata;
		file.bytes = stats.size;
		return File.update({ _id: file._id }, { metadata: metadata, bytes: stats.size });

	}).then(() => {
		logger.info('[api|file:save] File upload of %s successfully completed.', file.toString());
		return storage.postprocess(file, opts).then(() => file);

	});
};