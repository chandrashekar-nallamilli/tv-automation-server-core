import { Meteor } from 'meteor/meteor'
import { Mongo } from 'meteor/mongo'
import { Random } from 'meteor/random'
import * as _ from 'underscore'
import { logger } from '../../logging'
import { Rundown, Rundowns, RundownHoldState, DBRundown } from '../../../lib/collections/Rundowns'
import { Pieces } from '../../../lib/collections/Pieces'
import { Parts, DBPart, Part, isPartPlayable } from '../../../lib/collections/Parts'
import {
	asyncCollectionUpdate,
	getCurrentTime,
	waitForPromiseAll,
	asyncCollectionRemove,
	Time,
	pushOntoPath,
	clone,
	literal,
	asyncCollectionInsert,
	asyncCollectionInsertMany,
} from '../../../lib/lib'
import { TimelineObjGeneric } from '../../../lib/collections/Timeline'
import { loadCachedIngestSegment } from '../ingest/ingestCache'
import { updateSegmentsFromIngestData } from '../ingest/rundownInput'
import { updateSourceLayerInfinitesAfterPart } from './infinites'
import { Studios } from '../../../lib/collections/Studios'
import { DBSegment, Segments } from '../../../lib/collections/Segments'
import { RundownPlaylist, RundownPlaylists } from '../../../lib/collections/RundownPlaylists'
import { PartInstance, PartInstances, DBPartInstance } from '../../../lib/collections/PartInstances'
import { PieceInstances, PieceInstance } from '../../../lib/collections/PieceInstances'

/**
 * Reset the rundown:
 * Remove all dynamically inserted/updated pieces, parts, timings etc..
 */
export function resetRundown (rundown: Rundown) {
	logger.info('resetRundown ' + rundown._id)
	// Remove all dunamically inserted pieces (adlibs etc)

	Pieces.remove({
		rundownId: rundown._id,
		dynamicallyInserted: true
	})

	Parts.remove({
		rundownId: rundown._id,
		dynamicallyInserted: true
	})

	Parts.update({
		rundownId: rundown._id
	}, {
		$unset: {
			duration: 1,
			previousPartEndState: 1,
			startedPlayback: 1,
			timings: 1,
			runtimeArguments: 1,
			stoppedPlayback: 1
		}
	}, { multi: true })

	const dirtyParts = rundown.getParts({ dirty: true })
	dirtyParts.forEach(part => {
		refreshPart(rundown, part)
		Parts.update(part._id, {
			$unset: {
				dirty: 1
			}
		})
	})

	// Reset all pieces that were modified for holds
	Pieces.update({
		rundownId: rundown._id,
		extendOnHold: true,
		infiniteId: { $exists: true },
	}, {
		$unset: {
			infiniteId: 0,
			infiniteMode: 0,
		}
	}, { multi: true })

	// Reset any pieces that were modified by inserted adlibs
	Pieces.update({
		rundownId: rundown._id,
		originalInfiniteMode: { $exists: true }
	}, {
		$rename: {
			originalInfiniteMode: 'infiniteMode'
		}
	}, { multi: true })

	Pieces.update({
		rundownId: rundown._id
	}, {
		$unset: {
			playoutDuration: 1,
			startedPlayback: 1,
			userDuration: 1,
			disabled: 1,
			hidden: 1
		}
	}, { multi: true })

	// Mask all instances as reset
	PartInstances.update({
		rundownId: rundown._id
	}, {
		$set: {
			reset: true
		}
	}, {
		multi: true
	})
	PieceInstances.update({
		rundownId: rundown._id
	}, {
		$set: {
			reset: true
		}
	}, {
		multi: true
	})

	// ensure that any removed infinites are restored
	updateSourceLayerInfinitesAfterPart(rundown)

	const playlist = RundownPlaylists.findOne(rundown.playlistId)
	if (!playlist) throw new Meteor.Error(501, `Orphaned rundown: "${rundown._id}"`)
	resetRundownPlaylistPlayhead(playlist)
}

