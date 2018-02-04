const _ = require('lodash');
const userAgentParser = require('ua-parser-js');
const Serializer = require('./serializer');

class TokenSerializer extends Serializer {

	/** @protected */
	_simple(doc, req, opts) {
		const token = _.pick(doc, ['id', 'label', 'type', 'scopes', 'provider', 'is_active', 'last_used_at', 'expires_at', 'created_at']);

		// parse name for browser string
		const browser = userAgentParser(doc.label);
		if (browser.browser.name && browser.os.name) {
			doc.browser = browser;
		}
		return token;
	}

	/** @protected */
	_detailed(doc, req, opts) {
		const token = this._simple(doc, req, opts);

		// token
		token.token = doc.token;

		return token;
	}
}

module.exports = new TokenSerializer();