import { Mongo } from 'meteor/mongo'
import { TransformedCollection } from '../typings/meteor'
import { Time, registerCollection, getCurrentTime } from '../lib'
import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'

export const SYSTEM_ID = 'core'
export interface ICoreSystem {
	_id: 'core'
	/** Timestamp of creation, (ie the time the database was created) */
	created: number
	/** Last modified time */
	modified: number
	/** Database version, on the form x.y.z */
	version: string
}

// The CoreSystem collection will contain one (exactly 1) object.
// This represents the "system"

export const CoreSystem: TransformedCollection<ICoreSystem, ICoreSystem>
	= new Mongo.Collection<ICoreSystem>('coreSystem')
registerCollection('CoreSystem', CoreSystem)

export function getCoreSystem () {
	return CoreSystem.findOne(SYSTEM_ID)
}
export function getCoreSystemCursor () {
	return CoreSystem.find(SYSTEM_ID)
}
export interface Version {
	toString: () => string
	major: number
	minor: number
	patch: number
	label?: string
}
export function parseVersion (v: string): Version {

	// https://github.com/semver/semver/issues/232
	let m = (v + '').match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(\.(0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*)?(\+[0-9a-zA-Z-]+(\.[0-9a-zA-Z-]+)*)?$/)

	if (m) {
		let major = parseInt(m[1], 10)
		let minor = parseInt(m[2], 10)
		let patch = parseInt(m[3], 10)
		let label = (m[4] ? (m[4] + '').trim() : '')
		if (
			!_.isNaN(major) &&
			!_.isNaN(minor) &&
			!_.isNaN(patch)
		) {
			return {
				major: major,
				minor: minor,
				patch: patch,
				label: label,
				toString: () => {
					return `${major}.${minor}.${patch}` + (label ? '-' + label : '')
				}
			}
		}
	}
	throw new Meteor.Error(500, `Invalid version: "${v}"`)
}
