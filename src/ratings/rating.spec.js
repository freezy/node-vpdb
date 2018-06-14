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

"use strict"; /* global describe, before, after, it */

const _ = require('lodash');
const async = require('async');
const request = require('superagent');
const expect = require('expect.js');

const superagentTest = require('../../test/modules/superagent-test');
const hlp = require('../../test/modules/helper');

superagentTest(request);

describe('The VPDB `Rating` API', function() {

	describe('when rating a game', function() {

		let game;

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: ['member'] },
				member1: { roles: ['member'] },
				member2: { roles: ['member'] },
				member3: { roles: ['member'] },
				member4: { roles: ['member'] },
				moderator: { roles: ['moderator'] }
			}, function () {
				hlp.game.createGame('moderator', request, function(g) {
					game = g;
					done(null, game);
				});
			});
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should fail when providing the wrong game', function(done) {
			request.post('/api/v1/games/non_existent/rating').send({ value: 5 }).as('member').end(hlp.status(404, done));
		});

		it('should fail when providing nothing', function(done) {
			request.post('/api/v1/games/' + game.id + '/rating').send({}).as('member').end(function(err, res) {
				hlp.expectValidationError(err, res, 'value', 'must provide a value');
				done();
			});
		});

		it('should fail when providing a string', function(done) {
			request.post('/api/v1/games/' + game.id + '/rating').send({ value: 'foo' }).as('member').end(function(err, res) {
				hlp.expectValidationError(err, res, 'value', 'cast to number failed');
				done();
			});
		});

		it('should fail when providing a float', function(done) {
			request.post('/api/v1/games/' + game.id + '/rating').send({ value: 4.5 }).as('member').end(function(err, res) {
				hlp.expectValidationError(err, res, 'value', 'must be an integer');
				done();
			});
		});

		it('should fail when providing a wrong integer', function(done) {
			request.post('/api/v1/games/' + game.id + '/rating').send({ value: 11 }).as('member').saveResponse({ path: 'games/create-rating'}).end(function(err, res) {
				hlp.expectValidationError(err, res, 'value', 'must be between 1 and 10');
				done();
			});
		});

		it('should fail when trying to vote twice', function(done) {
			hlp.game.createGame('moderator', request, function(game) {
				request.post('/api/v1/games/' + game.id + '/rating').send({ value: 1 }).as('member').end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					request.post('/api/v1/games/' + game.id + '/rating')
						.send({ value: 1 })
						.as('member')
						.saveResponse({ path: 'games/create-rating'})
						.end(hlp.status(400, 'cannot vote twice', done));
				});
			});
		});

		it('should succeed when providing a correct rating', function(done) {
			hlp.game.createGame('moderator', request, function(game) {
				const rating = 7;
				request.post('/api/v1/games/' + game.id + '/rating')
					.send({ value: rating })
					.as('member')
					.save({ path: 'games/create-rating'})
					.end(function(err, res) {
						hlp.expectStatus(err, res, 201);
						expect(res.body.value).to.be(rating);
						expect(res.body.created_at).to.be.ok();
						expect(res.body.modified_at).to.not.be.ok();
						expect(res.body.game.average).to.be(rating);
						expect(res.body.game.votes).to.be(1);

						request.get('/api/v1/games/' + game.id).end(function(err, res) {
							hlp.expectStatus(err, res, 200);
							expect(res.body.rating.average).to.be(rating);
							expect(res.body.rating.votes).to.be(1);
							done();
						});
					});
			});
		});

		it('should calculate the average correctly', function(done) {
			hlp.game.createGame('moderator', request, function(game) {
				const ratings = [1, 3, 4, 10];
				const avg = [1, 2, 2.667, 4.5];
				async.timesSeries(ratings.length, function(i, next) {
					request.post('/api/v1/games/' + game.id + '/rating')
						.send({ value: ratings[i] })
						.as('member' + (i + 1))
						.end(function(err, res) {
							hlp.expectStatus(err, res, 201);
							expect(res.body.game.average).to.be(avg[i]);
							next();
						});
				}, done);

			});
		});
	});

	describe('after rating a game', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should give an indication if no vote has been cast', function(done) {
			hlp.game.createGame('moderator', request, function(game) {
				request.get('/api/v1/games/' + game.id + '/rating').as('member').saveResponse({ path: 'games/view-rating'}).end(function(err, res) {
					hlp.expectStatus(err, res, 404, 'rating of <' + hlp.getUser('member').email);
					hlp.expectStatus(err, res, 404, 'for "' + game.title);
					done();
				});
			});
		});

		it('should be able to retrieve the vote', function(done) {
			hlp.game.createGame('moderator', request, function(game) {
				const rating = 8;
				request.post('/api/v1/games/' + game.id + '/rating')
					.send({ value: rating })
					.as('member')
					.end(function(err, res) {
						hlp.expectStatus(err, res, 201);
						request.get('/api/v1/games/' + game.id + '/rating').save({ path: 'games/view-rating'}).as('member').end(function(err, res) {
							hlp.expectStatus(err, res, 200);
							expect(res.body.value).to.be(rating);
							expect(res.body.created_at).to.be.ok();
							done();
						});
					});
			});
		});
	});

	describe('when updating a game vote', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should fail when no previous vote has been cast', function(done) {
			hlp.game.createGame('moderator', request, function(game) {
				request.put('/api/v1/games/' + game.id + '/rating').send({ value: 5 }).as('member').end(hlp.status(404, done));
			});
		});

		it('should fail when providing an invalid value', function(done) {
			hlp.game.createGame('moderator', request, function(game) {
				request.post('/api/v1/games/' + game.id + '/rating')
					.send({ value: 9 })
					.as('member')
					.end(function(err, res) {
						hlp.expectStatus(err, res, 201);
						request.put('/api/v1/games/' + game.id + '/rating')
							.send({ value: 15 })
							.as('member')
							.end(function(err, res) {
								hlp.expectValidationError(err, res, 'value', 'must be between 1 and 10');
								done();
							});
					});
			});
		});

		it('should succeed when providing correct values', function(done) {
			hlp.game.createGame('moderator', request, function(game) {
				request.post('/api/v1/games/' + game.id + '/rating')
					.send({ value: 9 })
					.as('member')
					.end(function(err, res) {
						hlp.expectStatus(err, res, 201);
						request.put('/api/v1/games/' + game.id + '/rating')
							.send({ value: 8 })
							.as('member')
							.save({ path: 'games/update-rating'})
							.end(function(err, res) {
								hlp.expectStatus(err, res, 200);
								expect(res.body.value).to.be(8);
								expect(res.body.created_at).to.be.ok();
								expect(res.body.modified_at).to.be.ok();

								request.get('/api/v1/games/' + game.id).end(function(err, res) {
									hlp.expectStatus(err, res, 200);
									expect(res.body.rating.average).to.be(8);
									expect(res.body.rating.votes).to.be(1);
									done();
								});
							});
					});
			});
		});
	});

	describe('when rating a release', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] },
				contributor: { roles: [ 'contributor' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should succeed when providing a correct rating', function(done) {

			hlp.release.createRelease('contributor', request, function(release) {
				const rating = 5;
				request.post('/api/v1/releases/' + release.id + '/rating')
					.send({ value: rating })
					.as('member')
					.save({ path: 'releases/create-rating'})
					.end(function(err, res) {
						hlp.expectStatus(err, res, 201);
						expect(res.body.value).to.be(rating);
						expect(res.body.created_at).to.be.ok();
						expect(res.body.modified_at).to.not.be.ok();
						expect(res.body.release.average).to.be(rating);
						expect(res.body.release.votes).to.be(1);

						request.get('/api/v1/releases/' + release.id).end(function(err, res) {
							hlp.expectStatus(err, res, 200);
							expect(res.body.rating.average).to.be(rating);
							expect(res.body.rating.votes).to.be(1);
							done();
						});
					});
			});
		});
	});

	describe('after rating a release', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should be able to retrieve the vote', function(done) {
			hlp.release.createRelease('moderator', request, function(release) {
				const rating = 2;
				request.post('/api/v1/releases/' + release.id + '/rating')
					.send({ value: rating })
					.as('member')
					.end(function(err, res) {
						hlp.expectStatus(err, res, 201);
						request.get('/api/v1/releases/' + release.id + '/rating').save({ path: 'releases/view-rating'}).as('member').end(function(err, res) {
							hlp.expectStatus(err, res, 200);
							expect(res.body.value).to.be(rating);
							expect(res.body.created_at).to.be.ok();
							done();
						});
					});
			});
		});
	});

	describe('when updating a release vote', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] },
				contributor: { roles: [ 'contributor' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should succeed when providing correct values', function(done) {
			hlp.release.createRelease('contributor', request, function(release) {
				request.post('/api/v1/releases/' + release.id + '/rating')
					.send({ value: 8 })
					.as('member')
					.end(function(err, res) {
						hlp.expectStatus(err, res, 201);
						request.put('/api/v1/releases/' + release.id + '/rating')
							.send({ value: 1 })
							.as('member')
							.save({ path: 'releases/update-rating'})
							.end(function(err, res) {
								hlp.expectStatus(err, res, 200);
								expect(res.body.value).to.be(1);
								expect(res.body.created_at).to.be.ok();
								expect(res.body.modified_at).to.be.ok();

								request.get('/api/v1/releases/' + release.id).end(function(err, res) {
									hlp.expectStatus(err, res, 200);
									expect(res.body.rating.average).to.be(1);
									expect(res.body.rating.votes).to.be(1);
									done();
								});
							});
					});
			});
		});
	});

	describe('when several users vote for a game', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member1: { roles: [ 'member' ] },
				member2: { roles: [ 'member' ] },
				member3: { roles: [ 'member' ] },
				member4: { roles: [ 'member' ] },
				member5: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should calculate the rating score correctly', function(done) {
			const votes = [
				{ 5: 1 },
				{ 1: 1 },
				{ 5: 5 },
				{ 2: 2, 3: 1, 4: 2 },
				{ 3: 1 }
			];
			const scores = [
				4.076923077,
				3.076923077,
				4.538461538,
				3.288461538,
				3.576923077
			];
			hlp.game.createGames('moderator', request, 5, function(games) {

				const addVote = function(gameId, rating, user) {
					return function(next) {
						request.post('/api/v1/games/' + gameId + '/rating')
							.send({ value: rating })
							.as(user)
							.end(function(err, res) {
								hlp.expectStatus(err, res, 201);
								next();
							});
					};
				};
				const voteReq = [];

				// create votes
				_.each(votes, function(gameVotes, n) {
					const game = games[n];
					let member = 1;
					_.each(gameVotes, function(numVotes, rating) {
						for (let i = 0; i < numVotes; i++) {
							voteReq.push(addVote(game.id, rating, 'member' + member));
							member++;
						}
					});
				});

				const precision = 1000000000;
				const testScore = function(gameId, score) {
					return function(next) {
						request.get('/api/v1/games/' + gameId)
							.end(function(err, res) {
								hlp.expectStatus(err, res, 200);
								expect(Math.round(res.body.rating.score * precision)).to.be(Math.round(score * precision));
								next();
							});
					};
				};

				// test scores
				async.series(voteReq, function() {
					const scoreTest = [];
					_.each(games, function(game, n) {
						scoreTest.push(testScore(game.id, scores[n]));
					});
					async.series(scoreTest, done);
				});
			});
		});
	});

});