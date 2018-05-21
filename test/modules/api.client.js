const util = require('util');
const axios = require('axios');
const faker = require('faker');
const stringify = require('json-stable-stringify');
const randomstring = require('randomstring');
const existsSync = require('fs').existsSync;
const mkdirSync = require('fs').mkdirSync;
const writeFileSync = require('fs').writeFileSync;
const assign = require('lodash').assign;
const pick = require('lodash').pick;
const keys = require('lodash').keys;
const get = require('lodash').get;
const isString = require('lodash').isString;
const isObject = require('lodash').isObject;

const ApiClientResult = require('./api.client.result');

class ApiClient {

	constructor(opts) {

		opts = opts || {};

		this._users = new Map();
		this._tokens = new Map();

		/**
		 * @callback action
		 * @param {ApiClientResult} res
		 */
		/**
		 * Functions executed after the request.
		 * @type {Array.<action>}
		 * @private
		 */
		this._actions = [];

		/**
		 * Teardown actions executed in the teardown block of the test.
		 *
		 * @type {Array.<{[path]:string, [url]:string, [authHeader]:string, [user]:string }>}
		 * @property {string} path Absolute path (without `basePath`) to the DELETE resource, incl ID
		 * @property {string} url An absolute URL starting with "http(s)://". Use instead of `path`.
		 * @property {string} user User reference to authenticate with.
		 * @property {string} authHeader The entire auth header value, e.g. "Bearer 1234abcd". Use instead of `user`.
		 * @private
		 */
		this._tearDown = [];

		const scheme = opts.scheme || process.env.HTTP_SCHEME || 'http';
		const host = opts.host || process.env.HOST || 'localhost';
		const port = opts.port || process.env.PORT || 7357;
		const path = opts.path || process.env.API_PATH || '/api';
		this._baseUrl = scheme + '://' + host + ':' + port;
		this._authHeader = opts.authHeader || process.env.AUTH_HEADER || 'Authorization';
		this._apis = {
			'/api': 'api.vpdb.io',
			'/storage': 'storage.vpdb.io',
		};
		this._saveOpts = {
			root: opts.saveRoot || 'doc/api/v1',
			ignoreReqHeaders: opts.ignoreReqHeaders || ['cookie', 'host', 'user-agent', 'connection'],
			ignoreResHeaders: opts.ignoreResHeaders || ['access-control-allow-origin', 'access-control-expose-headers', 'x-token-refresh', 'x-user-dirty', 'vary', 'connection', 'transfer-encoding', 'date', 'x-app-sha']
		};

		/**
		 * The configuration object for the next request.
		 * Reset after each request.
		 *
		 * @property {string} url Server URL that will be used for the request
		 * @property {string} method Request method to be used when making the request
		 * @property {string} [baseURL] Will be prepended to `url` unless `url` is absolute.
		 * @property {function} [transformRequest] Allows changes to the request data before it is sent to the server.
		 * @property {function} [transformResponse] Allows changes to the response data to be made before it is passed to then/catch
		 * @property {Object<string, string>} [headers] Custom headers to be sent
		 * @property {Object<string, string>} [params] URL parameters to be sent with the request
		 * @property {function} [paramsSerializer] Optional function in charge of serializing `params`
		 * @property {any} [data] Data to be sent as the request body
		 * @property {number} [timeout] Number of milliseconds before the request times out.
		 * @property {boolean} [withCredentials] Indicates whether or not cross-site Access-Control requests should be made using credentials
		 * @property {function} [adapter] Allows custom handling of requests which makes testing easier.
		 * @property {Object} [auth] indicates that HTTP Basic auth should be used, and supplies credentials.
		 * @property {string} [auth.username] Username
		 * @property {string} [auth.password] Password
		 * @property {"arraybuffer"|"blob"|"document"|"json"|"text"|"stream"} [responseType] Indicates the type of data that the server will respond with
		 * @property {string} [xsrfCookieName] The name of the cookie to use as a value for xsrf token
		 * @property {string} [xsrfHeaderName] The name of the http header that carries the xsrf token value
		 * @property {function} [onUploadProgress] Allows handling of progress events for uploads
		 * @property {function} [onDownloadProgress] Allows handling of progress events for downloads
		 * @property {number} [maxContentLength] Defines the max size of the http response content allowed
		 * @property {function} [validateStatus] Defines whether to resolve or reject the promise for a given HTTP response status code
		 * @property {number} [maxRedirects] Defines the maximum number of redirects to follow in node.js.
		 * @property {string} [socketPath] Defines a UNIX Socket to be used in node.js
		 * @property {string} [httpAgent] Define a custom agent to be used when performing http requests
		 * @property {string} [httpsAgent] Define a custom agent to be used when performing https requests
		 * @property {Object} [proxy] Defines the hostname and port of the proxy server
		 * @property {CancelToken} [cancelToken] Specifies a cancel token that can be used to cancel the request
		 * @private
		 */
		this._config = {};
		this._baseConfig = {
			baseURL: this._baseUrl + path,
			validateStatus: status => status >= 200
		};
		this.api = axios.create();
	}

