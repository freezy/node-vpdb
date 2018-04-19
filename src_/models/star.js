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
	_from: { type: Schema.ObjectId, required: true, ref: 'User', index: true },
	_ref: {
		game: { type: Schema.ObjectId, ref: 'Game', index: true, sparse: true },
		release: { type: Schema.ObjectId, ref: 'Release', index: true, sparse: true },
		user: { type: Schema.ObjectId, ref: 'User', index: true, sparse: true },
		medium: { type: Schema.ObjectId, ref: 'Medium', index: true, sparse: true },
		backglass: { type: Schema.ObjectId, ref: 'Backglass', index: true, sparse: true }
	},
	type: { type: String, 'enum': ['game', 'release', 'user', 'medium', 'backglass'], required: true, index: true },
	created_at: { type: Date, required: true }
};

const StarSchema = new Schema(fields, { usePushEach: true });
// TODO autoindex: false in production: http://mongoosejs.com/docs/guide.html#indexes

mongoose.model('Star', StarSchema);
logger.info('[model] Schema "Star" registered.');