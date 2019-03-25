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

import { Image } from 'canvas';
import { values } from 'lodash';
import { Color, DoubleSide, Group, Material as ThreeMaterial, Mesh, MeshStandardMaterial, PointLight, RGBAFormat, Scene, Texture, } from 'three';
import { BumperItem } from '../bumper-item';
import { Texture as VpTexture } from '../texture';
import { FlipperItem } from '../flipper-item';
import { IRenderable, RenderInfo } from '../game-item';
import { PrimitiveItem } from '../primitive-item';
import { RampItem } from '../ramp-item';
import { RubberItem } from '../rubber-item';
import { SurfaceItem } from '../surface-item';
import { VpTable } from '../vp-table';
import { BaseExporter } from './base-exporter';
import { logger } from '../../common/logger';

export class VpTableExporter extends BaseExporter {

	private static readonly applyMaterials = true;

	private static readonly scale = 0.05;
	private readonly table: VpTable;
	private readonly scene: Scene;
	private playfield: Group;

	constructor(table: VpTable) {
		super();
		this.table = table;
		this.scene = new Scene();
		this.playfield = new Group();
		this.playfield.rotateX(Math.PI / 2);
		//this.playfield.rotateZ(-Math.PI / 2);
		this.playfield.translateY((table.gameData.top - table.gameData.bottom) * VpTableExporter.scale / 2);
		this.playfield.translateX(-(table.gameData.right - table.gameData.left) * VpTableExporter.scale / 2);
		this.playfield.scale.set(VpTableExporter.scale, VpTableExporter.scale, VpTableExporter.scale);
	}

	public async exportGltf(): Promise<string> {
		return JSON.stringify(await this.export<any>({ binary: false }));
	}

	public async exportGlb(): Promise<Buffer> {
		return this.arrayBufferToBuffer(await this.export<ArrayBuffer>({ binary: true }));
	}

	private async export<T>(opts: any = {}): Promise<T> {
		const allRenderables: IRenderable[][] = [
			values<PrimitiveItem>(this.table.primitives),
			values<RubberItem>(this.table.rubbers),
			values<SurfaceItem>(this.table.surfaces),
			values<FlipperItem>(this.table.flippers),
			values<BumperItem>(this.table.bumpers),
			values<RampItem>(this.table.ramps),
			this.table.lights,
			this.table.hitTargets,
			this.table.gates,
			this.table.kickers,
			this.table.triggers,
		];

		// meshes
		for (const renderables of allRenderables) {
			for (const renderable of renderables.filter(i => i.isVisible())) {
				const objects = renderable.getMeshes(this.table);
				let obj: RenderInfo;
				for (obj of values(objects)) {
					const bufferGeometry = obj.mesh.getBufferGeometry();
					const mesh = new Mesh(bufferGeometry, await this.getMaterial(obj));
					mesh.name = obj.mesh.name;
					if (renderable.getPositionableObject) {
						this.position(mesh, renderable as any);
					}
					this.playfield.add(mesh);
				}
			}
		}

		// lights
		for (const lightInfo of this.table.lights.filter(l => l.showBulbMesh)) {
			const light = new PointLight(lightInfo.color, lightInfo.intensity, lightInfo.falloff * VpTableExporter.scale);
			light.castShadow = false;
			light.position.set(lightInfo.vCenter.x, lightInfo.vCenter.y, -10);
			this.playfield.add(light);
		}

		this.scene.add(this.playfield);

		return await new Promise(resolve => {
			this.gltfExporter.parse(this.scene, resolve, Object.assign({}, opts, { embedImages: true }));
		});
	}

	private async getMaterial(obj: RenderInfo): Promise<ThreeMaterial> {
		const material = new MeshStandardMaterial();
		const materialInfo = obj.material;
		if (materialInfo && VpTableExporter.applyMaterials) {

			material.color = new Color(materialInfo.cBase);
			material.roughness = 1 - materialInfo.fRoughness;
			material.metalness = materialInfo.bIsMetal ? 0.7 : 0.0;
			material.emissive = new Color(materialInfo.cGlossy);
			material.emissiveIntensity = 0.1;

			if (materialInfo.bOpacityActive) {
				material.transparent = true;
				material.opacity = materialInfo.fOpacity;
			}

			material.side = DoubleSide;
		}

		if (obj.map) {
			material.map = new Texture();
			if (await this.loadMap(obj.mesh.name, obj.map, material.map)) {
				material.needsUpdate = true;
			}
		}

		if (obj.normalMap) {
			material.normalMap = new Texture();
			if (await this.loadMap(obj.mesh.name, obj.normalMap, material.normalMap)) {
				material.normalMap.anisotropy = 16;
				material.needsUpdate = true;
			}
		}

		return material;
	}

	private async loadMap(name: string, objMap: VpTexture, materialMap: Texture): Promise<boolean> {
		const doc = await this.table.getDocument();
		try {
			materialMap.image = await this.getImage(await objMap.getImage(doc.storage('GameStg')));
			materialMap.format = RGBAFormat;
			materialMap.needsUpdate = true;
			return true;
		} catch (err) {
			materialMap.image = Texture.DEFAULT_IMAGE;
			logger.warn(null, '[VpTableExporter.getMaterial] Error loading map for %s', name);
			return false;
		} finally {
			await doc.close();
		}
	}

	private async getImage(src: Buffer): Promise<Image> {
		const img = new Image();
		return new Promise((resolve, reject) => {
			img.onload = () => resolve(img);
			img.onerror = reject;
			img.src = src;
		});
	}

	private arrayBufferToBuffer(ab: ArrayBuffer) {
		const buffer = new Buffer(ab.byteLength);
		const view = new Uint8Array(ab);
		for (let i = 0; i < buffer.length; ++i) {
			buffer[i] = view[i];
		}
		return buffer;
	}
}
