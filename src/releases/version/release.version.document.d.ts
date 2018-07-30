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

import { FileReferenceDocument, MetricsDocument, PrettyIdDocument } from 'mongoose';
import { ReleaseVersionFileDocument } from './file/release.version.file.document';

export interface ReleaseVersionDocument extends FileReferenceDocument, PrettyIdDocument, MetricsDocument {
	version: string;
	released_at: Date | string;
	changes: string;
	files: ReleaseVersionFileDocument[];
	counter: {
		downloads: number,
		comments: number,
	};

	/**
	 * Returns all file IDs of the version files.
	 *
	 * @param {ReleaseVersionFileDocument[]} [files] Subset of version files, all files if not set
	 * @returns {string[]} File IDs
	 */
	getFileIds(files?: ReleaseVersionFileDocument[]): string[];

	/**
	 * Returns all playfield image IDs of this release version.
	 *
	 * @returns {string[]} Playfield image IDs
	 */
	getPlayfieldImageIds(): string[];
}
