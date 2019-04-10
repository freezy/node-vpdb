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

import { apiCache } from '../../app/common/api.cache';
import { logger } from '../../app/common/logger';
import { processorQueue } from '../../app/files/processor/processor.queue';
import { state } from '../../app/state';

/**
 * Re-generates al GLB files.
 */
export async function up() {

	// create GLB variations
	const mimeType = 'application/x-visual-pinball-table-x';
	const files = await state.models.File.find({ mime_type : mimeType }).exec();
	for (const file of files) {
		await processorQueue.reprocessFile(null, file, false,
			variation => variation.name === 'gltf',
			() => false);
	}

	// clear all caches
	await apiCache.invalidateAll();
	logger.info(null, '[migrate-19] Cache invalidated.');
}
