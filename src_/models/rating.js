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
const shortId = require('shortid32');
const mongoose = require('mongoose');

const Schema = mongoose.Schema;


//-----------------------------------------------------------------------------
// SCHEMA
//-----------------------------------------------------------------------------
const fields = {
	id: { type: String, required: true, unique: true, 'default': shortId.generate },
	_from: { type: Schema.ObjectId, required: true, ref: 'User', index: true },
	_ref: {
		game: { type: Schema.ObjectId, ref: 'Game', index: true, sparse: true },
		release: { type: Schema.ObjectId, ref: 'Release', index: true, sparse: true }
	},
	value: { type: Number, required: 'You must provide a value when rating.' },
	modified_at: { type: Date },
	created_at: { type: Date, required: true }
};

const RatingSchema = new Schema(fields, { usePushEach: true });
// TODO autoindex: false in production: http://mongoosejs.com/docs/guide.html#indexes


//-----------------------------------------------------------------------------
// VALIDATIONS
//-----------------------------------------------------------------------------
RatingSchema.path('value').validate(function(val) {
	return _.isNumber(val) && val % 1 === 0;
}, 'Value must be an integer.');

RatingSchema.path('value').validate(function(val) {
	return val > 0 && val <= 10;
}, 'Value must be between 1 and 10.');


mongoose.model('Rating', RatingSchema);
logger.info('[model] Schema "Rating" registered.');