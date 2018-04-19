/*
 * VPDB - Visual Pinball Database
 * Copyright (C) 2016 freezy <freezy@xbmc.org>
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

const _ = require('lodash');
const logger = require('winston');
const quotaModule = require('volos-quota-redis');

const error = require('./error')('quota');
const config = require('../../src/common/settings').current;
const quotaConfig = config.vpdb.quota;

class Quota {

	/**
	 * Initializes quota plans
	 */
	init() {
		logger.info('[quota] Initializing quotas...');
		let duration;
		this.quota = {};

		// we create a quota module for each duration
		quotaConfig.plans.forEach(plan => {
			if (plan.unlimited === true) {
				logger.info('[quota] Skipping unlimited plan "%s".', plan.id);
				return;
			}
			duration = plan.per;
			if (!this.quota[duration]) {
				logger.info('[quota] Setting up quota per %s for plan %s...', duration, plan.id);
				this.quota[duration] = quotaModule.create({
					timeUnit: duration,
					interval: 1,
					host: config.vpdb.redis.host,
					port: config.vpdb.redis.port,
					db: config.vpdb.redis.db
				});
				Promise.promisifyAll(this.quota[duration]);
			} else {
				logger.info('[quota] Not setting up plan %s because volos needs setups per duration and we already set up per %s.', plan.id, duration);
			}
		});
	}

	/**
	 * Returns the current rate limits for the given user.
	 *
	 * @param user
	 * @param {function} [callback]
	 * @returns {Promise.<{ unlimited: boolean, period: String, limit: Number, remaining: Number, reset: Number }>}
	 */
	getCurrent(user) {

		let plan = user.planConfig;
		if (!plan) {
			throw new Error('Unable to find plan "%s" for user.', user._plan);
		}

		// unlimited?
		if (plan.unlimited === true) {
			return Promise.resolve({ unlimited: true, limit: 0, period: 'never', remaining: 0, reset: 0 });
		}

		return Promise.try(() => {

			// TODO fix when fixed: https://github.com/apigee-127/volos/issues/33
			return this.quota[plan.per].applyAsync({
				identifier: user.id,
				weight: -2,
				allow: plan.credits
			});

		}).then(() => {

			return this.quota[plan.per].applyAsync({
				identifier: user.id,
				weight: 2,
				allow: plan.credits
			});

		}).then(result => {

			return {
				unlimited: false,
				period: plan.per,
				limit: result.allowed,
				remaining: result.allowed - result.used,
				reset: result.expiryTime
			};

		});
	}

	/**
	 * Checks if there is enough quota for the given file and consumes the quota.
	 *
	 * It also adds the rate limit headers to the request.
	 *
	 * @param {object} req Request
	 * @param {object} res Response
	 * @param {File|File[]} files File(s) to check for
	 * @param {function} [callback] Callback with `err` and `isAllowed`
	 * @returns {Promise.<boolean>}
	 */
	isAllowed(req, res, files) {

		if (!_.isArray(files)) {
			files = [ files ];
		}

		// deny access to anon (wouldn't be here if there were only free files)
		if (!req.user) {
			return Promise.resolve(false);
		}

		let plan = req.user.planConfig;
		if (!plan) {
			return Promise.reject(error('No quota defined for plan "%s"', req.user._plan));
		}

		// allow unlimited plans
		if (plan.unlimited === true) {
			return Promise.resolve(true);
		}

		const sum = this.getTotalCost(files);

		// don't even check quota if weight is 0
		if (sum === 0) {
			return Promise.resolve(true);
		}

		// https://github.com/apigee-127/volos/tree/master/quota/common#quotaapplyoptions-callback
		return this.quota[plan.per].applyAsync({
			identifier: req.user.id,
			weight: sum,
			allow: plan.credits

		}).then(result => {
			logger.info('[quota] Quota check for %s credit(s) %s on <%s> for %d file(s) with %d quota left for another %d seconds (plan allows %s per %s).', sum, result.isAllowed ? 'passed' : 'FAILED', req.user.email, files.length, result.allowed - result.used, Math.round(result.expiryTime / 1000), plan.credits, plan.per);
			res.set({
				'X-RateLimit-Limit': result.allowed,
				'X-RateLimit-Remaining': result.allowed - result.used,
				'X-RateLimit-Reset': result.expiryTime
			});
			return result.isAllowed;

		});
	}


	/**
	 * Sums up the const of a given list of files.
	 * @param files Files
	 * @returns {number}
	 */
	getTotalCost(files) {
		let file, sum = 0;
		for (let i = 0; i < files.length; i++) {
			file = files[i];
			let cost = this.getCost(file);

			// a free file
			if (cost === 0) {
				continue;
			}

			sum += cost;
		}
		return sum;
	}

	/**
	 * Returns the cost of a given file and variation.
	 *
	 * @param {File} file File
	 * @param {string|object} [variation] Optional variation
	 * @returns {*}
	 */
	getCost(file, variation) {

		if (!file.file_type) {
			logger.error(require('util').inspect(file));
			throw new Error('File object must be populated when retrieving costs.');
		}

		const variationName = _.isObject(variation) ? variation.name : variation;
		let cost = quotaConfig.costs[file.file_type];

		// undefined file_types are free
		if (_.isUndefined(cost)) {
			logger.warn('[quota] Undefined cost for file_type "%s".', file.file_type);
			return 0;
		}

		// if a variation is demanded and cost contains variation def, ignore the rest.
		if (variationName && !_.isUndefined(cost.variation)) {
			if (_.isObject(cost.variation)) {
				if (_.isUndefined(cost.variation[variationName])) {
					if (_.isUndefined(cost.variation['*'])) {
						logger.warn('[quota] No cost defined for %s file of variation %s and no fallback given, returning 0.', file.file_type, variationName);
						return 0;
					}
					cost = cost.variation['*'];
				} else {
					cost = cost.variation[variationName];
				}
			} else {
				return cost.variation;
			}
		}

		if (_.isObject(cost)) {
			if (_.isUndefined(cost.category)) {
				logger.warn('[quota] No cost defined for %s file (type is undefined).', file.file_type, file.getMimeCategory(variation));
				return 0;
			}
			if (_.isObject(cost.category)) {
				const costCategory = cost.category[file.getMimeCategory(variation)];
				if (_.isUndefined(costCategory)) {
					if (_.isUndefined(cost.category['*'])) {
						logger.warn('[quota] No cost defined for %s file of type %s and no fallback given, returning 0.', file.file_type, file.getMimeCategory(variation));
						return 0;
					}
					return cost.category['*'];
				}
				return costCategory;
			}
			return cost.category;
		}
		return cost;
	}
}

module.exports = new Quota();