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

"use strict"; /*global describe, before, after, it*/

const request = require('superagent');
const expect = require('expect.js');

const superagentTest = require('../../test/legacy/superagent-test');
const hlp = require('../../test/legacy/helper');

superagentTest(request);

describe('The scopes of the `Backglass` API', function() {

	let tokenAll, tokenLogin, tokenCommunity, tokenService;
	before(function() {

		return Promise.promisify(hlp.setupUsers.bind(hlp))(request, { root: { roles: [ 'root' ],  _plan: 'vip' } })
			.then(() => {
				return request
					.post('/api/v1/tokens')
					.as('root')
					.send({ label: 'all-token', password: hlp.getUser('root').password, type: 'personal', scopes: ['all'] })
					.promise();

			}).then(res => {
				hlp.expectStatus(res, 201);
				expect(res.body.id).to.be.ok();
				expect(res.body.token).to.be.ok();
				tokenAll = res.body.token;
				return request
					.post('/api/v1/tokens')
					.as('root')
					.send({ label: 'login-token', password: hlp.getUser('root').password, type: 'personal', scopes: ['login'] })
					.promise();

			}).then(res => {
				hlp.expectStatus(res, 201);
				expect(res.body.id).to.be.ok();
				expect(res.body.token).to.be.ok();
				tokenLogin = res.body.token;
				return request
					.post('/api/v1/tokens')
					.as('root')
					.send({ label: 'community-token', password: hlp.getUser('root').password, type: 'personal', scopes: [ 'community' ] })
					.promise();

			}).then(res => {
				hlp.expectStatus(res, 201);
				expect(res.body.id).to.be.ok();
				expect(res.body.token).to.be.ok();
				tokenCommunity = res.body.token;
				return request
					.post('/api/v1/tokens')
					.as('root')
					.send({ label: 'service-token', password: hlp.getUser('root').password, provider: 'github', type: 'provider', scopes: [ 'service' ] })
					.promise();

			}).then(res => {
				hlp.expectStatus(res, 201);
				expect(res.body.id).to.be.ok();
				expect(res.body.token).to.be.ok();
				tokenService = res.body.token;
			});
	});

	after(function(done) {
		hlp.cleanup(request, done);
	});

	describe('using an "all" token', function() {

		it('should allow access to backglass creation', done => {
			request.post('/api/v1/backglasses').send({}).with(tokenAll).end(hlp.status(422, done));
		});
		it('should allow access to backglass update', done => {
			request.patch('/api/v1/backglasses/1234').send({}).with(tokenAll).end(hlp.status(404, done));
		});
		it('should allow access to backglass deletion', done => {
			request.del('/api/v1/backglasses/1234').with(tokenAll).end(hlp.status(404, done));
		});
		it('should allow access to backglass moderation', done => {
			request.post('/api/v1/backglasses/1234/moderate').send({}).with(tokenAll).end(hlp.status(404, done));
		});

		it('should allow access to backglass star', done => {
			request.post('/api/v1/backglasses/1234/star').send({}).with(tokenAll).end(hlp.status(404, done));
		});
		it('should allow access to backglass unstar', done => {
			request.del('/api/v1/backglasses/1234/star').with(tokenAll).end(hlp.status(404, done));
		});
		it('should allow access to backglass star retrieval', done => {
			request.get('/api/v1/backglasses/1234/star').with(tokenAll).end(hlp.status(404, done));
		});
		it('should allow access to backglass unstar', done => {
			request.del('/api/v1/backglasses/1234/star').with(tokenAll).end(hlp.status(404, done));
		});
		it('should allow access to backglass star retrieval', done => {
			request.get('/api/v1/backglasses/1234/star').with(tokenAll).end(hlp.status(404, done));
		});

	});

	describe('using a login token', function() {

		it('should deny access to backglass creation', done => {
			request.post('/api/v1/backglasses').send({}).with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass update', done => {
			request.patch('/api/v1/backglasses/1234').send({}).with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass deletion', done => {
			request.del('/api/v1/backglasses/1234').with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});

		it('should deny access to backglass star', done => {
			request.post('/api/v1/backglasses/1234/star').send({}).with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass unstar', done => {
			request.del('/api/v1/backglasses/1234/star').with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass star retrieval', done => {
			request.get('/api/v1/backglasses/1234/star').with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass moderation', done => {
			request.post('/api/v1/backglasses/1234/moderate').send({}).with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass unstar', done => {
			request.del('/api/v1/backglasses/1234/star').with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass star retrieval', done => {
			request.get('/api/v1/backglasses/1234/star').with(tokenLogin).end(hlp.status(401, 'invalid scope', done));
		});

	});

	describe('using a community token', function() {

		it('should deny access to backglass creation', done => {
			request.post('/api/v1/backglasses').send({}).with(tokenCommunity).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass update', done => {
			request.patch('/api/v1/backglasses/1234').send({}).with(tokenCommunity).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass deletion', done => {
			request.del('/api/v1/backglasses/1234').with(tokenCommunity).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass moderation', done => {
			request.post('/api/v1/backglasses/1234/moderate').send({}).with(tokenCommunity).end(hlp.status(401, 'invalid scope', done));
		});

		it('should allow access to backglass star', done => {
			request.post('/api/v1/backglasses/1234/star').send({}).with(tokenCommunity).end(hlp.status(404, done));
		});
		it('should allow access to backglass unstar', done => {
			request.del('/api/v1/backglasses/1234/star').with(tokenCommunity).end(hlp.status(404, done));
		});
		it('should allow access to backglass star retrieval', done => {
			request.get('/api/v1/backglasses/1234/star').with(tokenCommunity).end(hlp.status(404, done));
		});
		it('should allow access to backglass unstar', done => {
			request.del('/api/v1/backglasses/1234/star').with(tokenCommunity).end(hlp.status(404, done));
		});
		it('should allow access to backglass star retrieval', done => {
			request.get('/api/v1/backglasses/1234/star').with(tokenCommunity).end(hlp.status(404, done));
		});

	});

	describe('using a service token', function() {

		it('should deny access to backglass creation', done => {
			request.post('/api/v1/backglasses').send({}).with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass update', done => {
			request.patch('/api/v1/backglasses/1234').send({}).with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass deletion', done => {
			request.del('/api/v1/backglasses/1234').with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass moderation', done => {
			request.post('/api/v1/backglasses/1234/moderate').send({}).with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});

		it('should deny access to backglass star', done => {
			request.post('/api/v1/backglasses/1234/star').send({}).with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass unstar', done => {
			request.del('/api/v1/backglasses/1234/star').with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass star retrieval', done => {
			request.get('/api/v1/backglasses/1234/star').with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass moderation', done => {
			request.post('/api/v1/backglasses/1234/moderate').send({}).with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass unstar', done => {
			request.del('/api/v1/backglasses/1234/star').with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});
		it('should deny access to backglass star retrieval', done => {
			request.get('/api/v1/backglasses/1234/star').with(tokenService).end(hlp.status(401, 'invalid scope', done));
		});

	});
});