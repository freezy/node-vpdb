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

import { intersection, isObject, upperFirst } from 'lodash';
import Router, { IRouterOptions } from 'koa-router';
import pathToRegexp from 'path-to-regexp';

import { state } from '../state';
import { logger } from './logger';
import { Context } from './types/context';
import { User } from '../users/user';
import { Release } from '../releases/release';
import { MetricsModel } from 'mongoose';

/**
 * An in-memory cache using Redis.
 *
 * It's used as a middleware in Koa. Routes must enable caching explicitly.
 * Invalidation is done with tags.
 *
 * Counters are cached separately. That means viewing, downloading etc doesn't
 * invalidate the cache. See {@link CacheCounterConfig} for more details.
 *
 * Procedure when adding a cache to a route:
 *   1. Go through all end points performing a *write* operation.
 *   2. Check if the route is affected by the operation. Besides obvious
 *      changes of the entity, check:
 *      - User downloads, votes & rating (does the payload contain counters?)
 *      - Parent entities containing the object (release update invalidates
 *        the release' game)
 *   3. If that's the case, make sure the route's matched when invalidating in
 *      the end point.
 */
class ApiCache {

	private readonly redisPrefix = 'api-cache:';
	private readonly cacheRoutes: CacheRoute<any>[] = [];

	/**
	 * The middleware. Stops the chain on cache hit or continues and saves
	 * result to cache, if enabled.
	 *
	 * @param {Context} ctx Koa context
	 * @param {() => Promise<any>} next Next middleware
	 */
	public async middleware(ctx: Context, next: () => Promise<any>) {

		// if not a GET or HEAD operation, abort.
		if (ctx.request.method !== 'GET' && ctx.request.method !== 'HEAD') {
			return await next();
		}

		// check if enabled for this route
		const cacheRoute = this.cacheRoutes.find(route => route.regex.test(ctx.request.path));
		if (!cacheRoute) {
			return await next();
		}

		// retrieve the cached response
		const key = this.getCacheKey(ctx);
		const hit = await state.redis.getAsync(key);

		if (hit) {
			const response = JSON.parse(hit) as CacheResponse;
			const body = isObject(response.body) ? response.body : JSON.parse(response.body);

			// update counters
			if (cacheRoute.counters) {
				const refs: { counter:CacheCounterConfig<any>, key: string, id: string, c: string }[] = [];
				for (const counter of cacheRoute.counters) {
					for (const c of counter.counters) {
						const counters = counter.get(body, c);
						for (const id of Object.keys(counters)) {
							refs.push({ key: this.getCounterKey(counter.model, id, c), id, c, counter });
						}
					}
					// update db of view counter
					if (counter.incrementCounter) {
						await (state.models[upperFirst(counter.model)] as MetricsModel<any>).incrementCounter(counter.incrementCounter.getId(body), counter.incrementCounter.counter);
					}
				}
				const values = await state.redis.mgetAsync.apply(state.redis, refs.map(r => r.key));
				for (let i = 0; i < values.length; i++) {
					if (values[i]) {
						refs[i].counter.set(body, refs[i].c, { [refs[i].id]: parseInt(values[i]) });
					}
				}
			}

			ctx.status = response.status;
			ctx.set('X-Cache-Api', 'HIT');
			// todo add auth headers such as x-token-refresh

			// if request body was a string it was prettified, so let's do that again.
			if (!isObject(response.body)) {
				ctx.response.body = JSON.stringify(body, null, '  ');
			} else {
				ctx.response.body = body;
			}
			return;
		}
		ctx.set('X-Cache-Api', 'MISS');

		await next();

		// only cache successful responses
		if (ctx.status >= 200 && ctx.status < 300) {
			await this.setCache(ctx, key, cacheRoute);
		}
	}

