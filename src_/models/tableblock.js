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

const logger = require('winston');
const mongoose = require('mongoose');

const Schema = mongoose.Schema;

//-----------------------------------------------------------------------------
// SCHEMA
//-----------------------------------------------------------------------------
const fields = {
	hash:  { type: Buffer, required: true, unique: true, index: true },
	bytes: { type: Number, required: true },
	type:  { type: String, required: true, 'enum': [ 'image', 'sound', 'gameitem', 'collection' ] },
	meta:  { type: Schema.Types.Mixed },
	_files: { type: [ Schema.ObjectId ], ref: 'File', index: true }
};
const TableBlockSchema = new Schema(fields, { usePushEach: true });

mongoose.model('TableBlock', TableBlockSchema);
logger.info('[model] Schema "TableBlock" registered.');