	/**
	 * Creates a bunch of users.
	 *
	 * Note that this must be run when there's no user in the database, i.e.
	 * after {@link teardownUsers} has been run.
	 *
	 * @param  {Object.<string, Object>} [users] Users with name and attributes
	 * @return {Promise<void>}
	 */
	async setupUsers(users) {

		// create root user first
		await this.createUser('__root', { name: 'root', email: 'root@vpdb.io', roles: ['root', 'mocha' ] });

		// create other users
		for (let key of keys(users || {})) {
			await this.createUser(key, users[key])
		}
	}

	/**
	 * Retrieves a previously created user object.
	 * @param {string} user User identifier
	 * @returns {object}
	 */
	getUser(user) {
		if (!this._users.has(user)) {
			throw Error('User "' + user + '" has not been created.');
		}
		return this._users.get(user);
	}

	/**
	 * Retrieves the token of a previously created user.
	 * @param {string} user User identifier
	 * @returns {string}
	 */
	getToken(user) {
		if (!this._tokens.has(user)) {
			throw Error('No available token for user "' + user + '".');
		}
		return this._tokens.get(user);
	}

	/**
	 * Sets which API to use for the request.
	 * @param {"api"|"storage"} api Which API to use
	 * @return {ApiClient}
	 */
	on(api) {
		this._config.baseURL = this._baseUrl + '/' + api
		return this;
	}

	/**
	 * Uses the root user token to authenticate.
	 * @return {ApiClient}
	 */
	asRoot() {
		return this.as('__root');
	}

	/**
	 * Use the authentication token of given user.
	 *
	 * The user must have been created with either {@link setupUsers} or
	 * {@link createUser}.
	 *
	 * @param {string|{token:string}} user User reference or user with populated `token`.
	 * @return {ApiClient}
	 */
	as(user) {
		if (isObject(user)) {
			if (!user.token) {
				throw new Error('Token must be set when using user object for authentication.');
			}
			return this.withToken(user.token);
		}
		if (!this._users.has(user)) {
			throw new Error('User "' + user + '" has not been created ([ ' + Array.from(this._users.keys()).join(', ') + ' ]).');
		}
		if (!this._tokens.has(user)) {
			throw new Error('No token or user "' + user + '".');
		}
		return this.withToken(this._tokens.get(user));
	}

	/**
	 * Use the given token as authentication bearer token.
	 * @param {string} token Token
	 * @returns {ApiClient}
	 */
	withToken(token) {
		return this.withHeader(this._authHeader, 'Bearer ' + token);
	}

	/**
	 * Adds a custom header to the request.
	 * @param {string} name Name of the header
	 * @param {string} value Value
	 * @return {ApiClient}
	 */
	withHeader(name, value) {
		if (!this._config.headers) {
			this._config.headers = {};
		}
		this._config.headers[name] = value;
		return this;
	}