	/**
	 * Enables caching for the given route.
	 *
	 * The config defines how caches on that route are tagged for invalidation.
	 *
	 * @param {Router} router Router
	 * @param {string} path Path of the route (same passed to the router)
	 * @param {CacheInvalidationTag} config How responses from the route get invalidated.
	 * @param {CacheCounterConfig} counters
	 */
	public enable<T>(router: Router, path: string, config: CacheInvalidationConfig, counters?:CacheCounterConfig<T>[]) {
		const opts = (router as any).opts as IRouterOptions;
		this.cacheRoutes.push({ regex: pathToRegexp(opts.prefix + path), config: config, counters: counters });
	}

	/**
	 * Updates a counter cache.
	 *
	 * @param {string} entity Entity name, e.g. 'game'.
	 * @param {string} entityId ID of the entity to update
	 * @param {string} counterName Name of the counter, e.g. 'view'.
	 * @param {boolean} decrement If true, don't increment but decrement.
	 */
	public async incrementCounter(entity:string, entityId:string, counterName:string, decrement:boolean) {
		const key = this.getCounterKey(entity, entityId, counterName);
		if (decrement) {
			await state.redis.decrAsync(key);
		} else {
			await state.redis.incrAsync(key);
		}
	}

	public async invalidateRelease(release?: Release) {
		if (release) {
			await this.invalidateEntity('release', release.id);
		} else {
			await this.invalidate([{ resources: ['release'] }]);
		}
	}

	public async invalidateReleaseComment(release: Release) {
		await this.invalidate([{ entities: { releaseComment: release.id } }]);
	}

	/**
	 * Clears all caches listing the given entity and the entity's details.
	 *
	 * @param {string} entity Entity name, e.g. 'release', 'game'.
	 * @param {string} entityId ID of the entity
	 */
	public async invalidateEntity(entity: string, entityId: string) {
		await this.invalidate([{ resources: [entity], entities: { [entity]: entityId } }]);
	}

	/**
	 * Invalidates a cache.
	 *
	 * The tags describe how the cache is invalidated. Every
	 * `CacheInvalidationTag` is an operator in a logical `and`, while its attributes
	 * compose an `or` condition.
	 *
	 * @param {CacheInvalidationTag[][]} tagLists
	 * @return {Promise<number>}
	 */
	private async invalidate(...tagLists: CacheInvalidationTag[][]): Promise<number> {

		const now = Date.now();
		const keys:string[][] = [];
		const allRefs:string[][][] = [];
		let invalidationKeys = new Set<string>();
		for (let i = 0; i < tagLists.length; i++) {
			const tags = tagLists[i];
			allRefs[i] = [];
			for (const tag of tags) {
				const refs: string[] = [];

				// resources
				if (tag.resources) {
					for (const resource of tag.resources) {
						refs.push(this.getResourceKey(resource));
					}
				}
				// entities
				if (tag.entities) {
					for (const entity of Object.keys(tag.entities)) {
						refs.push(this.getEntityKey(entity, tag.entities[entity]));
					}
				}
				// user
				if (tag.user) {
					refs.push(this.getUserKey(tag.user));
				}
				allRefs[i].push(refs);
				keys.push(await state.redis.sunionAsync(...refs));
			}
			invalidationKeys = new Set([...invalidationKeys, ...intersection(...keys)]); // redis could do this too using SUNIONSTORE to temp sets and INTER them
		}
		logger.info('[Cache.invalidate]: Invalidating caches: (%s).',
			'(' + allRefs.map(r => '(' + r.map(r => r.join(' || ')).join(') && (') + ')').join(') || (') + ')');

		let n = 0;
		for (const key of invalidationKeys) {
			await state.redis.delAsync(key);
			n++;
		}
		logger.info('[Cache.invalidate]: Cleared %s caches in %sms.', n, Date.now() - now);
		return n;
	}

