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

import { Schema, Types } from 'mongoose';
import paginate = require('mongoose-paginate');

//-----------------------------------------------------------------------------
// SCHEMA
//-----------------------------------------------------------------------------
const fields = {
	_user: { type: Types.ObjectId, required: true, ref: 'User', index: true },
	_actor: { type: Types.ObjectId, required: true, ref: 'User', index: true },
	event: { type: String, index: true },
	payload: {},
	result: { type: String, 'enum': ['success', 'failure'], required: true },
	message: { type: String }, // in case of failure, this is the error message.
	ip: { type: String, required: true },
	logged_at: { type: Date, required: true }
};

const LogUserSchema = new Schema(fields, { toObject: { virtuals: true, versionKey: false }});

//-----------------------------------------------------------------------------
// PLUGINS
//-----------------------------------------------------------------------------
LogUserSchema.plugin(paginate);

export var schema: Schema = LogUserSchema;