	/**
	 * Sets the query parameters in the URL of the request.
	 * @param {Object<string, string>} params
	 * @returns {ApiClient}
	 */
	withQuery(params) {
		this._config.params = params;
		return this;
	}

	/**
	 * Sets the content type of the request.
	 * @param {string} contentType Content type
	 * @returns {ApiClient}
	 */
	withContentType(contentType) {
		return this.withHeader('Content-Type', contentType);
	}

	/**
	 * Saves the request to the documentation folder.
	 * @param {string} path Where to save the request, e.g. "users/post".
	 * @param {Object} [opts={}] Options
	 * @return {ApiClient}
	 */
	saveRequest(path, opts) {
		const out = [];
		const dest = this._getSaveFolder(this._saveOpts.root, path, '-req.json');
		this._actions.push(/** @type {ApiClientResult} */ res => {

			const prefix = Object.keys(this._apis).find(prefix => res.request.path.startsWith(prefix));

			out.push(res.request.method + ' ' + res.request.path.substr(prefix.length) + ' HTTP/2.0');
			out.push('Host: ' + this._apis[prefix]);

			const headers = res.request._header.trim().split('\r\n').map(line => line.split(': '));
			headers.shift();
			headers
				.filter(header => !this._saveOpts.ignoreReqHeaders.includes(header[0].toLowerCase()))
				.map(header => `${header[0]}: ${header[1]}`)
				.forEach(line => out.push(line));

			out.push('');
			if (res.config.data) {
				out.push(stringify(JSON.parse(res.config.data), { space: 3 }));
			}
			writeFileSync(dest, out.join('\r\n'));
		});
		return this;
	}

	/**
	 * Saves the response to the documentation folder.
	 * @param {string} path Where to save the request, e.g. "users/post".
	 * @param {Object} [opts={}] Options
	 * @return {ApiClient}
	 */
	saveResponse(path, opts) {
		const out = [];
		this._actions.push(/** @type {ApiClientResult} */ res => {
			const dest = this._getSaveFolder(this._saveOpts.root, path, '-res-' + res.status + '.json');
			out.push(`${res.status} ${res.statusText}`);

			const headers = {};
			res.request.res.rawHeaders.forEach((val, index) => {
				if (index % 2 === 1) {
					headers[res.request.res.rawHeaders[index - 1]] = val;
				}
			});
			Object.keys(headers)
				.filter(header => !this._saveOpts.ignoreResHeaders.includes(header.toLowerCase()))
				.map(header => `${header}: ${headers[header]}`)
				.forEach(line => out.push(line));

			out.push('');
			if (res.data) {
				out.push(stringify(res.data, { space: 3 }));
			}
			writeFileSync(dest, out.join('\r\n'));
		});
		return this;
	}

	/**
	 * Saves request and response to the documentation folder.
	 *
	 * @param {string} path Where to save, e.g. "users/post".
	 * @param {Object} [opts={}] Options
	 * @return {ApiClient}
	 */
	save(path, opts) {
		this.saveRequest(path, opts);
		this.saveResponse(path, opts);
		return this;
	}

	/**
	 * Marks the current entity to be torn down after tests.
	 *
	 * @param {string|null} [pathToId="id"] Path to the attribute containing the ID field of the response.
	 * @param {string|null} [path] If the DELETE path differs from the original request, this overrides it.
	 * @param {string|null} [user] Use given user reference to tear down.
	 * @returns {ApiClient}
	 */
	markTeardown(pathToId, path, user) {
		if (!pathToId) {
			pathToId = 'id';
		}
		const trace = new Error();
		this._actions.push(res => {
			const teardown = { stack:trace.stack };
			if (path) {
				teardown.path = path + '/' + get(res.data, pathToId);
			} else {
				teardown.url = res.config.url + '/' + get(res.data, pathToId);
			}
			if (user) {
				teardown.user = user;
			} else if (res.config.headers.Authorization) {
				teardown.authHeader = res.config.headers.Authorization;
			} else {
				teardown.user = '__root';
			}
			this._tearDown.push(teardown);
		});
		return this;
	}

