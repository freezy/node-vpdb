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

import { BiffParser } from './biff-parser';

export class Material {

	public szName: string;
	public fWrapLighting: number;

	/**
	 * Roughness seems to be mapped to the "specular" exponent.
	 *
	 * Comment when importing:
	 *
	 * > normally a wavefront material specular exponent ranges from 0..1000.
	 * > but our shininess calculation differs from the way how e.g. Blender is calculating the specular exponent
	 * > starting from 0.5 and use only half of the exponent resolution to get a similar look
	 *
	 * Then the roughness is converted like this:
	 * > mat->m_fRoughness = 0.5f + (tmp / 2000.0f);
	 *
	 * When sending to the render device, the roughness is defined like that:
	 * > fRoughness = exp2f(10.0f * mat->m_fRoughness + 1.0f); // map from 0..1 to 2..2048
	 *
	 */
	public fRoughness: number;
	public fGlossyImageLerp: number;
	public fThickness: number;
	public fEdge: number;
	public fEdgeAlpha: number;
	public fOpacity: number;
	public cBase: number;
	public cGlossy: number;
	public cClearcoat: number;
	public bIsMetal: boolean;
	public bOpacityActive: boolean;

	//physics
	public fElasticity: number;
	public fElasticityFalloff: number;
	public fFriction: number;
	public fScatterAngle: number;

	public static fromSaved(saveMaterial: SaveMaterial): Material {
		const material = new Material();
		material.szName = saveMaterial.szName;
		material.cBase = BiffParser.bgrToRgb(saveMaterial.cBase);
		material.cGlossy = BiffParser.bgrToRgb(saveMaterial.cGlossy);
		material.cClearcoat = BiffParser.bgrToRgb(saveMaterial.cClearcoat);
		material.fWrapLighting = saveMaterial.fWrapLighting;
		material.fRoughness = saveMaterial.fRoughness;
		material.fGlossyImageLerp = 0; //1.0f - dequantizeUnsigned<8>(mats[i].fGlossyImageLerp); //!! '1.0f -' to be compatible with previous table versions
		material.fThickness = 0; //(mats[i].fThickness == 0) ? 0.05f : dequantizeUnsigned<8>(mats[i].fThickness); //!! 0 -> 0.05f to be compatible with previous table versions
		material.fEdge = saveMaterial.fEdge;
		material.fOpacity = saveMaterial.fOpacity;
		material.bIsMetal = saveMaterial.bIsMetal;
		// tslint:disable-next-line:no-bitwise
		material.bOpacityActive = !!(saveMaterial.bOpacityActive_fEdgeAlpha & 1);
		material.fEdgeAlpha = 0; //dequantizeUnsigned<7>(mats[i].bOpacityActive_fEdgeAlpha >> 1);
		return material;
	}

	public static fromCached(data: any): Material {
		const material = new Material();
		Object.assign(material, data);
		return material;
	}

	public serialize() {
		return {
			name: this.szName,
			wrap_lighting: this.fWrapLighting,
			roughness: this.fRoughness,
			//glossy_image_lerp: this.fGlossyImageLerp,
			//thickness: this.fThickness,
			edge: this.fEdge,
			//edge_alpha: this.fEdgeAlpha,
			opacity: this.fOpacity,
			base_color: BiffParser.bgrToRgb(this.cBase),
			glossy_color: BiffParser.bgrToRgb(this.cGlossy),
			clearcoat_color: BiffParser.bgrToRgb(this.cClearcoat),
			is_metal: this.bIsMetal,
			is_opacity_enabled: this.bOpacityActive,
		};
	}

	public physUpdate(savePhysMat: SavePhysicsMaterial) {
		this.fElasticity = savePhysMat.fElasticity;
		this.fElasticityFalloff = savePhysMat.fElasticityFallOff;
		this.fFriction = savePhysMat.fFriction;
		this.fScatterAngle = savePhysMat.fScatterAngle;
	}
}

export class SaveMaterial {

	public static size = 76;

	public szName: string;
	public cBase: number; // can be overriden by texture on object itself
	public cGlossy: number; // specular of glossy layer
	public cClearcoat: number; // specular of clearcoat layer
	public fWrapLighting: number; // wrap/rim lighting factor (0(off)..1(full))
	public bIsMetal: boolean; // is a metal material or not
	public fRoughness: number; // roughness of glossy layer (0(diffuse)..1(specular))
	public fGlossyImageLerp: number; // use image also for the glossy layer (0(no tinting at all)..1(use image)), stupid quantization because of legacy loading/saving
	public fEdge: number; // edge weight/brightness for glossy and clearcoat (0(dark edges)..1(full fresnel))
	public fThickness: number; // thickness for transparent materials (0(paper thin)..1(maximum)), stupid quantization because of legacy loading/saving
	public fOpacity: number; // opacity (0..1)
	public bOpacityActive_fEdgeAlpha: number;

	constructor(buffer: Buffer, i = 0) {
		const offset = i * SaveMaterial.size;
		this.szName = BiffParser.parseNullTerminatedString(buffer.slice(offset, offset + 32));
		this.cBase = buffer.readInt32LE(offset + 32);
		this.cGlossy = buffer.readInt32LE(offset + 36);
		this.cClearcoat = buffer.readInt32LE(offset + 40);
		this.fWrapLighting = buffer.readFloatLE(offset + 44);
		this.bIsMetal = buffer.readInt32LE(offset + 48) > 0;
		this.fRoughness = buffer.readFloatLE(offset + 52);
		this.fGlossyImageLerp = buffer.readInt32LE(offset + 56);
		this.fEdge = buffer.readFloatLE(offset + 60);
		this.fThickness = buffer.readInt32LE(offset + 64);
		this.fOpacity = buffer.readFloatLE(offset + 68);
		this.bOpacityActive_fEdgeAlpha = buffer.readInt32LE(offset + 72);
	}
}

export class SavePhysicsMaterial {

	public static size = 48;

	public szName: string;
	public fElasticity: number;
	public fElasticityFallOff: number;
	public fFriction: number;
	public fScatterAngle: number;

	constructor(buffer: Buffer, i = 0) {
		const offset = i * SavePhysicsMaterial.size;
		this.szName = BiffParser.parseNullTerminatedString(buffer.slice(offset, offset + 32));
		this.fElasticity = buffer.readFloatLE(offset + 32);
		this.fElasticityFallOff = buffer.readFloatLE(offset + 36);
		this.fFriction = buffer.readFloatLE(offset + 40);
		this.fScatterAngle = buffer.readFloatLE(offset + 44);
	}
}