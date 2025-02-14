import { Time } from '@sofie-automation/blueprints-integration'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import { WorkerId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { protectString } from '../lib'
import { createMongoCollection } from './lib'
export { WorkerId }

export interface WorkerStatus {
	_id: WorkerId
	/** A user-facing name */
	name: string
	/** The instance id is unique each time a worker starts up */
	instanceId: string
	/** Timestamp for when the worker was first created */
	createdTime: Time
	/** Timestamp for when the worker was last started */
	startTime: Time
	/** Timestamp of last status update  */
	lastUpdatedTime: Time

	/** If the worker is connected (alive) or not */
	connected: boolean

	status: string
	// studioId (or other context-descriptor)
}

export const Workers = createMongoCollection<WorkerStatus>(CollectionName.Workers)

export function getWorkerId(): WorkerId {
	// This is a placeholder function for now.
	// Later on, when we support multiple workers, this will determine unique worker names using things like
	// the studio it works on, etc.

	return protectString('default')
}