/**
 * Reset the rundown playlist (all of the rundowns within the playlist):
 * Remove all dynamically inserted/updated pieces, parts, timings etc..
 */
export function resetRundownPlaylist (rundownPlaylist: RundownPlaylist) {
	logger.info('resetRundownPlaylist ' + rundownPlaylist._id)
	// Remove all dunamically inserted pieces (adlibs etc)
	const rundowns = rundownPlaylist.getRundowns()
	const rundownIDs = rundowns.map(i => i._id)
	const rundownLookup = _.object(rundowns.map(i => [ i._id, i ])) as { [key: string]: Rundown }

	// TODO-ASAP do these resets for instances too

	Pieces.remove({
		rundownId: {
			$in: rundownIDs
		},
		dynamicallyInserted: true
	})

	Parts.remove({
		rundownId: {
			$in: rundownIDs
		},
		dynamicallyInserted: true
	})

	Parts.update({
		rundownId: {
			$in: rundownIDs
		}
	}, {
		$unset: {
			duration: 1,
			previousPartEndState: 1,
			startedPlayback: 1,
			timings: 1,
			runtimeArguments: 1,
			stoppedPlayback: 1
		}
	}, { multi: true })

	const dirtyParts = Parts.find({
		rundownId: {
			$in: rundownIDs
		},
		dirty: true
	}).fetch()
	dirtyParts.forEach(part => {
		refreshPart(rundownLookup[part.rundownId], part)
		Parts.update(part._id, {$unset: {
			dirty: 1
		}})
	})

	// Reset all pieces that were modified for holds
	Pieces.update({
		rundownId: {
			$in: rundownIDs
		},
		extendOnHold: true,
		infiniteId: { $exists: true },
	}, {
		$unset: {
			infiniteId: 0,
			infiniteMode: 0,
		}
	}, { multi: true })

	// Reset any pieces that were modified by inserted adlibs
	Pieces.update({
		rundownId: {
			$in: rundownIDs
		},
		originalInfiniteMode: { $exists: true }
	}, {
		$rename: {
			originalInfiniteMode: 'infiniteMode'
		}
	}, { multi: true })

	Pieces.update({
		rundownId: {
			$in: rundownIDs
		}
	}, {
		$unset: {
			playoutDuration: 1,
			startedPlayback: 1,
			userDuration: 1,
			disabled: 1,
			hidden: 1
		}
	}, { multi: true })

	// ensure that any removed infinites are restored
	rundowns.map(r => updateSourceLayerInfinitesAfterPart(r))

	resetRundownPlaylistPlayhead(rundownPlaylist)
}
function resetRundownPlaylistPlayhead (rundownPlaylist: RundownPlaylist) {
	logger.info('resetRundownPlayhead ' + rundownPlaylist._id)
	const rundowns = rundownPlaylist.getRundowns()
	const rundown = _.first(rundowns)
	if (!rundown) throw new Meteor.Error(406, `The rundown playlist was empty, could not find a suitable part.`)

	RundownPlaylists.update(rundownPlaylist._id, {
		$set: {
			previousPartInstanceId: null,
			currentPartInstanceId: null,
			holdState: RundownHoldState.NONE,
		}, $unset: {
			startedPlayback: 1,
			previousPersistentState: 1
		}
	})
	// Also update locally:
	rundownPlaylist.previousPartInstanceId = null
	rundownPlaylist.currentPartInstanceId = null
	rundownPlaylist.holdState = RundownHoldState.NONE
	delete rundownPlaylist.startedPlayback
	delete rundownPlaylist.previousPersistentState

	Rundowns.update({
		playlistId: rundownPlaylist._id
	}, {
		$unset: {
			startedPlayback: 1
		}
	}, {
		multi: true
	})
	// Also update locally:
	rundowns.forEach(rundown => {
		delete rundown.startedPlayback
	})

	if (rundownPlaylist.active) {
		// put the first on queue:
		const firstPart = selectNextPart(null, rundownPlaylist.getParts())
		setNextPart(rundownPlaylist, firstPart ? firstPart.part : null)
	} else {
		setNextPart(rundownPlaylist, null)
	}
}
export function getPartBeforeSegment (rundownId: string, dbSegment: DBSegment): Part | undefined {
	const prevSegment = Segments.findOne({
		rundownId: rundownId,
		_rank: { $lt: dbSegment._rank }
	}, { sort: { _rank: -1 } })
	if (prevSegment) {
		return Parts.findOne({
			rundownId: rundownId,
			segmentId: prevSegment._id,
		}, { sort: { _rank: -1 } })
	}
	return undefined
}
function getPreviousPart (dbPart: DBPart) {
	return Parts.findOne({
		rundownId: dbPart.rundownId,
		_rank: { $lt: dbPart._rank }
	}, { sort: { _rank: -1 } })
}
export function refreshPart (dbRundown: DBRundown, dbPart: DBPart) {
	const ingestSegment = loadCachedIngestSegment(dbRundown._id, dbRundown.externalId, dbPart.segmentId, dbPart.segmentId)

	const studio = Studios.findOne(dbRundown.studioId)
	if (!studio) throw new Meteor.Error(404, `Studio ${dbRundown.studioId} was not found`)
	const rundown = new Rundown(dbRundown)

	updateSegmentsFromIngestData(studio, rundown, [ingestSegment])

	const segment = Segments.findOne(dbPart.segmentId)
	if (!segment) throw new Meteor.Error(404, `Segment ${dbPart.segmentId} was not found`)

	const prevPart = getPartBeforeSegment(dbRundown._id, segment)
	updateSourceLayerInfinitesAfterPart(rundown, prevPart)
}

