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

import chalk from 'chalk';
import hasAnsi from 'has-ansi';
import { basename, dirname, resolve } from 'path';
import stripAnsi from 'strip-ansi';
import { format as sprintf } from 'util';
import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

import { config } from './settings';
import { RequestState } from './typings/context';

class Logger {
	private textLogger: winston.Logger;
	private readonly jsonLogger: winston.Logger;

	constructor() {
		const alignedWithColorsAndTime = winston.format.combine(
			winston.format.colorize(),
			winston.format.timestamp(),
			//winston.format.align(),
			winston.format.printf(info => `${info.timestamp} ${info.level}: ${info.message}`),
		);

		this.textLogger = winston.createLogger({
			format: alignedWithColorsAndTime,
			transports: [],
			level: config.vpdb.logging.level,
		});

		if (config.vpdb.logging.console.enabled) {
			this.textLogger.add(new winston.transports.Console());
		}
		/* istanbul ignore next */
		if (config.vpdb.logging.file.text) {
			const logPath = resolve(config.vpdb.logging.file.text);
			const transport = new DailyRotateFile({
				filename: basename(logPath),
				dirname: dirname(logPath),
				zippedArchive: true,
				datePattern: 'YYYY-MM',
			});
			transport.on('rotate', (oldFilename, newFilename) => {
				this.info(null, '[app] Rotating text logs from %s to %s.', oldFilename, newFilename);
			});
			transport.on('new', newFilename => {
				this.info(null, '[app] Creating new text log at %s.', newFilename);
			});
			this.textLogger.add(transport);
			this.info(null, '[app] Text logger enabled at %s.', logPath);
		}
		/* istanbul ignore next */
		if (config.vpdb.logging.file.json) {
			const logPath = resolve(config.vpdb.logging.file.json);
			const transport = new DailyRotateFile({
				filename: basename(logPath),
				dirname: dirname(logPath),
				zippedArchive: true,
				datePattern: 'YYYY-MM',
			});
			transport.on('rotate', (oldFilename, newFilename) => {
				this.info(null, '[app] Rotating JSON logs from %s to %s.', oldFilename, newFilename);
			});
			transport.on('new', newFilename => {
				this.info(null, '[app] Creating new JSON log at %s.', newFilename);
			});
			this.jsonLogger = winston.createLogger({
				format: winston.format.json(),
				transports: [transport],
				level: config.vpdb.logging.level,
			});
			this.info(null, '[app] JSON logger enabled at %s.', logPath);
		}
	}

	public wtf(requestState: RequestState | null, format: any, ...param: any[]) {
		const message = this.colorMessage(sprintf.apply(null, Array.from(arguments).splice(1)),
			chalk.bgBlack.redBright, chalk.bgRedBright.whiteBright);
		this.log(requestState, 'wtf', message);
	}

	public error(requestState: RequestState | null, format: any, ...param: any[]) {
		const message = this.colorMessage(sprintf.apply(null, Array.from(arguments).splice(1)),
			chalk.bgBlack.redBright, chalk.whiteBright);
		this.log(requestState, 'error', message);
	}

	public warn(requestState: RequestState | null, format: any, ...param: any[]) {
		const message = this.colorMessage(sprintf.apply(null, Array.from(arguments).splice(1)),
			chalk.bgBlack.yellowBright, chalk.whiteBright);
		this.log(requestState, 'warn', message);
	}

	public info(requestState: RequestState | null, format: any, ...param: any[]) {
		const message = this.colorMessage(sprintf.apply(null, Array.from(arguments).splice(1)),
			null, chalk.white);
		this.log(requestState, 'info', message);
	}

	public verbose(requestState: RequestState | null, format: any, ...param: any[]) {
		const message = this.colorMessage(sprintf.apply(null, Array.from(arguments).splice(1)),
			null, chalk.gray);
		this.log(requestState, 'verbose', message);
	}

	public debug(requestState: RequestState | null, format: any, ...param: any[]) {
		const message = this.colorMessage(sprintf.apply(null, Array.from(arguments).splice(1)),
			null, chalk.gray);
		this.log(requestState, 'debug', message);
	}

	public text(requestState: RequestState | null, level: string, message: string) {
		this.textLogger.log({ level: this.getWinstonLevel(level), message });
	}

	public json(requestState: RequestState, level: string, data: any) {
		if (this.jsonLogger) {
			this.jsonLogger.log(Object.assign(
				{ time: new Date().toISOString(), level },
				this.getMeta(requestState),
				data));
		}
	}

	private log(requestState: RequestState | null, level: string, message: string) {
		this.text(requestState, level, message);
		this.json(requestState, level, this.splitMessage(message));
	}

	private colorMessage(message: string, prefixColor: any, messageColor?: any): string {
		if (hasAnsi(message)) {
			return config.vpdb.logging.console.colored ? message : stripAnsi(message);
		}
		if (!config.vpdb.logging.console.colored) {
			return message;
		}
		const match = message.match(/^(\[[^\]]+])(.+)/);
		if (match) {
			let prefix: string;
			if (prefixColor == null) {
				const m = match[1].split('.');
				prefix = m.length === 2 ?
					'[' + chalk.cyan(m[0].substring(1)) + '.' + chalk.blueBright(m[1].substring(0, m[1].length - 1)) + ']' :
					'[' + chalk.cyan(match[1].substring(1, match[1].length - 1)) + ']';
			} else {
				prefix = prefixColor(match[1]);
			}
			return prefix + (messageColor ? messageColor(match[2]) : match[2]);
		}
		return messageColor ? messageColor(message) : message;
	}

	private splitMessage(message: string) {
		message = stripAnsi(message);
		const match = message.match(/^\[([^\s\]]+)]:?\s+(.+)/i);
		if (match) {
			return { module: match[1], message: match[2].trim(), type: 'app' };
		}
		return { message: message.trim(), type: 'app' };
	}

	/* istanbul ignore next */
	private getMeta(requestState: RequestState) {
		return requestState ? {
			request: requestState.request,
			user: requestState.user ? {
				id: requestState.user.id,
				email: requestState.user.email,
				name: requestState.user.name,
			} : undefined,
			tokenType: requestState.tokenType,
			tokenProvider: requestState.tokenProvider,
		} : { };
	}

	private getWinstonLevel(level: string): string {
		const map: Map<string, string> = new Map([
			['info', 'info'],
			['error', 'error'],
			['warn', 'warn'],
			['verbose', 'verbose'],
			['debug', 'debug'],
			['wtf', 'error'],
		]);
		return map.get(level) || 'info';
	}
}

export const logger = new Logger();
