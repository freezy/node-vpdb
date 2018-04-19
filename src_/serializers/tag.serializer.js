const _ = require('lodash');
const Serializer = require('../../src/common/serializer');
const UserSerializer = require('../../src/users/user.serializer');

class TagSerializer extends Serializer {

	/** @protected */
	_simple(doc, req, opts) {
		const tag = _.pick(doc, ['id', 'name', 'description']);

		// created_by
		if (this._populated(doc, '_created_by')) {
			tag.created_by = UserSerializer.reduced(tag._created_by, req, opts);
		}

		return tag;
	}
}

module.exports = new TagSerializer();