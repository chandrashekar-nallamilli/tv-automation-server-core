import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { Rundown } from '../../../lib/collections/Rundowns'
import { ServerPlayoutAPI } from '../playout/playout'
import { fetchNext } from '../../../lib/lib'
import { RundownPlaylists, RundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { moveNext } from '../userActions'
import { selectNextPart } from '../playout/lib'

export namespace UpdateNext {
	export function ensureNextPartIsValid (playlist: RundownPlaylist) {
		// Ensure the next-id is still valid
		if (playlist && playlist.active && playlist.nextPartInstanceId) {
			const { currentPartInstance, nextPartInstance } = playlist.getSelectedPartInstances()
			const allParts = playlist.getParts()

			if (currentPartInstance) {
				// Leave the manually chosen part
				const oldNextPart = nextPartInstance ? allParts.find(p => p._id === nextPartInstance.part._id) : undefined
				if (playlist.nextPartManual && oldNextPart) {
					return
				}

				// Check if the part is the same
				const newNextPart = selectNextPart(currentPartInstance, allParts)
				if (newNextPart && nextPartInstance && newNextPart.part._id === nextPartInstance.part._id) {
					return
				}

				// TODO-PartInstances - if nextPart is very close to being on air during an autonext, then leave it

				// Set to the newly selected part
				ServerPlayoutAPI.setNextPartInner(playlist, newNextPart ? newNextPart.part : null)
			} else {
				// Don't have a currentPart, so set next to first in the show
				const newNextPart = selectNextPart(null, allParts)
				ServerPlayoutAPI.setNextPartInner(playlist, newNextPart ? newNextPart.part : null)
			}
		}
	}
	export function afterInsertParts (playlist: RundownPlaylist, newPartExternalIds: string[], removePrevious: boolean) {
		if (playlist && playlist.active) {
			// If manually chosen, and could have been removed then special case handling
			if (!playlist.nextPartInstanceId && playlist.currentPartInstanceId) {
				// The playhead is probably at the end of the rundown

				// Try and choose something
				const { currentPartInstance } = playlist.getSelectedPartInstances()
				const newNextPart = selectNextPart(currentPartInstance || null, playlist.getParts())
				ServerPlayoutAPI.setNextPartInner(playlist, newNextPart ? newNextPart.part : null)

			} else if (playlist.nextPartManual && removePrevious) {
				const { nextPartInstance } = playlist.getSelectedPartInstances()
				const allParts = playlist.getParts()

				// If the manually chosen part does not exist, assume it was the one that was removed
				const currentNextPart = nextPartInstance ? allParts.find(part => part._id === nextPartInstance.part._id) : undefined
				if (!currentNextPart) {
					// Set to the first of the inserted parts
					const firstNewPart = allParts.find(part => newPartExternalIds.indexOf(part.externalId) !== -1 && part.isPlayable())
					if (firstNewPart) {
						// Matched a part that replaced the old, so set to it
						ServerPlayoutAPI.setNextPartInner(playlist, firstNewPart)

					} else {
						// Didn't find a match. Lets assume it is because the specified part was the one that was removed, so auto it
						UpdateNext.ensureNextPartIsValid(playlist)
					}
				}
			} else {
				// Ensure next is valid
				UpdateNext.ensureNextPartIsValid(playlist)
			}
		}
	}
}
