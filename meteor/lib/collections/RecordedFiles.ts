import { TransformedCollection } from '../typings/meteor'
import { registerCollection, Time, ProtectedString } from '../lib'
import { Meteor } from 'meteor/meteor'
import { createMongoCollection } from './lib'
import { StudioId } from './Studios'
import { registerIndex } from '../database'

/** A string, identifying a RecordedFile */
export type RecordedFileId = ProtectedString<'RecordedFileId'>

export interface RecordedFile {
	_id: RecordedFileId
	/** Id of the studio this file originates from */
	studioId: StudioId
	modified: Time
	name: string
	path: string
	startedAt: Time
	stoppedAt?: Time
}

export const RecordedFiles: TransformedCollection<RecordedFile, RecordedFile> = createMongoCollection<RecordedFile>(
	'recordedFiles'
)
registerCollection('RecordedFiles', RecordedFiles)

registerIndex(RecordedFiles, {
	studioId: 1,
})