	/**
	 * Marks the current entity to be torn down after tests as root.
	 *
	 * @param {string|null} [pathToId="id"] Path to the attribute containing the ID field of the response.
	 * @param {string|null} [path] If the DELETE path differs from the original request, this overrides it.
	 * @returns {ApiClient}
	 */
	markRootTeardown(pathToId, path) {
		return this.markTeardown(pathToId, path, '__root');
	}

	/**
	 * Dumps a request/response log to the console.
	 *
	 * @returns {ApiClient}
	 */
	debug() {
		this._actions.push(res => console.log(res._logResponse()));
		return this;
	}

	/**
	 * Posts a resource to the VPDB backend.
	 * @param {string} path API path, usually starting with "/v1/..."
	 * @param {Object} data Request body
	 * @returns {Promise<ApiClientResult>}
	 */
	async post(path, data) {
		return await this._request({
			url: path,
			method: 'post',
			data: data
		});
	}

	/**
	 * Gets a resource from the VPDB backend.
	 * @param {string} path API path, usually starting with "/v1/..."
	 * @returns {Promise<ApiClientResult>}
	 */
	async get(path) {
		return await this._request({
			url: path,
			method: 'get',
		});
	}

	/**
	 * Puts a resource to the VPDB backend.
	 * @param {string} path API path, usually starting with "/v1/..."
	 * @param {Object} data Request body
	 * @returns {Promise<ApiClientResult>}
	 */
	async put(path, data) {
		return await this._request({
			url: path,
			method: 'put',
			data: data
		});
	}

	/**
	 * Patches a resource at the VPDB backend.
	 * @param {string} path API path, usually starting with "/v1/..."
	 * @param {Object} data Request body
	 * @returns {Promise<ApiClientResult>}
	 */
	async patch(path, data) {
		return await this._request({
			url: path,
			method: 'patch',
			data: data
		});
	}

	/**
	 * Deletes a resource at the VPDB backend.
	 * @param {string} path API path, usually starting with "/v1/..."
	 * @returns {Promise<ApiClientResult>}
	 */
	async del(path) {
		return await this._request({
			url: path,
			method: 'delete',
		});
	}

	/**
	 * Gets the response headers from a resource at the VPDB backend.
	 * @param {string} path API path, usually starting with "/v1/..."
	 * @returns {Promise<ApiClientResult>}
	 */
	async head(path) {
		return await this._request({
			url: path,
			method: 'head',
		});
	}

	/**
	 * Deletes are previously entities marked as tear down.
	 * @return {Promise<void>}
	 */
	async teardown() {
		for (let entity of this._tearDown.reverse()) {
			let req;
			if (entity.user) {
				req = this.as(entity.user);
			}
			if (entity.authHeader) {
				req = this.withHeader(this._authHeader, entity.authHeader);
			}
			if (!req) {
				console.log(entity);
				throw new Error('Must either set `user` or `authHeader` ("' + entity.user + '"/"' + entity.authHeader + '").');
			}
			try {
				await req.del(entity.path || entity.url).then(res => res.expectStatus(204));
			} catch (err) {
				if (entity.stack) {
					console.log(entity.stack)
				}
				throw err;
			}
		}
		this._users.clear();
		this._tokens.clear();
	}

