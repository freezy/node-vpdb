"use strict";

const _ = require('lodash');
const async = require('async');
const expect = require('expect.js');
const randomString = require('randomstring');

const ApiClient = require('./api.client');
const api = new ApiClient();

exports.getGame = function(attrs, ipdbNumber) {
	const game = api.gameHelper.getGame(attrs, ipdbNumber);
	if (game.short) {
		game.id = game.short[0].replace(/[^a-z0-9\s\-]+/gi, '').replace(/\s+/g, '-').toLowerCase();
	} else {
		game.id = /unknown/i.test(game.title) ? randomString.generate(7) : game.title.replace(/[^a-z0-9\s\-]+/gi, '').replace(/\s+/g, '-').toLowerCase();
	}
	game.year = game.year || 1900;
	game.game_type = game.game_type || 'na';
	game.manufacturer = game.manufacturer || 'unknown';

	return attrs ? _.extend(game, attrs) : game;
};

/**
 * Creates a new game. Automatically marks game for deletion after test (i.e. dooms it).
 *
 * @param {string} user User name with which the game should be created
 * @param {Request} request HTTP client
 * @param {Object} [game]
 * @param {function} done Callback
 */
exports.createGame = function(user, request, game, done) {
	if (_.isFunction(game)) {
		done = game;
		game = {};
	}
	const hlp = require('./helper');
	hlp.file.createBackglass(user, request, function(backglass) {
		// backglass doomed by game
		request
			.post('/api/v1/games')
			.as(user)
			.send(_.assign(exports.getGame({ _backglass: backglass.id }), game))
			.end(function(err, res) {
				hlp.expectStatus(err, res, 201);
				hlp.doomGame(user, res.body.id);
				done(res.body);
			});
	});
};

exports.createGames = function(user, request, count, done) {
	// do this in serie
	async.timesSeries(count, function(n, next) {
		exports.createGame(user, request, function(game) {
			next(null, game);
		});
	}, function(err, games) {
		expect(games).to.be.an('array');
		expect(games).to.have.length(count);
		done(games);
	});
};