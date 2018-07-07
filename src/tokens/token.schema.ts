/*
 * VPDB - Virtual Pinball Database
 * Copyright (C) 2018 freezy <freezy@vpdb.io>
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

import { randomBytes } from 'crypto';
import { isString } from 'lodash';
import { Schema } from 'mongoose';
import uniqueValidator from 'mongoose-unique-validator';
import { isLength } from 'validator';

import { scope } from '../common/scope';
import { config } from '../common/settings';

const shortId = require('shortid32');

const validTypes = ['personal', 'provider'];

//-----------------------------------------------------------------------------
// SCHEMA
//-----------------------------------------------------------------------------
export const tokenFields = {
	id: { type: String, required: true, unique: true, default: shortId.generate },
	token: { type: String, required: true, unique: true, default: () => randomBytes(16).toString('hex') },
	label: { type: String, required: 'A label must be provided' },
	type: { type: String, enum: validTypes, required: true },
	scopes: { type: [String] },
	provider: { type: String }, // must be set for provider tokens
	is_active: { type: Boolean, required: true, default: true },
	last_used_at: { type: Date },
	expires_at: { type: Date, required: true },
	created_at: { type: Date, required: true },
	_created_by: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
};

export const tokenSchema = new Schema(tokenFields, { toObject: { virtuals: true, versionKey: false } });

//-----------------------------------------------------------------------------
// VALIDATIONS
//-----------------------------------------------------------------------------
tokenSchema.path('label').validate(function(label: string) {
	return isString(label) && isLength(label ? label.trim() : '', 3);
}, 'Label must contain at least three characters.');

tokenSchema.path('scopes').validate(function(scopes: string[]) {
	if (!scopes || scopes.length === 0) {
		this.invalidate('scopes', 'Scopes are required');
		return true;
	}
	// for scope validation, fall back to private if invalid type given
	const type = validTypes.includes(this.type) ? this.type : 'private';
	if (!scope.isValid(type, scopes)) {
		this.invalidate('scopes', 'Scopes must be one or more of the following: [ "' + scope.getScopes(type).join('", "') + '" ].');
	}
	return true;
});

tokenSchema.path('type').validate(function(type: string) {
	if (type === 'provider') {
		if (!this.provider) {
			this.invalidate('provider', 'Provider is required for provider tokens.');
		}
		const providers: string[] = [];
		if (config.vpdb.passport.google.enabled) {
			providers.push('google');
		}
		if (config.vpdb.passport.github.enabled) {
			providers.push('github');
		}
		config.vpdb.passport.ipboard.forEach(ipb => {
			if (ipb.enabled) {
				providers.push(ipb.id);
			}
		});
		if (!providers.includes(this.provider)) {
			this.invalidate('provider', 'Provider must be one of: [ "' + providers.join('", "') + '" ].');
		}
	}
	return true;
});

//-----------------------------------------------------------------------------
// PLUGINS
//-----------------------------------------------------------------------------
tokenSchema.plugin(uniqueValidator, { message: 'The {PATH} "{VALUE}" is already taken.' });
