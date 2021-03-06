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

'use strict';

const gm = require('gm');
const fs = require('fs');
const mongoose = require('mongoose');

const File = mongoose.model('File');
const processor = require('../modules/processor/image');

module.exports.up = function() {

	return Promise.each(File.find({ file_type: 'playfield-fs' }).exec(), file => {

		if (!/^image\//i.test(file.mime_type)) {
			return;
		}

		if (file.metadata.size.width > file.metadata.size.height) {

			let original = file.getPath();
			let dest = file.getPath(null, '_reprocessing');

			let img = gm(original);
			img.rotate('black', -90);

			return new Promise((resolve, reject) => {
				let writeStream = fs.createWriteStream(dest);

				// setup success handler
				writeStream.on('finish', function() {
					console.log(file.name);
					resolve();
				});
				writeStream.on('error', reject);
				img.stream().on('error', reject).pipe(writeStream).on('error', reject);

			}).then(() => {
				if (fs.existsSync(original)) {
					fs.unlinkSync(original);
				}
				fs.renameSync(dest, original);

				return processor.metadata(file);

			}).then(metadata => {
				File.sanitizeObject(metadata);
				file.metadata = metadata;
				return file.save();

			}).catch(console.error);
		}
	});
};