export function selectNextPart (previousPartInstance: PartInstance | null, parts: Part[]): { part: Part, index: number} | undefined {
	let possibleParts = parts

	if (previousPartInstance !== null) {
		const currentIndex = parts.findIndex(p => p._id === previousPartInstance.part._id)
		// TODO - choose something better for next?
		if (currentIndex !== -1) {
			possibleParts = parts.slice(currentIndex + 1)
		}
	}

	// Filter to after and find the first playabale
	for (let index = 0; index < possibleParts.length; index ++) {
		const part = possibleParts[index]
		if (part.isPlayable()) {
			return { part, index }
		}
	}
	return undefined
}
export function setNextPart (
	rundownPlaylist: RundownPlaylist,
	rawNextPart: DBPart | DBPartInstance | null,
	setManually?: boolean,
	nextTimeOffset?: number | undefined
) {
	const acceptableRundowns = rundownPlaylist.getRundownIDs()
	const { currentPartInstance, nextPartInstance } = rundownPlaylist.getSelectedPartInstances()

	const newNextPartInstance = rawNextPart && 'part' in rawNextPart ? rawNextPart : null
	const newNextPart = rawNextPart && 'part' in rawNextPart ? null : rawNextPart

	let ps: Array<Promise<any>> = []
	if (newNextPart || newNextPartInstance) {

		if ((newNextPart && newNextPart.invalid) || (newNextPartInstance && newNextPartInstance.part.invalid)) {
			throw new Meteor.Error(400, 'Part is marked as invalid, cannot set as next.')
		}
		if (newNextPart && acceptableRundowns.indexOf(newNextPart.rundownId)) {
			throw new Meteor.Error(409, `Part "${newNextPart._id}" not part of RundownPlaylist "${rundownPlaylist._id}"`)
		} else if (newNextPartInstance && acceptableRundowns.indexOf(newNextPartInstance.rundownId)) {
			throw new Meteor.Error(409, `PartInstance "${newNextPartInstance._id}" not part of RundownPlaylist "${rundownPlaylist._id}"`)
		}

		// if (nextPart._id === rundown.currentPartId) {
		// 	throw new Meteor.Error(402, 'Not allowed to Next the currently playing Part')
		// }

		const nextPart = newNextPartInstance ? newNextPartInstance.part : newNextPart!

		if (newNextPart) {
			ps.push(resetPart(newNextPart))
		}

		// create new instance
		let newInstanceId: string
		if (newNextPartInstance) {
			newInstanceId = newNextPartInstance._id
		} if (nextPartInstance && nextPartInstance.part._id === nextPart._id) {
			// Re-use existing
			newInstanceId = nextPartInstance._id
		} else {
			// Create new isntance
			newInstanceId = `${nextPart._id}_${Random.id()}`
			const newTakeCount = currentPartInstance ? currentPartInstance.takeCount + 1 : 0 // Increment
			ps.push(asyncCollectionInsert(PartInstances, {
				_id: newInstanceId,
				takeCount: newTakeCount,
				rundownId: nextPart.rundownId,
				segmentId: nextPart.segmentId,
				part: nextPart
			}))

			const rawPieces = Pieces.find({
				rundownId: nextPart.rundownId,
				partId: nextPart._id
			}).fetch()
			const pieceInstances = _.map(rawPieces, piece => literal<PieceInstance>({
				_id: `${newInstanceId}_${piece._id}`,
				rundownId: nextPart.rundownId,
				partInstanceId: newInstanceId,
				piece: piece
			}))
			ps.push(asyncCollectionInsertMany(PieceInstances, pieceInstances))

			// Remove any instances which havent been taken
			ps.push(asyncCollectionRemove(PartInstances, {
				rundownId: nextPart.rundownId,
				takeCount: { $gte: newTakeCount },
				_id: { $ne: newInstanceId }
			}))

			// TODO - cleanup old pieceInstances
		}

		// reset any previous instances of this part
		ps.push(asyncCollectionUpdate(PartInstances, {
			_id: { $ne: newInstanceId },
			rundownId: nextPart.rundownId,
			'part._id': nextPart._id,
			reset: { $ne: true }
		}, {
			$set: {
				reset: true
			}
		}, {
			multi: true
		}))
		ps.push(asyncCollectionUpdate(PieceInstances, {
			partInstanceId: { $ne: newInstanceId },
			rundownId: nextPart.rundownId,
			'piece.partId': nextPart._id,
			reset: { $ne: true }
		}, {
			$set: {
				reset: true
			}
		}, {
			multi: true
		}))

		ps.push(asyncCollectionUpdate(RundownPlaylists, rundownPlaylist._id, {
			$set: literal<Partial<RundownPlaylist>>({
				nextPartInstanceId: newInstanceId,
				nextPartManual: !!setManually,
				nextTimeOffset: nextTimeOffset || null
			})
		}))
		rundownPlaylist.nextPartInstanceId = newInstanceId
		rundownPlaylist.nextPartManual = !!setManually
		rundownPlaylist.nextTimeOffset = nextTimeOffset || null

	} else {
		// Set to null

		// Remove any instances which havent been taken
		ps.push(asyncCollectionRemove(PartInstances, {
			rundownId: { $in: acceptableRundowns },
			isTaken: { $ne: true } // TODO - this needs setting
		}))

		// TODO - cleanup old pieceInstances

		ps.push(asyncCollectionUpdate(RundownPlaylists, rundownPlaylist._id, {
			$set: literal<Partial<RundownPlaylist>>({
				nextPartInstanceId: null,
				nextPartManual: !!setManually
			})
		}))
		rundownPlaylist.nextPartInstanceId = null
		rundownPlaylist.nextPartManual = !!setManually
	}

	waitForPromiseAll(ps)
}

