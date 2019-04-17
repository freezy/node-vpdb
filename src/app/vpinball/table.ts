/* tslint:disable: no-bitwise */
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

import { logger } from '../common/logger';
import { OleCompoundDoc, Storage } from '../common/ole-doc';
import { BumperItem } from './bumper-item';
import { FlipperItem } from './flipper-item';
import { GameData } from './game-data';
import { GameItem, IRenderable, Meshes } from './game-item';
import { GateItem } from './gate-item';
import { TableExporter, VpTableExporterOptions } from './gltf/table-exporter';
import { HitTargetItem } from './hit-target-item';
import { KickerItem } from './kicker-item';
import { LightItem } from './light-item';
import { Material } from './material';
import { Mesh } from './mesh';
import { PrimitiveItem } from './primitive-item';
import { RampItem } from './ramp-item';
import { RubberItem } from './rubber-item';
import { SpinnerItem } from './spinner-item';
import { SurfaceItem } from './surface-item';
import { Texture } from './texture';
import { TriggerItem } from './trigger-item';
import { Vertex3DNoTex2 } from './math/vertex';
import { Matrix3D } from './math/matrix3d';
import { f4 } from './math/float';
import { Math as M } from 'three';

/**
 * A Visual Pinball table.
 *
 * This holds together all table elements of a .vpt/.vpx file. It's also
 * the entry point for parsing the file.
 */
export class Table implements IRenderable {

	public gameData: GameData;
	public surfaces: { [key: string]: SurfaceItem } = {};
	public primitives: { [key: string]: PrimitiveItem } = {};
	public textures: { [key: string]: Texture } = {};
	public rubbers: { [key: string]: RubberItem } = {};
	public flippers: { [key: string]: FlipperItem } = {};
	public bumpers: { [key: string]: BumperItem } = {};
	public ramps: { [key: string]: RampItem } = {};
	public lights: LightItem[] = [];
	public hitTargets: HitTargetItem[] = [];
	public gates: GateItem[] = [];
	public kickers: KickerItem[] = [];
	public triggers: TriggerItem[] = [];
	public spinners: SpinnerItem[] = [];

	private doc: OleCompoundDoc;

	public static async load(fileName: string): Promise<Table> {
		const then = Date.now();
		const vpTable = new Table();
		await vpTable._load(fileName);
		logger.info(null, '[Table.load] Table loaded in %sms.', Date.now() - then);
		return vpTable;
	}

	public getTexture(name: string): Texture {
		if (!name) {
			return undefined;
		}
		return this.textures[name.toLowerCase()];
	}

	public getMaterial(name: string): Material {
		if (!name) {
			return undefined;
		}
		return this.gameData.materials.find(m => m.szName === name);
	}

	public getScaleZ(): number {
		return f4(this.gameData.BG_scalez[this.gameData.BG_current_set]) || 1.0;
	}

	public getDetailLevel() {
		return 10; // todo check if true
	}

	public getTableHeight() {
		return this.gameData.tableheight;
	}

	public async getDocument(): Promise<OleCompoundDoc> {
		await this.doc.read();
		return this.doc;
	}

	public getSurfaceHeight(surface: string, x: number, y: number) {
		if (!surface) {
			return this.gameData.tableheight;
		}

		if (this.surfaces[surface]) {
			return this.gameData.tableheight + this.surfaces[surface].heighttop;
		}

		if (this.ramps[surface]) {
			return this.gameData.tableheight + this.ramps[surface].getSurfaceHeight(x, y, this);
		}

		logger.warn(null, '[Table.getSurfaceHeight] Unknown surface %s.', surface);
		return this.gameData.tableheight;
	}

	public async exportGltf(opts?: VpTableExporterOptions): Promise<string> {
		const exporter = new TableExporter(this, opts || {});
		return await exporter.exportGltf();
	}

	public async exportGlb(opts?: VpTableExporterOptions): Promise<Buffer> {
		const exporter = new TableExporter(this, opts || {});
		return await exporter.exportGlb();
	}

	private async _load(fileName: string): Promise<void> {

		this.doc = new OleCompoundDoc(fileName);
		try {

			// read ole-doc
			await this.doc.read();

			// open game storage
			const gameStorage = this.doc.storage('GameStg');

			// load game data
			this.gameData = await GameData.fromStorage(gameStorage, 'GameData');

			// load items
			await this.loadGameItems(gameStorage, this.gameData.numGameItems);

			// load images
			await this.loadTextures(gameStorage, this.gameData.numTextures);

		} finally {
			await this.doc.close();
		}
	}

