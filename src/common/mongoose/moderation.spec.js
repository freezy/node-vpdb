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

const request = require('superagent');
const expect = require('expect.js');
const faker = require('faker');

const superagentTest = require('../../../test/modules/superagent-test');
const hlp = require('../../../test/modules/helper');

superagentTest(request);

describe('The VPDB moderation feature', function() {

	describe('when accepting a moderated backglass', function() {

		let game, backglass;

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: ['member'] },
				moderator: { roles: ['moderator'] }
			}, function() {
				hlp.game.createGame('moderator', request, function(g) {
					game = g;

					hlp.file.createDirectB2S('member', request, function(b2s) {
						request
							.post('/api/v1/backglasses')
							.as('member')
							.send({
								_game: game.id,
								authors: [ {
									_user: hlp.users.member.id,
									roles: [ 'creator' ]
								} ],
								versions: [ {
									version: '1.0',
									_file: b2s.id
								} ]
							})
							.end(function(err, res) {
								backglass = res.body;
								hlp.expectStatus(err, res, 201);
								hlp.doomBackglass('member', res.body.id);
								done();
							});
					});
				});
			});
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should fail for empty data', function(done) {
			const user = 'moderator';
			request
				.post('/api/v1/backglasses/' + backglass.id + '/moderate')
				.as(user)
				.send({})
				.end(function(err, res) {
					expect(res.body.errors).to.have.length(1);
					hlp.expectValidationError(err, res, 'action', 'must be provided');
					done();
				});
		});

		it('should fail for invalid action', function(done) {
			const user = 'moderator';
			request
				.post('/api/v1/backglasses/' + backglass.id + '/moderate')
				.as(user)
				.send({ action: 'brümütz!!'})
				.end(function(err, res) {
					expect(res.body.errors).to.have.length(1);
					hlp.expectValidationError(err, res, 'action', 'invalid action');
					done();
				});
		});

		it('should fail when message is missing for refusal', function(done) {
			const user = 'moderator';
			request
				.post('/api/v1/backglasses/' + backglass.id + '/moderate')
				.as(user)
				.send({ action: 'refuse' })
				.end(function(err, res) {
					expect(res.body.errors).to.have.length(1);
					hlp.expectValidationError(err, res, 'message', 'message must be provided');
					done();
				});
		});

	});

	describe('when commenting a moderated release', function() {

		let release;

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				member2: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] }
			}, function() {
				hlp.release.createRelease('member', request, function(r) {
					release = r;
					done(null, r);
				});
			});
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should fail if the commentor is neither owner nor moderator', function(done) {
			request
				.post('/api/v1/releases/' + release.id + '/moderate/comments')
				.as('member2')
				.send({})
				.end(hlp.status(403, 'must be either moderator or owner', done));
		});

		it('should succeed when posting as owner', function(done) {
			const msg = faker.company.catchPhrase();
			request
				.post('/api/v1/releases/' + release.id + '/moderate/comments')
				.as('member')
				.send({ message: msg })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					expect(res.body.from.id).to.be(hlp.getUser('member').id);
					expect(res.body.message).to.be(msg);
					request
						.get('/api/v1/releases/' + release.id + '/moderate/comments')
						.as('member')
						.end(function(err, res) {
							hlp.expectStatus(err, res, 200);
							expect(res.body).to.be.an('array');
							expect(res.body).to.not.be.empty();
							done();
						});
				});
		});

		it('should succeed when posting as moderator', function(done) {
			const msg = faker.company.catchPhrase();
			request
				.post('/api/v1/releases/' + release.id + '/moderate/comments')
				.as('moderator')
				.send({ message: msg })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					expect(res.body.from.id).to.be(hlp.getUser('moderator').id);
					expect(res.body.message).to.be(msg);
					done();
				});
		});

	});

	describe('when listing moderation comments of a release', function() {

		let release;
		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				member2: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] }
			}, function() {
				hlp.release.createRelease('member', request, function(r) {
					release = r;
					done(null, r);
				});
			});
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should fail if the commentor is neither owner nor moderator', function(done) {
			request
				.get('/api/v1/releases/' + release.id + '/moderate/comments')
				.as('member2')
				.end(hlp.status(403, 'must be either moderator or owner', done));
		});

		it('should succeed when listing as owner', function(done) {
			request
				.get('/api/v1/releases/' + release.id + '/moderate/comments')
				.as('member')
				.end(hlp.status(200, done));
		});

		it('should succeed when listing as moderator', function(done) {
			request
				.get('/api/v1/releases/' + release.id + '/moderate/comments')
				.as('moderator')
				.end(hlp.status(200, done));
		});

	});
});