	/**
	 * Creates a user to be deleted on teardown.
	 *
	 * Username, mail and password are randomly generated.
	 *
	 * @param {string} [name] User reference
	 * @param {Object} [attrs] User attributes to set
	 * @param {string} [attrs.name] Username
	 * @param {string} [attrs.email] Email
	 * @param {boolean} [attrs.is_active] If user is active
	 * @param {string[]} [attrs.roles] User roles
	 * @param {string} [attrs._plan] User roles
	 * @param {Object} [opts] Options
	 * @param {boolean} [opts.keepUnconfirmed] If set, user will stay with unconfirmed email and no auth token will be available
	 * @param {boolean} [opts.teardown=true] If set, teardown the user after tests
	 * @param {boolean} [opts.debug=false] If set, print request details
	 * @return {Promise<*>} Created user
	 */
	async createUser(name, attrs, opts) {

		if (isObject(name)) {
			opts = attrs || {};
			attrs = name;
			name = null;
		} else {
			attrs = attrs || {};
			opts = opts || {};
		}

		let user = this.generateUser(attrs);
		user.skipEmailConfirmation = !opts.keepUnconfirmed;

		// 1. create user
		let res = await this.post('/v1/users', user).then(res => res.expectStatus(201));
		user = assign(user, res.data);
		if (name) {
			this._users.set(name, assign(user, { _plan: user.plan.id }));
		}

		if (opts.teardown !== false) {
			this.tearDownUser(user.id);
		}

		// can't get token for unconfirmed user
		if (opts.keepUnconfirmed) {
			return user;
		}

		// 2. retrieve token
		res = await this.post('/v1/authenticate', pick(user, 'username', 'password')).then(res => res.expectStatus(200));
		if (name) {
			this._tokens.set(name, res.data.token);
		}
		user.token = res.data.token;

		// we received plan but need _plan for posting
		user._plan = user._plan || user.plan.id;

		// 3. update user
		user = assign(user, attrs);
		await this.asRoot().put('/v1/users/' + user.id, pick(user, [ 'name', 'email', 'username', 'is_active', 'roles', '_plan' ])).then(res => res.expectStatus(200));

		return user;
	}

	/**
	 * Creates a OAuth user to be deleted on teardown.
	 *
	 * @param {string} provider Provider ID. Must be one of the configured OAuth providers, currently: [ "github", "ipbtest" ].
	 * @param {Object} [attrs] User attributes to set
	 * @param {string|null} [name=null] Unique user reference. If set, user and token can be later retrieved in tests, useful for setups but usually unnecessary for in-test creation.
	 * @param {string|number} [attrs.id] User ID at provider
	 * @param {string} [attrs.name] Username
	 * @param {string[]} [attrs.emails] List of email addresses
	 * @param {string[]} [attrs.roles] User roles
	 * @param {string} [attrs._plan] User roles
	 * @param {Object} [opts] Options
	 * @param {boolean} [opts.teardown=true] If set, teardown the user after tests
	 * @return {Promise<{user:object, token:string}>} Response data
	 */
	async createOAuthUser(provider, attrs, name, opts) {

		opts = opts || [];
		attrs = attrs || [];
		if (name && this._users.has(name)) {
			throw new Error('User "' + name + '" already exists.');
		}

		// 1. create user
		const oAuthProfile = this.generateOAuthUser(provider, attrs);

		let res = await this.post('/v1/authenticate/mock', oAuthProfile).then(res => res.expectStatus(200));
		const user = res.data.user;
		if (name) {
			this._users.set(name, assign(user, { _plan: user.plan.id }));
			this._tokens.set(name, res.data.token);
		}
		if (opts.teardown !== false) {
			this.tearDownUser(user.id);
		}

		// 2. update user
		if (attrs.roles || attrs._plan) {
			assign(res.data.user, pick(attrs, ['roles', '_plan']));
			await this.asRoot()
				.put('/v1/users/' + user.id, pick(user, [ 'name', 'email', 'username', 'is_active', 'roles', '_plan' ]))
				.then(res => res.expectStatus(200));
		}
		return res.data;
	}

	/**
	 * Creates a storage token for a given user and path.
	 *
	 * @param {string} user User reference
	 * @param {string} path Absolute path, usually prefixed with `/storage`.
	 * @returns {Promise<string>} The created token
	 */
	async retrieveStorageToken(user, path) {
		return await this.as(user)
			.on('storage')
			.post('/v1/authenticate', { paths: path })
			.then(res => {
				res.expectStatus(200);
				return res.data[path];
			});
	};

