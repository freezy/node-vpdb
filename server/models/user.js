var _ = require('underscore');
var crypto = require('crypto');
var mongoose = require('mongoose');
var validator = require('validator');

var config = require('../modules/settings').current;
var Schema = mongoose.Schema;

// schema
var fields = {
	name:         { type: String, required: true }, // display name, equals username when locally registering
	username:     { type: String, unique: true },
	email:        { type: String, lowercase: true, unique: true },
	provider:     { type: String, required: true },
	passwordHash: { type: String },
	salt:         { type: String },
	thumb:        { type: String },
	active:       { type: Boolean, required: true, default: true }
};

// provider data fields
if (config.vpdb.passport.github.enabled) {
	fields['github'] = {};
}
_.each(config.vpdb.passport.ipboard, function(ipbConfig) {
	if (ipbConfig.enabled) {
		fields[ipbConfig.id] = {};
	}
});
var UserSchema = new Schema(fields);

// virtuals
UserSchema.virtual('password')
	.set(function(password) {
		this._password = password;
		this.salt = this.makeSalt();
		this.passwordHash = this.encryptPassword(password);
	})
	.get(function() {
		return this._password
	});

// middleware
UserSchema.pre('validate', function(next) {
	if (this.isNew && !this.name && this.username) {
		this.name = this.username;
	}
	next();
});

// validations
UserSchema.path('name').validate(function(name) {
	// if you are authenticating by any of the oauth strategies, don't validate
	if (this.provider != 'local') {
		return true;
	}
	return validator.isLength(name, 3, 30);
}, 'Name must be between 3 and 30 characters.');

UserSchema.path('email').validate(function(email) {
	// if you are authenticating by any of the oauth strategies, don't validate
	if (this.provider != 'local') {
		return true;
	}
	return validator.isEmail(email);
}, 'Email must be in the correct format.');

UserSchema.path('username').validate(function(username) {
	// if you are authenticating by any of the oauth strategies, don't validate
	if (this.provider != 'local') {
		return true;
	}
	if (!validator.isAlphanumeric(username)) {
		this.invalidate('username', 'Username must only contain alpha-numeric characters.');
	}
	if (!validator.isLength(username, 3, 30)) {
		this.invalidate('username', 'Length of username must be between 3 and 30 characters.');
	}
}, null);

UserSchema.path('provider').validate(function(provider) {

	// validate presence of password. can't do that in the password validator
	// below because it's not run when there's no value (and it can be null,
	// if auth strategy is not local). so do it here, invalidate password if
	// necessary but return true so provider passes.
	if (this.isNew && provider == 'local') {
		if (!this._password) {
			this.invalidate('password', 'Password is required.');
		}
		// idem for username
		if (!this.username) {
			this.invalidate('username', 'Username is required.');
		}
		return true;
	}
}, null);

UserSchema.path('passwordHash').validate(function() {
	// here we check the length. remember that the virtual _password field is
	// the one that triggers the hashing.
	if (this.isNew && this._password && !validator.isLength(this._password, 6)) {
		this.invalidate('password', 'Password must be at least 6 characters.');
	}
}, null);


// methods
UserSchema.methods = {

	/**
	 * Authenticate - check if the passwords are the same
	 *
	 * @param {String} plainText
	 * @return {Boolean}
	 * @api public
	 */
	authenticate: function(plainText) {
		return this.encryptPassword(plainText) === this.passwordHash;
	},

	/**
	 * Make salt
	 *
	 * @return {String}
	 * @api public
	 */
	makeSalt: function() {
		return Math.round((new Date().valueOf() * Math.random())) + '';
	},

	/**
	 * Encrypt password
	 *
	 * @param {String} password
	 * @return {String}
	 * @api public
	 */
	encryptPassword: function(password) {
		if (!password) {
			return '';
		}
		return crypto.createHmac('sha1', this.salt).update(password).digest('hex');
	}
};

mongoose.model('User', UserSchema);