	public getMeshes(table: Table): Meshes {
		const rgv: Vertex3DNoTex2[] = [];
		for (let i = 0; i < 7; i++) {
			rgv.push(new Vertex3DNoTex2());
		}
		rgv[0].x = this.gameData.left;     rgv[0].y = this.gameData.top;      rgv[0].z = this.gameData.tableheight;
		rgv[1].x = this.gameData.right;    rgv[1].y = this.gameData.top;      rgv[1].z = this.gameData.tableheight;
		rgv[2].x = this.gameData.right;    rgv[2].y = this.gameData.bottom;   rgv[2].z = this.gameData.tableheight;
		rgv[3].x = this.gameData.left;     rgv[3].y = this.gameData.bottom;   rgv[3].z = this.gameData.tableheight;

		// These next 4 vertices are used just to set the extents
		rgv[4].x = this.gameData.left;     rgv[4].y = this.gameData.top;      rgv[4].z = this.gameData.tableheight + 50.0;
		rgv[5].x = this.gameData.left;     rgv[5].y = this.gameData.bottom;   rgv[5].z = this.gameData.tableheight + 50.0;
		rgv[6].x = this.gameData.right;    rgv[6].y = this.gameData.bottom;   rgv[6].z = this.gameData.tableheight + 50.0;
		//rgv[7].x=g_pplayer->m_ptable->m_right;    rgv[7].y=g_pplayer->m_ptable->m_top;      rgv[7].z=50.0f;

		for (let i = 0; i < 4; ++i) {
			rgv[i].nx = 0;
			rgv[i].ny = 0;
			rgv[i].nz = 1.0;

			rgv[i].tv = (i & 2) ? 1.0 : 0.0;
			rgv[i].tu = (i === 1 || i === 2) ? 1.0 : 0.0;
		}

		const playfieldPolyIndices = [ 0, 1, 3, 0, 3, 2, 2, 3, 5, 6 ];
		Mesh.setNormal(rgv, playfieldPolyIndices.splice(6), 4);

		const buffer: Vertex3DNoTex2[] = [];
		for (let i = 0; i < 7; i++) {
			buffer.push(new Vertex3DNoTex2());
		}
		let offs = 0;
		for (let y = 0; y <= 1; ++y) {
			for (let x = 0; x <= 1; ++x) {
				buffer[offs].x = (x & 1) ? rgv[1].x : rgv[0].x;
				buffer[offs].y = (y & 1) ? rgv[2].y : rgv[0].y;
				buffer[offs].z = rgv[0].z;

				buffer[offs].tu = (x & 1) ? rgv[1].tu : rgv[0].tu;
				buffer[offs].tv = (y & 1) ? rgv[2].tv : rgv[0].tv;

				buffer[offs].nx = rgv[0].nx;
				buffer[offs].ny = rgv[0].ny;
				buffer[offs].nz = rgv[0].nz;
				++offs;
			}
		}

		return {
			playfield: {
				mesh: new Mesh(buffer, playfieldPolyIndices).transform(new Matrix3D().toRightHanded()),
				material: this.getMaterial(this.gameData.szPlayfieldMaterial),
				map: this.getTexture(this.gameData.szImage),
			},
		};
	}

	public isVisible(): boolean {
		return true;
	}

	private async loadGameItems(storage: Storage, numItems: number): Promise<{[key: string]: number}> {
		const stats: {[key: string]: number} = {};
		for (let i = 0; i < numItems; i++) {
			const itemName = `GameItem${i}`;
			const itemData = await storage.read(itemName, 0, 4);
			const itemType = itemData.readInt32LE(0);
			switch (itemType) {

				case GameItem.TypeSurface: {
					const item = await SurfaceItem.fromStorage(storage, itemName);
					this.surfaces[item.getName()] = item;
					break;
				}

				case GameItem.TypePrimitive: {
					const item = await PrimitiveItem.fromStorage(storage, itemName);
					this.primitives[item.getName()] = item;
					break;
				}

				case GameItem.TypeLight: {
					this.lights.push(await LightItem.fromStorage(storage, itemName));
					break;
				}

				case GameItem.TypeRubber: {
					const item = await RubberItem.fromStorage(storage, itemName);
					this.rubbers[item.getName()] = item;
					break;
				}

				case GameItem.TypeFlipper: {
					const item = await FlipperItem.fromStorage(storage, itemName);
					this.flippers[item.getName()] = item;
					break;
				}

				case GameItem.TypeBumper: {
					const item = await BumperItem.fromStorage(storage, itemName);
					this.bumpers[item.getName()] = item;
					break;
				}

				case GameItem.TypeRamp: {
					const item = await RampItem.fromStorage(storage, itemName);
					this.ramps[item.getName()] = item;
					break;
				}

				case GameItem.TypeHitTarget: {
					this.hitTargets.push(await HitTargetItem.fromStorage(storage, itemName));
					break;
				}

				case GameItem.TypeGate: {
					this.gates.push(await GateItem.fromStorage(storage, itemName));
					break;
				}

				case GameItem.TypeKicker: {
					this.kickers.push(await KickerItem.fromStorage(storage, itemName));
					break;
				}

				case GameItem.TypeTrigger: {
					this.triggers.push(await TriggerItem.fromStorage(storage, itemName));
					break;
				}

				case GameItem.TypeSpinner: {
					this.spinners.push(await SpinnerItem.fromStorage(storage, itemName));
					break;
				}

				default:
					// ignore the rest for now
					break;
			}
			if (!stats[GameItem.getType(itemType)]) {
				stats[GameItem.getType(itemType)] = 1;
			} else {
				stats[GameItem.getType(itemType)]++;
			}
		}
		return stats;
	}

	private async loadTextures(storage: Storage, numItems: number): Promise<void> {
		for (let i = 0; i < numItems; i++) {
			const itemName = `Image${i}`;
			const texture = await Texture.fromStorage(storage, itemName);
			this.textures[texture.getName()] = texture;
		}
	}

}
