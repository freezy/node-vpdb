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

import Axios from 'axios';
import { AxiosInstance, AxiosRequestConfig } from 'axios';
import { resolve } from 'path';

import { UserDocument } from '../../app/users/user.document';

const credentials = require('../credentials');

export abstract class DataUploader {

	protected readonly config: UploadConfig;
	private uploader: UserDocument;
	private readonly apiConfig: AxiosRequestConfig;
	private readonly storageConfig: AxiosRequestConfig;
	private readonly configs: Map<string, UploadConfig> = new Map([
		['local', {
			apiUri: 'http://127.0.0.1:3000/api',
			storageUri: 'http://127.0.0.1:3000/storage',
			authHeader: 'Authorization',
			credentials: { username: 'uploader', password: credentials.user.password },
		}],
		['test', {
			apiUri: 'https://test.vpdb.io/api',
			storageUri: 'https://test.vpdb.io/storage',
			authHeader: 'X-Authorization',
			credentials: { username: 'uploader', password: credentials.user.password },
			httpSimple: { username: credentials.httpSimple.username, password: credentials.httpSimple.password },
		}],
		['staging', {
			apiUri: 'https://staging.vpdb.io/api',
			storageUri: 'https://staging.vpdb.io/storage',
			authHeader: 'X-Authorization',
			credentials: { username: 'uploader', password: credentials.user.password },
			httpSimple: { username: credentials.httpSimple.username, password: credentials.httpSimple.password },
		}],
		['production', {
			apiUri: 'https://api.vpdb.io',
			storageUri: 'https://storage.vpdb.io',
			authHeader: 'Authorization',
			credentials: { username: 'uploader', password: credentials.user.password },
		}]]);

	constructor(configName: string) {
		this.config = this.configs.get(configName);
		this.config.folder = process.env.VPDB_DATA_FOLDER;
		this.config.romFolder = process.env.VPDB_ROM_FOLDER || (process.env.VPM_HOME ? resolve(process.env.VPM_HOME, 'roms') : undefined) || process.env.VPDB_DATA_FOLDER || 'F:/Pinball/Visual Pinball-103/VPinMame/roms';

		this.apiConfig = { baseURL: this.config.apiUri, headers: { 'Content-Type': 'application/json' }, maxContentLength: 300000000 };
		this.storageConfig = { baseURL: this.config.storageUri, headers: {}, maxContentLength: 300000000 };
		if (this.config.httpSimple) {
			const httpSimple = 'Basic ' + Buffer.from(this.config.httpSimple.username + ':' + this.config.httpSimple.password).toString('base64');
			this.apiConfig.headers.Authorization = httpSimple;
			this.storageConfig.headers.Authorization = httpSimple;
		}
	}

	public abstract async upload(): Promise<void>;

	protected api(): AxiosInstance {
		return Axios.create(this.apiConfig);
	}

	protected storage(): AxiosInstance {
		return Axios.create(this.storageConfig);
	}

	protected updateToken(token: string) {
		if (token) {
			this.apiConfig.headers[this.config.authHeader] = `Bearer ${token}`;
			this.storageConfig.headers[this.config.authHeader] = `Bearer ${token}`;
		}
	}

	protected async login() {
		console.log('Authenticating with user %s...', this.config.credentials.username);
		const res = await this.api().post('/v1/authenticate', this.config.credentials);
		if (res.status !== 200) {
			throw new Error('Error authenticating (' + res.status + '): ' + JSON.stringify(res.data));
		}
		if (!res.data.user.roles.includes('contributor')) {
			throw new Error('Must be contributor in order to add games!');
		}
		if (!res.data.token) {
			throw new Error('Could not retrieve token.');
		}

		this.uploader = res.data.user;

		// update clients with token
		this.apiConfig.headers[this.config.authHeader] = `Bearer ${res.data.token}`;
		this.storageConfig.headers[this.config.authHeader] = `Bearer ${res.data.token}`;
	}

	protected getUploader(): UserDocument {
		return this.uploader;
	}
}

export interface UploadConfig {
	apiUri: string;
	storageUri: string;
	authHeader: string;
	credentials: { username: string, password: string; };
	httpSimple?: { username: string, password: string; };
	folder?: string;
	romFolder?: string;
}
