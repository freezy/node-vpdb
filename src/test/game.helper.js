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

const resolve = require('path').resolve;
const randomString = require('randomstring');
const assign = require('lodash').assign;
const extend = require('lodash').extend;
const uniqBy = require('lodash').uniqBy;
const FileHelper = require('./file.helper');

const ipdb = require(resolve(__dirname, '../../data/ipdb.json'));

class GameHelper {

	constructor(api) {
		/** @type {ApiClient}*/
		this.api = api;
		/** @type {FileHelper}*/
		this.fileHelper = new FileHelper(api);

		this.ipdb = uniqBy(ipdb, g => this._computeGameId(g));
	}

	/**
	 * Creates a new game. Automatically marks game for deletion after test.
	 *
	 * @param user
	 * @param game
	 * @return {Promise<Object>}
	 */
	async createGame(user, game) {
		const backglass = await this.fileHelper.createBackglass(user, { keep: true });
		const res = await this.api
			.as(user)
			.markRootTeardown()
			.post('/v1/games', assign(this.getGame({ _backglass: backglass.id }), game))
			.then(res => res.expectStatus(201));
		return res.data;
	}

	/**
	 * Creates a new original game. Automatically marks game for deletion after test.
	 * @param user
	 * @param game
	 * @returns {Promise<Object>}
	 */
	async createOriginalGame(user, game) {
		const backglass = await this.fileHelper.createBackglass(user, { keep: true });
		const generatedGame = this.getGame({ _backglass: backglass.id });
		generatedGame.game_type = 'og';
		delete generatedGame.ipdb;
		delete generatedGame.themes;
		delete generatedGame.designers;
		delete generatedGame.artists;
		delete generatedGame.features;
		delete generatedGame.notes;
		delete generatedGame.model_number;
		delete generatedGame.toys;
		delete generatedGame.slogans;
		delete generatedGame.produced_units;
		const res = await this.api
			.as(user)
			.markRootTeardown()
			.post('/v1/games', assign(generatedGame, game))
			.then(res => res.expectStatus(201));
		return res.data;
	}

	async createGames(user, count) {
		const games = [];
		for (let i = 0; i < count; i++) {
			games.push(await this.createGame(user));
		}
		return games;
	}

	async createRom(user, gameId, opts) {
		opts = opts || {};
		const name = opts.romName || 'hulk';
		const file = await this.fileHelper.createRom(user, Object.assign({}, opts, { keep: true }));
		const res = await this.api
			.as(user)
			.markTeardown('id', '/v1/roms')
			.post('/v1/games/' + gameId + '/roms', {
				id: name,
				_file: file.id
			})
			.then(res => res.expectStatus(201));
		return res.data;
	}

	getGame(attrs, ipdbNumber) {
		const game = this._popGame(ipdbNumber);
		game.id = this._computeGameId(game);
		game.year = game.year || 1900;
		game.game_type = game.game_type || 'na';
		game.manufacturer = game.manufacturer || 'unknown';
		return attrs ? extend(game, attrs) : game;
	}

	_popGame(ipdbNumber) {
		if (ipdbNumber) {
			const game = this.ipdb.find(i => i.ipdb.number === parseInt(ipdbNumber));
			if (!game) {
				throw new Error('No game with IPDB ID ' + ipdbNumber + ' found.');
			}
			return game;
		}
		return this.ipdb.splice(this._randomInt(this.ipdb.length), 1)[0];
	}

	_randomInt(max) {
		return Math.floor(Math.random() * max - 1) + 1;
	}

	_computeGameId(game) {
		if (game.short) {
			return game.short[0].replace(/[^a-z0-9\s\-]+/gi, '').replace(/\s+/g, '-').toLowerCase();
		} else {
			return /unknown/i.test(game.title) ? randomString.generate(7) : game.title.replace(/[^a-z0-9\s\-]+/gi, '').replace(/\s+/g, '-').toLowerCase();
		}
	}
}

module.exports = GameHelper;