	/**
	 * Invalidates all caches.
	 * @see https://github.com/galanonym/redis-delete-wildcard/blob/master/index.js
	 * @return {Promise<number>} Number of invalidated caches
	 */
	public async invalidateAll(): Promise<number> {
		const num = await state.redis.evalAsync(
			"local keysToDelete = redis.call('keys', ARGV[1]) " + // find keys with wildcard
			"if unpack(keysToDelete) ~= nil then " +              // if there are any keys
			"return redis.call('del', unpack(keysToDelete)) " +   // delete all
			"else " +
			"return 0 " +                                         // if no keys to delete
			"end ",
			0,                                                    // no keys names passed, only one argument ARGV[1]
			this.redisPrefix + '*');
		return num as number;
	}

	/**
	 * Caches a miss.
	 *
	 * @param {Context} ctx Koa context
	 * @param {string} key Cache key
	 * @param {CacheRoute} cacheRoute Route where the miss occurred
	 */
	private async setCache<T>(ctx: Context, key: string, cacheRoute: CacheRoute<T>) {

		const now = Date.now();
		const refs:string[] = [];
		const refPairs:any[] = [];
		const response: CacheResponse = {
			status: ctx.status,
			headers: ctx.headers,
			body: ctx.response.body
		};

		// set the cache todo set ttl to user caches
		await state.redis.setAsync(key, JSON.stringify(response));

		// reference resources
		if (cacheRoute.config.resources) {
			for (const resource of cacheRoute.config.resources) {
				const refKey = this.getResourceKey(resource);
				refPairs.push(refKey);
				refPairs.push(this.getResourceKey(resource));
				refs.push(refKey);
			}
		}

		// reference entities
		if (cacheRoute.config.entities) {
			for (const entity of Object.keys(cacheRoute.config.entities)) {
				const refKey = this.getEntityKey(entity, ctx.params[cacheRoute.config.entities[entity]]);
				refPairs.push(refKey);
				refPairs.push(key);
				refs.push(refKey);
			}
		}

		// reference user
		if (ctx.state.user) {
			const refKey = this.getUserKey(ctx.state.user);
			refPairs.push(refKey);
			refPairs.push(key);
			refs.push(refKey);
		}

		// save counters
		let numCounters = 0;
		if (cacheRoute.counters) {
			const body = isObject(ctx.response.body) ? ctx.response.body : JSON.parse(ctx.response.body);
			for (const counter of cacheRoute.counters) {
				for (const c of counter.counters) {
					const counters = counter.get(body, c);
					for (const id of Object.keys(counters)) {
						refPairs.push(this.getCounterKey(counter.model, id, c));
						refPairs.push(parseInt(counters[id] as any));
						numCounters++;
					}
				}
			}
		}
		await state.redis.msetAsync.apply(state.redis, refPairs);
		logger.debug('[Cache] No hit, saved as "%s" with references [ %s ] and %s counters in %sms.', key, refs.join(', '), numCounters, Date.now() - now);
	}

	private getCacheKey(ctx: Context): string {
		const normalizedQuery = this.normalizeQuery(ctx);
		return this.redisPrefix + (ctx.state.user ? ctx.state.user.id : 'anon') + ':' + ctx.request.path + (normalizedQuery ? '?' : '') + normalizedQuery;
	}

	private getResourceKey(resource: string): string {
		return this.redisPrefix + 'resource:' + resource;
	}

	private getEntityKey(entity: string, entityId: string): string {
		return this.redisPrefix + 'entity:' + entity + ':' + entityId;
	}

	private getUserKey(user: User): string {
		return this.redisPrefix + 'user:' + user.id;
	}

	private getCounterKey(entity:string, entityId:string, counter:string) {
		return this.redisPrefix + 'counter:' + entity + ':' + counter + ':' + entityId;
	}

	private normalizeQuery(ctx: Context) {
		return Object.keys(ctx.query).sort().map(key => key + '=' + ctx.query[key]).join('&');
	}
}

/**
 * Defines how to invalidate cached responses from a given route.
 */