	/**
	 * Retrieves the user profile from a given token response.
	 *
	 * @param {ApiClientResult} tokenResponse
	 * @returns {Promise<Object>} User profile
	 */
	async retrieveUserProfile(tokenResponse) {
		tokenResponse.expectStatus(200);
		if (!tokenResponse.data.token) {
			throw new Error('Parameter passed to retrieveUserProfile() must contain a valid token.')
		}
		return await this.withToken(tokenResponse.data.token).get('/v1/user').then(res => {
			res.expectStatus(200);
			return res.data;
		});
	}

	/**
	 * Marks a user to be deleted in teardown.
	 * @param {string} userId User ID
	 */
	tearDownUser(userId) {
		this._tearDown.push({ user: '__root', path: '/v1/users/' + userId });
	}

	/**
	 * Prints out a request.
	 * @param res
	 */
	inspect(res) {
		console.log(util.inspect(res, null, null, true));
	};

	/**
	 * Executes a request with the given config.
	 *
	 * @param requestConfig Request-specific config
	 * @returns {Promise<ApiClientResult>}
	 * @private
	 */
	async _request(requestConfig) {
		const config = {};
		assign(config, this._baseConfig, this._config, requestConfig);
		this._config = {};
		const res = new ApiClientResult(await this.api.request(config));
		this._actions.forEach(action => action(res));
		this._actions = [];
		return res;
	}


	/**
	 * Generates a user object that can be used to create a new user.
	 * @param {object} [attrs] Attributes to override generated data with
	 * @return {{username:string, password:string, email:string}} User data
	 */
	generateUser(attrs) {
		let username = '';
		do {
			username = faker.internet.userName().replace(/[^a-z0-9]+/gi, '');
		} while (username.length < 3);

		return assign({
			username: username,
			password: randomstring.generate(10),
			email: faker.internet.email().toLowerCase()
		}, attrs || {});
	}

	/**
	 * Returns the number of users currently created.
	 * @returns {number} Number of users
	 */
	numCreatedUsers() {
		return this._users.size;
	}

	/**
	 * Generates an OAuth user to be posted to /v1/authenticate/mock.
	 *
	 * @param {string} provider Provider ID. Must be one of the configured OAuth providers, currently: [ "github", "ipbtest" ].
	 * @param {Object} [attrs] User attributes to set
	 * @param {string|number} [attrs.id] User ID at provider
	 * @param {string} [attrs.name] Username
	 * @param {string} [attrs.displayName] Display Name
	 * @param {string[]|{ value:string }[]} [attrs.emails] List of email addresses
	 * @param {string[]} [attrs.roles] User roles
	 * @return {{ provider:string, profile: { provider:string, id:string|number, displayName:string, username:string, profileUrl:string, emails:{ value:string }[]}} Generated user
	 */
	generateOAuthUser(provider, attrs) {
		attrs = attrs || {};
		if (attrs.emails && attrs.emails.length > 0 && isString(attrs.emails[0])) {
			attrs.emails = attrs.emails.map(email => { return { value: email } });
		}
		const gen = this.generateUser(attrs);
		return {
			provider: provider,
			profile: {
				provider: provider,
				id: String(attrs.id || Math.floor(Math.random() * 100000)),
				displayName: attrs.displayName || faker.name.firstName() + ' ' + faker.name.lastName(),
				username: attrs.name || gen.username,
				profileUrl: 'https://' + provider + '.com/' + gen.username,
				emails: attrs.emails || [ { value: gen.email } ]
			}
		};
	}

	/**
	 * Returns the folder within the API documentation to create example dumps.
	 *
	 * @param {string} root Root of the API documentation
	 * @param {string} savePath Path to save to, e.g. "users/list"
	 * @param {string} suffix Suffix appended before the file extension
	 * @returns {string} Complete path
	 * @private
	 */
	_getSaveFolder(root, savePath, suffix) {
		const p = savePath.split('/', 2);
		root = root + '/' + p[0] + '/http';
		if (!existsSync(root)) {
			mkdirSync(root);
		}
		return root + '/' + p[1] + suffix;
	}

}

module.exports = ApiClient;