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

import { values } from 'lodash';
import {
	Color,
	DoubleSide,
	Group,
	Material as ThreeMaterial,
	Mesh,
	MeshStandardMaterial,
	PerspectiveCamera,
	PointLight,
	RGBAFormat,
	RGBFormat,
	Scene,
	Texture,
} from 'three';
import { logger } from '../../common/logger';
import { BumperItem } from '../bumper-item';
import { FlipperItem } from '../flipper-item';
import { IRenderable, RenderInfo } from '../game-item';
import { PrimitiveItem } from '../primitive-item';
import { RampItem } from '../ramp-item';
import { RubberItem } from '../rubber-item';
import { SurfaceItem } from '../surface-item';
import { Table } from '../table';
import { Texture as VpTexture } from '../texture';
import { GLTFExporter, ParseOptions } from './gltf-exporter';
import { Image } from './image';

export class TableExporter {

	private static readonly scale = 0.05;
	private readonly table: Table;
	private readonly scene: Scene;
	private readonly opts: VpTableExporterOptions;
	private readonly playfield: Group;
	private readonly images: Map<string, Image> = new Map();

	constructor(table: Table, opts: VpTableExporterOptions) {
		this.opts = Object.assign({}, defaultOptions, opts);
		const camera = new PerspectiveCamera(45, 1, 0.1, 100000);
		camera.name = 'playfield-camera';
		camera.position.set(0, 70.0, 70.0);
		camera.lookAt(0, -10, 0);

		this.table = table;
		this.scene = new Scene();
		this.scene.name = 'vpdb-table';
		this.playfield = new Group();
		this.playfield.name = 'playfield';
		this.playfield.rotateX(Math.PI / 2);
		this.playfield.translateY((table.gameData.top - table.gameData.bottom) * TableExporter.scale / 2);
		this.playfield.translateX(-(table.gameData.right - table.gameData.left) * TableExporter.scale / 2);
		this.playfield.scale.set(TableExporter.scale, TableExporter.scale, TableExporter.scale);
	}

	public async exportGltf(): Promise<string> {
		this.opts.gltfOptions.binary = false;
		return JSON.stringify(await this.export<any>());
	}

	public async exportGlb(): Promise<Buffer> {
		this.opts.gltfOptions.binary = true;
		return await this.export<Buffer>();
	}

	private async export<T>(): Promise<T> {

		const renderGroups: IRenderGroup[] = [
			{ name: 'playfield', meshes: [ this.table ], enabled: this.opts.exportPlayfield },
			{ name: 'primitives', meshes: values<PrimitiveItem>(this.table.primitives), enabled: this.opts.exportPrimitives },
			{ name: 'rubbers', meshes: values<RubberItem>(this.table.rubbers), enabled: this.opts.exportRubbers },
			{ name: 'surfaces', meshes: values<SurfaceItem>(this.table.surfaces), enabled: this.opts.exportSurfaces},
			{ name: 'flippers', meshes: values<FlipperItem>(this.table.flippers), enabled: this.opts.exportFlippers},
			{ name: 'bumpers', meshes: values<BumperItem>(this.table.bumpers), enabled: this.opts.exportBumpers },
			{ name: 'ramps', meshes: values<RampItem>(this.table.ramps), enabled: this.opts.exportRamps },
			{ name: 'lightsBulbs', meshes: this.table.lights.filter(l => l.isBulbLight()), enabled: this.opts.exportLightBulbs },
			{ name: 'playfieldLights', meshes: this.table.lights.filter(l => l.isSurfaceLight(this.table)), enabled: this.opts.exportPlayfieldLights },
			{ name: 'hitTargets', meshes: this.table.hitTargets, enabled: this.opts.exportHitTargets },
			{ name: 'gates', meshes: this.table.gates, enabled: this.opts.exportGates },
			{ name: 'kickers', meshes: this.table.kickers, enabled: this.opts.exportKickers },
			{ name: 'triggers', meshes: this.table.triggers, enabled: this.opts.exportTriggers },
			{ name: 'spinners', meshes: this.table.spinners, enabled: this.opts.exportSpinners },
		];

		// meshes
		for (const group of renderGroups) {
			if (!group.enabled) {
				continue;
			}
			const g = new Group();
			g.name = group.name;
			for (const renderable of group.meshes.filter(i => i.isVisible(this.table))) {
				const objects = renderable.getMeshes(this.table, this.opts);
				let obj: RenderInfo;
				for (obj of values(objects)) {
					const geometry = obj.geometry || obj.mesh.getBufferGeometry();
					const material = await this.getMaterial(obj);
					const postProcessedMaterial = renderable.postProcessMaterial ? renderable.postProcessMaterial(this.table, geometry, material) : material;
					let mesh = new Mesh(geometry, postProcessedMaterial);
					if (renderable.postProcessMesh) {
						mesh = renderable.postProcessMesh(this.table, mesh);
					}
					mesh.name = (obj.geometry || obj.mesh).name;
					g.add(mesh);
				}
			}
			if (g.children.length > 0) {
				this.playfield.add(g);
			}
		}

		const lightGroup = new Group();
		lightGroup.name = 'lights';

		// light bulb lights
		if (this.opts.exportLightBulbLights) {
			for (const lightInfo of this.table.lights.filter(l => l.isBulbLight())) {
				const light = new PointLight(lightInfo.color, lightInfo.intensity, lightInfo.falloff * TableExporter.scale, 2);
				light.name = 'light:' + lightInfo.getName();
				light.position.set(lightInfo.vCenter.x, lightInfo.vCenter.y, -17);
				lightGroup.add(light);
			}
		}

		// playfield lights
		// if (this.opts.exportPlayfieldLights) {
		// 	for (const lightInfo of this.table.lights.filter(l => l.isSurfaceLight(this.table)).slice(0, 10)) {
		// 		const light = new PointLight(lightInfo.color, lightInfo.intensity, lightInfo.falloff * TableExporter.scale, 2);
		// 		light.name = 'light:' + lightInfo.getName();
		// 		light.position.set(lightInfo.vCenter.x, lightInfo.vCenter.y, 10);
		// 		lightGroup.add(light);
		// 	}
		// }

		if (lightGroup.children.length > 0) {
			this.playfield.add(lightGroup);
		}

		// finally, add to scene
		this.scene.add(this.playfield);

		// now, export to GLTF
		const gltfExporter = new GLTFExporter(Object.assign({}, { embedImages: true }, this.opts.gltfOptions));
		return gltfExporter.parse(this.scene);
	}

