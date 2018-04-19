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
const Unrar = require('unrar');
const Zip = require('adm-zip');

Promise.promisifyAll(Unrar.prototype);

/**
 * Archive (Rar/Zip) processor.
 *
 * Saves archive listing in metadata
 * @constructor
 */
function ArchiveProcessor() {
	this.name = 'archive';
	this.variations = { };
}

/**
 * Retrieves file listing from archive.
 * @param file Archive file
 * @param variation variation (null, no variations here)
 * @return {Promise.<{ entries: { filename: string, bytes: number, bytes_compressed: number, crc: string, modified_at: Date }[]}>}
 */
ArchiveProcessor.prototype.metadata = function(file, variation) {
	return Promise.try(() => {
		if (!variation) {
			switch (file.getMimeSubtype()) {
				case 'x-rar-compressed':
				case 'rar':
					return getRarMetadata(file);

				case 'zip':
					return getZipMetadata(file);
			}
		}
	});
};

ArchiveProcessor.prototype.metadataShort = function(metadata) {
	return metadata;
};

ArchiveProcessor.prototype.variationData = function(metadata) {
	return metadata;
};

/**
 * Does nothing because archives are not processed.
 *
 * @param {string} src Path to source file
 * @param {string} dest Path to destination
 * @param {File} file File to process
 * @param {object} variation Variation of the file to process
 * @param {function} done Callback, ran with none or {Err} object as parameter.
 */
ArchiveProcessor.prototype.pass1 = function(src, dest, file, variation, done) {
	done();
};

module.exports = new ArchiveProcessor();

/**
 * Reads metadata from rar file
 * @param {FileSchema} file
 * @return {Promise.<{ entries: { filename: string, bytes: number, bytes_compressed: number, crc: string, modified_at: Date }[]}>}
 */
function getRarMetadata(file) {

	return Promise.try(function() {
		const archive = new Unrar(file.getPath());
		return archive.listAsync();

	}).then(entries => {

		// filter directories
		entries = _.filter(entries, entry => entry.type == 'File');

		// map data to something useful
		entries = _.map(entries, entry => {
			return {
				filename: entry.name,
				bytes: parseInt(entry.size),
				bytes_compressed: parseInt(entry.packedSize),
				crc: parseInt(entry.crc32, 16),
				modified_at: new Date(entry.mtime.replace(/,\d+$/, ''))
			};
		});

		return { entries: entries };
	});
}

/**
 * Reads metadata from zip file
 * @param {FileSchema} file
 * @return {Promise.<{ entries: { filename: string, bytes: number, bytes_compressed: number, crc: string, modified_at: Date }[]}>}
 */
function getZipMetadata(file) {

	return Promise.try(function() {

		let entries = new Zip(file.getPath()).getEntries();

		// filter directories
		entries = _.filter(entries, entry => !entry.isDirectory);

		// map data to something useful
		entries = _.map(entries, entry => {
			return {
				filename: entry.entryName,
				bytes: entry.header.size,
				bytes_compressed: entry.header.compressedSize,
				crc: entry.header.crc,
				modified_at: new Date(entry.header.time)
			};
		});
		return { entries: entries };

	}).catch(err => { throw new Error(err); }); // lib throws strings, not Errors..
}