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

import gm from 'gm';
import sharp = require('sharp');
import { logger } from '../common/logger';
import { Storage } from '../common/ole-doc';
import { settings } from '../common/settings';
import { BiffParser } from './biff-parser';
import { Binary } from './binary';
import { LzwReader } from './gltf/lzw-reader';
import { resolve } from 'path';
import { Stream } from 'stream';

/**
 * VPinball's texture.
 *
 * These are read from the "Image*" storage items.
 *
 * @see https://github.com/vpinball/vpinball/blob/master/Texture.cpp
 */
export class Texture extends BiffParser {

	public storageName: string;
	public szName: string;
	public szInternalName: string;
	public szPath: string;
	public width: number;
	public height: number;
	public alphaTestValue: number;
	public binary: Binary;
	public localPath: string;
	public pdsBuffer: BaseTexture = null;
	private rgbTransparent: number = 0xffffff;

	public static async fromStorage(storage: Storage, itemName: string): Promise<Texture> {
		const texture = new Texture();
		texture.storageName = itemName;
		await storage.streamFiltered(itemName, 0, Texture.createStreamHandler(storage, itemName, texture));
		return texture;
	}

	public static fromFilesystem(resFileName: string): Texture {
		const texture = new Texture();
		texture.localPath = resolve(__dirname, 'res', resFileName);
		return texture;
	}

	private static createStreamHandler(storage: Storage, itemName: string, texture: Texture) {
		texture.binary = new Binary();
		return BiffParser.stream((buffer, tag, offset, len) => texture.fromTag(buffer, tag, offset, len, storage, itemName), {
			nestedTags: {
				JPEG: {
					onStart: () => new Binary(),
					onTag: binary => binary.fromTag.bind(binary),
					onEnd: binary => texture.binary = binary,
				},
			},
		});
	}

	private constructor() {
		super();
	}

	public getName(): string {
		return this.szInternalName.toLowerCase();
	}

	public getUrl(fileId: string): string {
		const imageNum = this.storageName.match(/\d+$/)[0];
		return settings.apiExternalUri(`/v1/vp/${fileId}/images/${imageNum}/${this.binary.pos.toString(16)}/${this.binary.len.toString(16)}`);
	}

	public async getImage(storage: Storage): Promise<Buffer> {
		let strm: Stream;
		if (this.localPath) {
			strm = gm(this.localPath).stream();
		} else {
			strm = storage.stream(this.storageName, this.binary.pos, this.binary.len);
		}
		return new Promise<Buffer>((resolve, reject) => {
			const bufs: Buffer[] = [];
			if (!strm) {
				return reject(new Error('No such stream "' + this.storageName + '".'));
			}
			strm.on('error', reject);
			strm.on('data', (buf: Buffer) => bufs.push(buf));
			strm.on('end', () => resolve(Buffer.concat(bufs)));
		});
	}

	public isRaw(): boolean {
		return this.pdsBuffer !== null;
	}

	public getRawImage(): sharp.Sharp {
		return sharp(this.pdsBuffer.getData(), {
			raw: {
				width: this.width,
				height: this.height,
				channels: 4,
			},
		}).png();
	}

	private async fromTag(buffer: Buffer, tag: string, offset: number, len: number, storage: Storage, itemName: string): Promise<number> {
		switch (tag) {
			case 'NAME': this.szName = this.getString(buffer, len); break;
			case 'INME': this.szInternalName = this.getString(buffer, len); break;
			case 'PATH': this.szPath = this.getString(buffer, len); break;
			case 'WDTH': this.width = this.getInt(buffer); break;
			case 'HGHT': this.height = this.getInt(buffer); break;
			case 'ALTV': this.alphaTestValue = this.getFloat(buffer); break;
			case 'BITS':
				let compressedLen: number;
				[ this.pdsBuffer, compressedLen ] = await BaseTexture.get(storage, itemName, offset, this.width, this.height);
				return compressedLen + 4;
			case 'LINK': logger.warn(null, '[Texture.fromTag] Ignoring LINK tag for %s at %s, implement when understood what it is.', this.szName, this.storageName); break;
			case 'TRNS': this.rgbTransparent = this.getInt(buffer); break; // legacy vp9
			default: logger.warn(null, '[Texture.fromTag] Unknown tag "%s".', tag);
		}
		return 0;
	}
}

class BaseTexture {

	private static readonly RGBA = 0;
	private static readonly RGB_FP = 1;

	private width: number;
	private height: number;
	private realWidth: number;
	private realHeight: number;
	private format: number = BaseTexture.RGBA;
	private data: Buffer;

	constructor(width?: number, height?: number, realWidth?: number, realHeight?: number, format = BaseTexture.RGBA) {
		this.width = width;
		this.height = height;
		this.realWidth = realWidth;
		this.realHeight = realHeight;
		this.format = format;
	}

	public size(): number {
		return this.data.length;
	}

	public getData(): Buffer {
		return this.data;
	}

	public static async get(storage: Storage, itemName: string, pos: number, width: number, height: number): Promise<[BaseTexture, number]> {
		const pdsBuffer = new BaseTexture(width, height);
		const compressed = await storage.read(itemName, pos);

		const lzw = new LzwReader(compressed, width * 4, height, pdsBuffer.pitch());
		let compressedLen: number;
		[ pdsBuffer.data, compressedLen ] = lzw.decompress();

		const lpitch = pdsBuffer.pitch();

		// Assume our 32 bit color structure
		// Find out if all alpha values are zero
		const pch = pdsBuffer.data;
		let allAlphaZero = true;
		loop: for (let i = 0; i < height; i++) {
			for (let l = 0; l < width; l++) {
				if (pch[i * lpitch + 4 * l + 3] !== 0) {
					allAlphaZero = false;
					break loop;
				}
			}
		}

		// all alpha values are 0: set them all to 0xff
		if (allAlphaZero) {
			for (let i = 0; i < height; i++) {
				for (let l = 0; l < width; l++) {
					pch[i * lpitch + 4 * l + 3] = 0xff;
				}
			}
		}
		return [ pdsBuffer, compressedLen ];
	}

	public pitch(): number {
		return (this.format === BaseTexture.RGBA ? 4 : 3 * 4) * this.width;
	}
}
