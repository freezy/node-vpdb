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

const superagentTest = require('../../test/modules/superagent-test');
const hlp = require('../../test/modules/helper');

superagentTest(request);

describe('The VPDB `Build` API', function() {

	describe('when posting a new build', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should fail validations for empty data', function(done) {
			request
				.post('/api/v1/builds')
				.saveResponse({ path: 'builds/create'})
				.as('member')
				.send({})
				.end(function(err, res) {
					hlp.expectValidationError(err, res, 'platform', 'must be provided');
					hlp.expectValidationError(err, res, 'label', 'must be provided');
					hlp.expectValidationError(err, res, 'type', 'must be provided');
					hlp.expectValidationError(err, res, 'major_version', 'must be provided');
					done();
				});
		});

		it('should fail validations for invalid data', function(done) {
			request
				.post('/api/v1/builds')
				.saveResponse({ path: 'builds/create'})
				.as('member')
				.send({ platform: 'zurg', label: '1', type: 'non-existent', is_range: null, built_at: 'no-date' })
				.end(function(err, res) {
					hlp.expectValidationError(err, res, 'platform', 'invalid platform');
					hlp.expectValidationError(err, res, 'label', 'must contain at least');
					hlp.expectValidationError(err, res, 'type', 'invalid type');
					hlp.expectValidationError(err, res, 'is_range', 'you need to provide');
					done();
				});
		});

		it('should fail if the build label already exists', function(done) {
			request
				.post('/api/v1/builds')
				.as('member')
				.send({ label: 'v1.0.0-dupetest', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					hlp.doomBuild('member', res.body.id);
					request
						.post('/api/v1/builds')
						.as('member')
						.send({ label: 'v1.0.0-dupetest', type: 'release', major_version: '1' })
						.end(function(err, res) {
							hlp.expectValidationError(err, res, 'label', 'is already taken');
							done();
						});
				});
		});

		it('should succeed with minimal data', function(done) {
			request
				.post('/api/v1/builds')
				.as('member')
				.send({ label: 'v1.0.0', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					hlp.doomBuild('member', res.body.id);
					done();
				});
		});

		it('should succeed with full data', function(done) {
			request
				.post('/api/v1/builds')
				.save({ path: 'builds/create'})
				.as('member')
				.send({
					label: 'v1.0.1',
					platform: 'vp',
					major_version: '1',
					type: 'release',
					description: 'The very first release.',
					download_url: 'http://download_url/',
					support_url: 'http://support_url/',
					built_at: '2000-01-01 12:21',
					is_range: false
				})
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					hlp.doomBuild('member', res.body.id);
					done();
				});
		});
	});

	describe('when updating a build', function() {

		let build;
		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] }
			}, function() {
				request
					.post('/api/v1/builds')
					.as('member')
					.send({ label: 'v1.0.0', type: 'release', platform: 'vp', major_version: '1' })
					.end(function(err, res) {
						build = res.body;
						hlp.expectStatus(err, res, 201);
						hlp.doomBuild('member', res.body.id);
						done();
					});
			});
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should fail when providing a non-existent build', function(done) {
			request
				.patch('/api/v1/builds/qwerz')
				.as('moderator')
				.send({ })
				.end(hlp.status(404, 'no such build', done));
		});

		it('should fail when providing invalid fields', function(done) {
			request
				.patch('/api/v1/builds/' + build.id)
				.as('moderator')
				.send({ created_at: new Date(), nonexisting: 'qwertz' })
				.end(hlp.status(400, 'Invalid fields: ["created_at", "nonexisting"]', done));
		});

		it('should fail for invalid types', function(done) {

			request
				.patch('/api/v1/builds/' + build.id)
				.as('moderator')
				.saveResponse({ path: 'builds/update'})
				.send({
					platform: true,
					built_at: 'never',
					type: true,
				})
				.end(function(err, res) {
					hlp.expectValidationError(err, res, 'platform', 'invalid platform');
					hlp.expectValidationError(err, res, 'built_at', 'cast to date failed');
					hlp.expectValidationError(err, res, 'type', 'invalid type');
					done();
				});
		});

		it('succeed for valid data', function(done) {
			const platform = 'vp';
			const label = 'Updated build label';
			const majorVersion = '11';
			const downloadUrl = 'https://visualpinball.com/updated-url';
			const supportUrl = 'https://visualpinball.com/support-url';
			const buildAt = new Date('2017-01-01 12:00:00');
			const description = 'The new future version of Visual Pinball!';
			const type = 'nightly';
			const isRange = true;
			const isActive = true;

			request
				.patch('/api/v1/builds/' + build.id)
				.as('moderator')
				.save({ path: 'builds/update'})
				.send({
					platform: platform,
					label: label,
					major_version: majorVersion,
					download_url: downloadUrl,
					support_url: supportUrl,
					built_at: buildAt,
					description: description,
					type: type,
					is_range: isRange,
					is_active: isActive
				})
				.end(function(err, res) {
					hlp.expectStatus(err, res, 200);
					expect(res.body.platform).to.be(platform);
					expect(res.body.label).to.be(label);
					expect(res.body.major_version).to.be(majorVersion);
					expect(res.body.download_url).to.be(downloadUrl);
					expect(res.body.support_url).to.be(supportUrl);
					expect(new Date(res.body.built_at).getTime()).to.be(buildAt.getTime());
					expect(res.body.description).to.be(description);
					expect(res.body.type).to.be(type);
					expect(res.body.is_range).to.be(isRange);
					expect(res.body.is_active).to.be(isActive);
					done();
				});
		});

		it('succeed for pre-populated build', function(done) {
			const label = 'Yet another updated build label';

			request
				.patch('/api/v1/builds/10.0.0')
				.as('moderator')
				.send({
					label: label,
				})
				.end(function(err, res) {
					hlp.expectStatus(err, res, 200);
					expect(res.body.created_by.id).to.be(hlp.users['moderator'].id);
					done();
				});
		});
	});

	describe('when retrieving details for a build', function() {

		let build;
		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				moderator: { roles: [ 'moderator' ] }
			}, function() {
				request
					.post('/api/v1/builds')
					.as('member')
					.send({ label: 'v1.0.0', type: 'release', platform: 'vp', major_version: '1' })
					.end(function(err, res) {
						build = res.body;
						hlp.expectStatus(err, res, 201);
						hlp.doomBuild('member', res.body.id);
						done();
					});
			});
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should fail when providing a non-existent ID', function(done) {
			request.get('/api/v1/builds/qwerz').end(hlp.status(404, 'no such build', done));
		});

		it('succeed for an existing build', function(done) {
			request
				.get('/api/v1/builds/' + build.id)
				.save({ path: 'builds/view'})
				.end(function(err, res) {
					hlp.expectStatus(err, res, 200);
					expect(res.body.id).to.be.ok();
					done();
				});
		});
	});

	describe('when listing all builds', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should list the initially added builds', function(done) {
			request
				.get('/api/v1/builds')
				.save({ path: 'builds/list'})
				.end(function(err, res) {
					hlp.expectStatus(err, res, 200);
					expect(res.body).to.be.an('array');
					expect(res.body).to.not.be.empty();
					done();
				});
		});

		it('should list the unused self-added builds', function(done) {
			request
				.post('/api/v1/builds')
				.as('member')
				.send({ label: 'unused', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					hlp.doomBuild('member', res.body.id);
					request
						.get('/api/v1/builds')
						.as('member')
						.end(function(err, res) {
							hlp.expectStatus(err, res, 200);
							expect(res.body).to.be.an('array');
							expect(res.body).to.not.be.empty();
							expect(res.body.find(b => b.label === 'unused')).to.not.be.empty();
							done();
						});
				});
		});

		it('should list the unused self-added builds', function(done) {
			request
				.post('/api/v1/builds')
				.as('member')
				.send({ label: 'another-unused', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					hlp.doomBuild('member', res.body.id);
					request
						.get('/api/v1/builds')
						.end(function(err, res) {
							hlp.expectStatus(err, res, 200);
							expect(res.body).to.be.an('array');
							expect(res.body).to.not.be.empty();
							expect(res.body.find(b => b.label === 'another-unused')).to.be(undefined);
							done();
						});
				});
		});
	});

	describe('when deleting a build', function() {

		before(function(done) {
			hlp.setupUsers(request, {
				member: { roles: [ 'member' ] },
				contributor: { roles: [ 'contributor' ] },
				moderator: { roles: [ 'moderator' ] }
			}, done);
		});

		after(function(done) {
			hlp.cleanup(request, done);
		});

		it('should succeed as member and owner', function(done) {
			request
				.post('/api/v1/builds')
				.as('member')
				.send({ label: 'delete-test-1', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					request
						.del('/api/v1/builds/' + res.body.id)
						.as('member')
						.end(function(err, res) {
							hlp.expectStatus(err, res, 204);
							done();
						});
				});
		});

		it('should fail for non-existent build', function(done) {
			request
				.del('/api/v1/builds/sabbelnich')
				.as('member')
				.end(hlp.status(404, 'no such build', done));
		});

		it('should fail as member and not owner', function(done) {
			request
				.post('/api/v1/builds')
				.as('contributor')
				.send({ label: 'delete-test-2', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					hlp.doomBuild('contributor', res.body.id);
					request
						.del('/api/v1/builds/' + res.body.id)
						.saveResponse({ path: 'builds/del'})
						.as('member')
						.end(function(err, res) {
							hlp.expectStatus(err, res, 403);
							done();
						});
				});
		});

		it('should fail as contributor and not owner', function(done) {
			request
				.post('/api/v1/builds')
				.as('member')
				.send({ label: 'delete-test-3', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					hlp.doomBuild('member', res.body.id);
					request
						.del('/api/v1/builds/' + res.body.id)
						.as('contributor')
						.end(hlp.status(403, done));
				});

		});

		it('should succeed as moderator and not owner', function(done) {
			request
				.post('/api/v1/builds')
				.as('member')
				.send({ label: 'delete-test-4', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					request
						.del('/api/v1/builds/' + res.body.id)
						.as('moderator')
						.end(hlp.status(204, done));
				});

		});

		it('should fail when build is linked to a release', function(done) {
			request
				.post('/api/v1/builds')
				.as('member')
				.send({ label: 'delete-test-5', type: 'release', platform: 'vp', major_version: '1' })
				.end(function(err, res) {
					hlp.expectStatus(err, res, 201);
					hlp.doomBuild('member', res.body.id);
					hlp.release.createRelease('member', request, { buildId: res.body.id }, () => {
						request
							.del('/api/v1/builds/' + res.body.id)
							.as('member')
							.end(hlp.status(400, 'Cannot delete referenced build', done));
					});
				});

		});

	});

});