interface CacheRoute<T> {
	regex: RegExp;
	config: CacheInvalidationConfig;
	counters: CacheCounterConfig<T>[];
}

/**
 * Defines which caches to invalidate.
 *
 * If multiple properties are set, all of them are applied (logical `or`).
 */
export interface CacheInvalidationTag {
	/**
	 * Invalidate one or multiple resources.
	 * All caches tagged with any of the provided resources will be invalidated.
	 */
	resources?: string[],
	/**
	 * Invalidate a specific entity.
	 * The key is the entity's name and the value its parsed ID.
	 * All caches tagged with the entity and ID will be invalidated.
	 */
	entities?: { [key: string]: string; };
	/**
	 * Invalidate user-specific caches.
	 * All caches for that user will be invalidated.
	 */
	user?: User;
}

export interface CacheInvalidationConfig {
	/**
	 * Reference one or multiple resources.
	 *
	 * Multiple resources are needed if a resource is dependent on another
	 * resource, e.g. the games resource which also includes releases and
	 * users.
	 */
	resources?: string[],

	/**
	 * Reference a specific entity.
	 * The key is the entity's name and the value how it's parsed from the URL
	 * (`:id` becomes `id`).
	 */
	entities?: { [key: string]: string; };
}

/**
 * Defines how to handle counters for a given model within a response body.
 *
 * Counter caching works like that:
 *
 * On miss,
 *   1. Response body is computed
 *   2. Using {@link CacheCounterConfig.get}, cache values are retrieved for
 *      every model's counter, using a config for each model
 *   3. Every counter gets a Redis key with the current count.
 *
 * On hit,
 *   1. Response body is retrieved from cache
 *   2. Using {@link CacheCounterConfig.get}, objects that need to be updated
 *      are retrieved for all counters.
 *   3. For those counters, current values are read from Redis.
 *   4. Using {@link CacheCounterConfig.set}, these values are applied to the
 *      cached response body.
 *
 * View counters are a special case because they should get bumped even if a
 * response gets served from the cache, where the API completely skipped.
 * That's what {@link CacheCounterConfig.incrementCounter} is for. If set, the
 * cache middleware will bump the given counter with the provided ID.
 *
 * On non-cached bumps, the metrics module will run {@link ApiCache.incrementCounter},
 * which updates the Redis cache so previously cached responses are up-to-date.
 */
export interface CacheCounterConfig<T> {

	/**
	 * Name of the model the counter is linked to.
	 */
	model: string;

	/**
	 * The counters defined for that model, e.g. [ "downloads", "views" ]
	 */
	counters: string[];

	/**
	 * A function that takes the response body and returns key-value pairs with
	 * entity ID and counter value for the given counter of all model
	 * occurrences of the given body.
	 *
	 * @param {T} response Response body computed by the last middleware
	 * @param {string} counter Counter name, e.g. "views"
	 * @returns {CacheCounterValues} Counter values of all entities in the response body for given counter
	 */
	get: (response:T, counter:string) => CacheCounterValues;

	/**
	 * A function that updates the counters of all occurrences of the given
	 * model for the given counter in a previously cached response body.
	 *
	 * @param {T} response Response body coming from cache
	 * @param {string} counter Counter name, e.g. "views"
	 * @param {CacheCounterValues} values Updated counter values of all entities in the response body for given counter
	 */
	set: (response:T, counter:string, values:CacheCounterValues) => void;

	/**
	 * If set, increments a counter even if fetched from cache.
	 */
	incrementCounter?: {

		/**
		 * Name of the counter, e.g. "views".
		 */
		counter: string;

		/**
		 * Returns the ID of the entity whose counter to increment.
		 * @param {T} response Response body coming from cache
		 * @return {string} ID of the entity
		 */
		getId: (response:T) => string;
	}
}
export type CacheCounterValues = { [key:string]: number };

interface CacheResponse {
	status: number;
	headers: { [key: string]: string };
	body: any;
}

export const apiCache = new ApiCache();