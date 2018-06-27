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

/* istanbul ignore file */
import Axios, { AxiosInstance, AxiosResponse } from 'axios';
import { parse, stringify } from 'querystring'
import randomString from 'randomstring';

import { logger } from '../../common/logger';
import { Context } from '../../common/typings/context';
import { ApiError } from '../../common/api.error';
import { OAuthProfile } from '../authentication.api';
import { VpdbIpsConfig } from '../../common/typings/config';
import { Strategy } from './strategy';

/**
 * Invision Community authentication strategy.
 *
 * Supports freezy/ipb-oauth2-server (IPS3.x), ips4-oauth2-server (IPS4.x) and
 * native IPS4.3 authentication.
 *
 * @see https://github.com/freezy/ipb-oauth2-server
 * @see https://github.com/wohali/ips4-oauth2-server
 * @see https://invisioncommunity.com/news/product-updates/43-sign-in-from-other-sites-using-oauth-r1058/
 */
export class IpsStrategy extends Strategy {

	protected name = 'ips';
	protected providerName: string;

	private readonly redirectUri: string;
	private readonly config: VpdbIpsConfig;
	private readonly client: AxiosInstance;

	constructor(redirectUri: string, config: VpdbIpsConfig) {
		super();
		this.redirectUri = redirectUri;
		this.providerName = config.id;
		this.config = config;
		this.client = Axios.create({ baseURL: this.config.baseURL, validateStatus: status => status < 500 });

		logger.info('[IpsStrategy] Instantiated %s v%s with redirection URL %s', this.providerName, this.config.version, redirectUri);
	}

	protected getAuthUrl(): string {
		let path: string;
		switch (this.config.version) {
			case 3: path = '?app=oauth2&module=server&section=authorize'; break;
			case 4: path = '/applications/oauth2server/interface/oauth/authorize.php'; break;
			case 4.3: path = '/oauth/authorize/'; break;
			default: throw new ApiError('Unsupported IPS version %s', this.config.version);
		}
		const state = randomString.generate(16);
		return path + (path.includes('?') ? '&' : '?') + stringify({
			client_id: this.config.clientID,
			redirect_uri: this.redirectUri,
			scope: 'user:email',
			state: state
		});
	}

	protected async getProfile(ctx: Context): Promise<any> {
		const code = ctx.query.code;
		const state = ctx.query.state;
		let path: string;
		switch (this.config.version) {
			case 3: path = '?app=oauth2&module=server&section=token'; break;
			case 4: path = '/applications/oauth2server/interface/oauth/token.php'; break;
			case 4.3: path = '/oauth/token/'; break;
			default: throw new ApiError('Unsupported IPS version %s', this.config.version);
		}

		// get access token
		let res = await this.client.post(path, {
			client_id: this.config.clientID,
			client_secret: this.config.clientSecret,
			code: code,
			redirect_uri: this.redirectUri,
			state: state
		}) as AxiosResponse;

		// handle errors
		if (res.status !== 200) {
			throw new ApiError('Could not retrieve access token from %s. This has been reported and will be fixed as soon as possible!', this.config.name);
		}
		const body = res.headers['content-type'].includes('form-urlencoded') ? parse(res.data) : res.data;
		if (body.error) {
			throw new ApiError('Error authenticating with %s: %s', this.config.name, body.error_description || body.error);
		}
		if (!body.access_token) {
			throw new ApiError('Error retrieving access token from %s.', this.config.name);
		}

		switch (this.config.version) {
			case 3: path = '?app=oauth2&module=server&section=profile'; break;
			case 4: path = '/applications/oauth2server/interface/oauth/me.php'; break;
			case 4.3: path = '/api/core/me'; break;
		}

		// looking good, get profile.
		const token = body.access_token;
		res = await this.client.get(path, { headers: { 'Authorization': `Bearer ${token}` } });
		return res.data;
	}

	/**
	 * Normalizes the IPS profile.
	 *
	 * @param profile
	 * @return {OAuthProfile}
	 */
	protected normalizeProfile(profile: any): OAuthProfile {
		switch (this.config.version) {
			case 3:
				return {
					provider: this.providerName,
					id: profile.id,
					emails: profile.emails,
					username: profile.login,
					displayName: profile.name,
					photos: profile.avatar && profile.avatar.full && profile.avatar.full.height ? [{ value: profile.avatar.thumb.url }] : undefined,
					_json: profile
				};

			case 4:
				return {
					provider: this.providerName,
					id: profile.id || profile.email,
					emails: [{ value: profile.email, type: 'unknown' }],
					username: profile.username,
					displayName: profile.displayName,
					photos: profile.avatar && profile.avatar.full && profile.avatar.full.height ? [{ value: profile.avatar.thumb.url }] : undefined,
					_json: profile
				};

			case 4.3:
				return  {
					provider: this.providerName,
					id: profile.id,
					emails: [{ value: profile.email, type: 'unknown' }],
					username: profile.name,
					displayName: profile.formattedName,
					photos: profile.photoUrl ? [{ value: profile.photoUrl }] : undefined,
					_json: profile
				};

			default: throw new ApiError('Unsupported IPS version %s', this.config.version);
		}
	}
}