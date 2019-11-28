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

'use strict';
/* global describe, before, after, it */

const expect = require('expect.js');
const faker = require('faker');

const ApiClient = require('../../test/api.client');
const ReleaseHelper = require('../../test/release.helper');
const GameHelper = require('../../test/game.helper');
const api = new ApiClient();
const releaseHelper = new ReleaseHelper(api);
const gameHelper = new GameHelper(api);

describe('The VPDB `Comment` API', () => {

	let res;
	let release, restrictedRelease;

	before(async () => {
		await api.setupUsers({
			member: { roles: ['member'] },
			member2: { roles: ['member'] },
			author: { roles: ['member'] },
			moderator: { roles: ['moderator'] },
			contributor: { roles: ['contributor'] }
		});
		const restrictedGame = await gameHelper.createGame('moderator', { ipdb: { mpu: 9999, number: 8888 } });
		release = await releaseHelper.createRelease('contributor', { author: 'author' });
		restrictedRelease = await releaseHelper.createReleaseForGame('contributor', restrictedGame, { author: 'author' });
	});

	after(async () => await api.teardown());

	describe('when creating a new comment to a release', () => {

		it('should fail when posting for an non-existing release', async () => {
			await api
				.as('member')
				.post('/v1/releases/bezerrrrk/comments', { message: '123' })
				.then(res => res.expectError(404));
		});

		it('should fail for a restricted release', async () => {
			// as any
			await api
				.as('member')
				.post('/v1/releases/' + restrictedRelease.id + '/comments', { message: '123' })
				.then(res => res.expectError(404, 'is restricted'));

			// as author
			await api
				.as('author')
				.post('/v1/releases/' + restrictedRelease.id + '/comments', { message: '123' })
				.then(res => res.expectError(404, 'is restricted'));

			// as uploader
			await api
				.as('contributor')
				.post('/v1/releases/' + restrictedRelease.id + '/comments', { message: '123' })
				.then(res => res.expectError(404, 'is restricted'));

			// as moderator
			await api
				.as('moderator')
				.post('/v1/releases/' + restrictedRelease.id + '/comments', { message: '123' })
				.then(res => res.expectError(404, 'is restricted'));
		});

		it('should fail when posting an empty message', async () => {
			await api
				.as('member')
				.post('/v1/releases/' + release.id + '/comments', {})
				.then(res => res.expectValidationError('message', 'must provide a message'));
		});

		it('should succeed when posting correct data', async () => {
			const msg = faker.company.catchPhrase();
			res = await api
				.as('member')
				.save('releases/create-comment')
				.post('/v1/releases/' + release.id + '/comments', { message: msg })
				.then(res => res.expectStatus(201));
			expect(res.data.from.id).to.be(api.getUser('member').id);
			expect(res.data.message).to.be(msg);
		});

	});

	describe('when updating a comment to a release', () => {

		let comment;

		before(async () => {
			res = await api
				.as('member')
				.post('/v1/releases/' + release.id + '/comments', { message: faker.company.catchPhrase() })
				.then(res => res.expectStatus(201));
			comment = res.data;
		});

		it('should fail for a non-existent comment', async () => {
			await api
				.as('moderator')
				.patch(`/v1/comments/124`, {})
				.then(res => res.expectStatus(404));
		});

		it('should fail with an invalid reference', async () => {
			await api
				.as('moderator')
				.patch(`/v1/comments/${comment.id}`, { _ref: { not: 'valid' }})
				.then(res => res.expectValidationError('_ref', 'must contain either `release` or `release_moderation`'));
		});

		it('should fail when providing the same reference twice', async () => {
			await api
				.as('moderator')
				.patch(`/v1/comments/${comment.id}`, { _ref: { release: '123', release_moderation: '123' }})
				.then(res => res.expectValidationError('_ref', 'not both'));
		});

		it('should fail when providing a non-existent reference', async () => {
			await api
				.as('moderator')
				.patch(`/v1/comments/${comment.id}`, { _ref: { release: '123' }})
				.then(res => res.expectValidationError('_ref.release', 'unknown reference'));
		});

		it('should fail when changing message as non-owner', async () => {
			await api
				.as('member2')
				.patch(`/v1/comments/${comment.id}`, { message: 'foobar' })
				.then(res => res.expectError(403, 'must be moderator or owner'));
		});

		it('should fail when changing reference as non-moderator', async () => {
			await api
				.as('member')
				.patch(`/v1/comments/${comment.id}`, { _ref: { release: '123' }})
				.then(res => res.expectError(403, 'must be moderator to change reference'));
		});

		it('should fail when changing reference to a different release', async () => {
			await api
				.as('moderator')
				.patch(`/v1/comments/${comment.id}`, { _ref: { release_moderation: restrictedRelease.id }})
				.then(res => res.expectValidationError('_ref.release_moderation', 'cannot point reference to different release'));
		});

		it('should succeed when moving a public comment to moderated', async () => {

			res = await api
				.as('member')
				.post('/v1/releases/' + release.id + '/comments', { message: faker.company.catchPhrase() })
				.then(res => res.expectStatus(201));

			const oldComment = res.data;

			res = await api
				.as('moderator')
				.patch(`/v1/comments/${oldComment.id}`, { _ref: { release_moderation: release.id }})
				.then(res => res.expectStatus(200));

			expect(res.data.ref.release).to.be(undefined);
			expect(res.data.ref.release_moderation.id).to.be(release.id);

			res = await api.as('moderator').get(`/v1/releases/${release.id}/comments`).then(res => res.expectStatus(200));
			expect(res.data.filter(comment => comment.id === oldComment.id)).to.be.empty();
			res = await api.as('moderator').get(`/v1/releases/${release.id}/moderate/comments`).then(res => res.expectStatus(200));
			expect(res.data.filter(comment => comment.id === oldComment.id)).to.have.length(1);

		});

		it('should succeed when moving a moderated comment to public', async () => {

			res = await api
				.as('moderator')
				.post('/v1/releases/' + release.id + '/moderate/comments', { message: faker.company.catchPhrase() })
				.then(res => res.expectStatus(201));

			const oldComment = res.data;

			res = await api
				.as('moderator')
				.patch(`/v1/comments/${oldComment.id}`, { _ref: { release: release.id }})
				.then(res => res.expectStatus(200));

			expect(res.data.ref.release_moderation).to.be(undefined);
			expect(res.data.ref.release.id).to.be(release.id);

			res = await api.as('moderator').get(`/v1/releases/${release.id}/comments`).then(res => res.expectStatus(200));
			expect(res.data.filter(comment => comment.id === oldComment.id)).to.have.length(1);
			res = await api.as('moderator').get(`/v1/releases/${release.id}/moderate/comments`).then(res => res.expectStatus(200));
			expect(res.data.filter(comment => comment.id === oldComment.id)).to.be.empty();
		});

		it('should succeed when updating the message as owner', async () => {

			res = await api
				.as('member')
				.post('/v1/releases/' + release.id + '/comments', { message: faker.company.catchPhrase() })
				.then(res => res.expectStatus(201));

			const oldComment = res.data;
			const newMessage = faker.company.catchPhrase();
			res = await api
				.as('member')
				.patch(`/v1/comments/${oldComment.id}`, { message: newMessage })
				.then(res => res.expectStatus(200));

			expect(res.data.message).to.be(newMessage);
		});

		it('should succeed when updating the message as moderator', async () => {

			res = await api
				.as('member')
				.post('/v1/releases/' + release.id + '/comments', { message: faker.company.catchPhrase() })
				.then(res => res.expectStatus(201));

			const oldComment = res.data;
			const newMessage = faker.company.catchPhrase();
			res = await api
				.as('moderator')
				.patch(`/v1/comments/${oldComment.id}`, { message: newMessage })
				.then(res => res.expectStatus(200));

			expect(res.data.message).to.be(newMessage);
		});

	});

	describe('when creating a new moderation comment to a release', () => {

		it('should fail when the release does not exist', async () => {
			const msg = faker.company.catchPhrase();
			res = await api
				.as('contributor')
				.post('/v1/releases/no-existo/moderate/comments', { message: msg })
				.then(res => res.expectError(404));
		});

		it('should fail if the user is none of author, uploader or moderator', async () => {
			const msg = faker.company.catchPhrase();
			res = await api
				.as('member')
				.post('/v1/releases/' + release.id + '/moderate/comments', { message: msg })
				.then(res => res.expectError(403, 'must be either moderator or owner or author'));
		});

		it('should succeed as author', async () => {
			const msg = faker.company.catchPhrase();
			res = await api
				.as('author')
				.post('/v1/releases/' + release.id + '/moderate/comments', { message: msg })
				.then(res => res.expectStatus(201));
			const comment = res.data;

			// check that it's listed also
			res = await api.as('author').get('/v1/releases/' + release.id + '/moderate/comments').then(res => res.expectStatus(200));
			expect(res.data.find(c => c.id === comment.id)).to.be.ok();
		});

		it('should succeed as uploader', async () => {
			const msg = faker.company.catchPhrase();
			await api
				.as('contributor')
				.post('/v1/releases/' + release.id + '/moderate/comments', { message: msg })
				.then(res => res.expectStatus(201));
		});

		it('should succeed as moderator', async () => {
			const msg = faker.company.catchPhrase();
			await api
				.as('moderator')
				.post('/v1/releases/' + release.id + '/moderate/comments', { message: msg })
				.then(res => res.expectStatus(201));
		});

	});

	describe('when listing comments under a release', () => {

		it('should fail when the release does not exist', async () => {
			res = await api
				.as('contributor')
				.get('/v1/releases/no-existo/comments')
				.then(res => res.expectError(404));
		});

		it('should fail for a restricted release as none of author, uploader or moderator', async () => {

			// as any
			await api
				.as('member')
				.get('/v1/releases/' + restrictedRelease.id + '/comments')
				.then(res => res.expectError(404, 'no such release'));
		});

		it('should succeed for a restricted release as author, uploader and moderator', async () => {

			// as author
			await api
				.as('author')
				.get('/v1/releases/' + restrictedRelease.id + '/comments')
				.then(res => res.expectStatus(200));

			// as uploader
			await api
				.as('contributor')
				.get('/v1/releases/' + restrictedRelease.id + '/comments')
				.then(res => res.expectStatus(200));

			// as moderator
			await api
				.as('moderator')
				.get('/v1/releases/' + restrictedRelease.id + '/comments')
				.then(res => res.expectStatus(200));
		});

		it('should list a comment', async () => {
			const msg = faker.company.catchPhrase();
			await api
				.as('member')
				.post('/v1/releases/' + release.id + '/comments', { message: msg })
				.then(res => res.expectStatus(201));

			res = await api
				.get('/v1/releases/' + release.id + '/comments')
				.then(res => res.expectStatus(200));
			expect(res.data).to.be.an('array');
			expect(res.data[res.data.length - 1].message).to.be(msg);
		});

		it('should return the correct counters', async () => {
			const msg = faker.company.catchPhrase();

			await api
				.as('member2')
				.post('/v1/releases/' + release.id + '/comments', { message: msg })
				.then(res => res.expectStatus(201));

			// check release counter
			res = await api.get('/v1/releases/' + release.id).then(res => res.expectStatus(200));
			expect(res.data).to.be.an('object');
			expect(res.data.counter.comments).to.be.greaterThan(0);

			// check user counter
			res = await api.as('member2').get('/v1/user').then(res => res.expectStatus(200));
			expect(res.data.counter.comments).to.be(1);

			// check game counter
			res = await api.get('/v1/games/' + release.game.id).then(res => res.expectStatus(200));
			expect(res.data.counter.comments).to.be.greaterThan(0);

		});
	});

	describe('when listing moderation comments of a release', () => {

		it('should fail when the release does not exist', async () => {
			res = await api
				.as('moderator')
				.get('/v1/releases/no-existo/moderate/comments')
				.then(res => res.expectError(404));
		});

		it('should fail if the user is none of author, uploader or moderator', async () => {
			res = await api
				.as('member')
				.get('/v1/releases/' + release.id + '/moderate/comments')
				.then(res => res.expectError(403, 'must be either moderator or owner or author'));
		});

		it('should succeed as author', async () => {
			res = await api
				.as('author')
				.get('/v1/releases/' + release.id + '/moderate/comments')
				.then(res => res.expectStatus(200));
		});

		it('should succeed as uploader', async () => {
			await api
				.as('contributor')
				.get('/v1/releases/' + release.id + '/moderate/comments')
				.then(res => res.expectStatus(200));
		});

		it('should succeed as moderator', async () => {
			await api
				.as('moderator')
				.get('/v1/releases/' + release.id + '/moderate/comments')
				.then(res => res.expectStatus(200));
		});

	});

});