	private async getMaterial(obj: RenderInfo): Promise<MeshStandardMaterial> {
		const material = new MeshStandardMaterial();
		const name = (obj.geometry || obj.mesh).name;
		material.name = `material:${name}`;
		const materialInfo = obj.material;
		if (materialInfo && this.opts.applyMaterials) {
			material.metalness = materialInfo.bIsMetal ? 1.0 : 0.0;
			material.roughness = Math.max(0, 1 - (materialInfo.fRoughness / 1.5));
			material.color = new Color(materialInfo.cBase);
			material.opacity = materialInfo.bOpacityActive ? Math.min(1, Math.max(0, materialInfo.fOpacity)) : 1;
			material.transparent = materialInfo.bOpacityActive && materialInfo.fOpacity < 0.98;
			material.side = DoubleSide;

			if (materialInfo.emissiveIntensity > 0) {
				material.emissive = new Color(materialInfo.emissiveColor);
				material.emissiveIntensity = materialInfo.emissiveIntensity;
			}
		}

		if (this.opts.applyTextures) {
			if (obj.map) {
				material.map = new Texture();
				material.map.name = 'texture:' + obj.map.getName();
				if (await this.loadMap(name, obj.map, material.map)) {
					if ((material.map.image as Image).containsTransparency()) {
						material.transparent = true;
					}
					material.needsUpdate = true;
				} else {
					logger.warn(null, '[VpTableExporter.getMaterial] Error getting map.');
					material.map = null;
				}
			}
			if (obj.normalMap) {
				material.normalMap = new Texture();
				material.normalMap.name = 'normal-map:' + obj.normalMap.getName();
				if (await this.loadMap(name, obj.normalMap, material.normalMap)) {
					material.normalMap.anisotropy = 16;
					material.needsUpdate = true;
				} else {
					material.normalMap = null;
				}
			}
		}
		return material;
	}

	private async loadMap(name: string, objMap: VpTexture, materialMap: Texture): Promise<boolean> {
		const doc = await this.table.getDocument();
		let data: Buffer;
		try {
			let image: Image;
			if (this.images.has(objMap.getName())) {
				image = this.images.get(objMap.getName());
			} else {
				data = await objMap.getImage(doc.storage('GameStg'));
				if (!data || !data.length) {
					return false;
				}
				image = await new Image(objMap.getName(), objMap.isRaw() ? objMap.getRawImage() : data, this.opts.optimizeTextures).init();
				this.images.set(objMap.getName(), image);
			}
			materialMap.image = image;
			materialMap.format = image.hasTransparency() ? RGBAFormat : RGBFormat;
			materialMap.needsUpdate = true;
			return true;
		} catch (err) {
			materialMap.image = Texture.DEFAULT_IMAGE;
			logger.warn(null, '[VpTableExporter.loadMap] Error loading map of %s bytes for %s (%s/%s): %s', data ? data.length : '<null>', name, objMap.storageName, objMap.getName(), err.message);
			return false;
		} finally {
			await doc.close();
		}
	}
}

interface IRenderGroup {
	name: string;
	meshes: IRenderable[];
	enabled: boolean;
}

export interface VpTableExporterOptions {
	applyMaterials?: boolean;
	applyTextures?: boolean;
	optimizeTextures?: boolean;
	exportPlayfield?: boolean;
	exportPrimitives?: boolean;
	exportRubbers?: boolean;
	exportSurfaces?: boolean;
	exportFlippers?: boolean;
	exportBumpers?: boolean;
	exportRamps?: boolean;
	exportLightBulbs?: boolean;
	exportPlayfieldLights?: boolean;
	exportLightBulbLights?: boolean;
	exportHitTargets?: boolean;
	exportGates?: boolean;
	exportKickers?: boolean;
	exportTriggers?: boolean;
	exportSpinners?: boolean;
	gltfOptions?: ParseOptions;
}

const defaultOptions: VpTableExporterOptions = {
	applyMaterials: true,
	applyTextures: true,
	optimizeTextures: false,
	exportPlayfield: true,
	exportPrimitives: true,
	exportRubbers: true,
	exportSurfaces: true,
	exportFlippers: true,
	exportBumpers: true,
	exportRamps: true,
	exportPlayfieldLights: false,
	exportLightBulbs: true,
	exportLightBulbLights: true,
	exportHitTargets: true,
	exportGates: true,
	exportKickers: true,
	exportTriggers: true,
	exportSpinners: true,
	gltfOptions: {},
};