function resetPart (part: DBPart): Promise<void> {
	let ps: Array<Promise<any>> = []


	ps.push(asyncCollectionUpdate(Parts, {
		// rundownId: part.rundownId,
		_id: part._id
	}, {
		$unset: {
			duration: 1,
			previousPartEndState: 1,
			startedPlayback: 1,
			runtimeArguments: 1,
			dirty: 1,
			stoppedPlayback: 1
		}
	}))
	ps.push(asyncCollectionUpdate(Pieces, {
		// rundownId: part.rundownId,
		partId: part._id
	}, {
		$unset: {
			startedPlayback: 1,
			userDuration: 1,
			disabled: 1,
			hidden: 1
		}
	}, {
		multi: true
	}))
	// remove parts that have been dynamically queued for after this part (queued adLibs)
	ps.push(asyncCollectionRemove(Parts, {
		rundownId: part.rundownId,
		afterPart: part._id,
		dynamicallyInserted: true
	}))

	// Remove all pieces that have been dynamically created (such as adLib pieces)
	ps.push(asyncCollectionRemove(Pieces, {
		rundownId: part.rundownId,
		partId: part._id,
		dynamicallyInserted: true
	}))

	// Reset any pieces that were modified by inserted adlibs
	ps.push(asyncCollectionUpdate(Pieces, {
		rundownId: part.rundownId,
		partId: part._id,
		originalInfiniteMode: { $exists: true }
	}, {
		$rename: {
			originalInfiniteMode: 'infiniteMode'
		}
	}, {
		multi: true
	}))

	let isDirty = part.dirty || false

	if (isDirty) {
		return new Promise((resolve, reject) => {
			const rundown = Rundowns.findOne(part.rundownId)
			if (!rundown) throw new Meteor.Error(404, `Rundown "${part.rundownId}" not found!`)

			Promise.all(ps)
			.then(() => {
				refreshPart(rundown, part)
				resolve()
			}).catch((e) => reject())
		})
	} else {
		const rundown = Rundowns.findOne(part.rundownId)
		if (!rundown) throw new Meteor.Error(404, `Rundown "${part.rundownId}" not found!`)
		const prevPart = getPreviousPart(part)


		return Promise.all(ps)
		.then(() => {
			updateSourceLayerInfinitesAfterPart(rundown, prevPart)
			// do nothing
		})
	}
}
export function onPartHasStoppedPlaying (partInstance: PartInstance, stoppedPlayingTime: Time) {
	const lastStartedPlayback = partInstance.part.getLastStartedPlayback()
	if (partInstance.part.startedPlayback && lastStartedPlayback && lastStartedPlayback > 0) {
		PartInstances.update(partInstance._id, {
			$set: {
				'part.duration': stoppedPlayingTime - lastStartedPlayback
			}
		})

		// TODO-PartInstance - pending new data flow
		Parts.update(partInstance.part._id, {
			$set: {
				duration: stoppedPlayingTime - lastStartedPlayback
			}
		})
		partInstance.part.duration = stoppedPlayingTime - lastStartedPlayback
		pushOntoPath(partInstance.part, 'timings.stoppedPlayback', stoppedPlayingTime)
	} else {
		// logger.warn(`Part "${part._id}" has never started playback on rundown "${rundownId}".`)
	}
}
export function prefixAllObjectIds<T extends TimelineObjGeneric> (objList: T[], prefix: string, ignoreOriginal?: boolean): T[] {
	const getUpdatePrefixedId = (o: T) => {
		let id = o.id
		if (!ignoreOriginal) {
			if (!o.originalId) {
				o.originalId = o.id
			}
			id = o.originalId
		}
		return prefix + id
	}

	const idMap: { [oldId: string]: string | undefined } = {}
	_.each(objList, o => {
		idMap[o.id] = getUpdatePrefixedId(o)
	})

	const replaceIds = (str: string) => {
		return str.replace(/#([a-zA-Z0-9_]+)/g, (m) => {
			const id = m.substr(1, m.length - 1)
			return `#${idMap[id] || id}`
		})
	}

	return objList.map(i => {
		const o = clone(i)
		o.id = getUpdatePrefixedId(o)

		for (const key of _.keys(o.enable)) {
			if (typeof o.enable[key] === 'string') {
				o.enable[key] = replaceIds(o.enable[key])
			}
		}

		if (typeof o.inGroup === 'string') {
			o.inGroup = idMap[o.inGroup] || o.inGroup
		}

		return o
	})
}
