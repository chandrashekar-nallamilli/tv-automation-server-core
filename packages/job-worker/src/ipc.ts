import { interceptLogging, LogEntry, logger } from './logging'
import { FastTrackTimelineFunc, JobSpec, JobWorkerBase } from './main'
import { JobManager, JobStream } from './manager'
import { WorkerId } from '@sofie-automation/corelib/dist/dataModel/Ids'

/**
 * A very simple implementation of JobManager, that is designed to work via threadedClass over IPC
 */
class IpcJobManager implements JobManager {
	constructor(
		public readonly jobFinished: (
			id: string,
			startedTime: number,
			finishedTime: number,
			error: any,
			result: any
		) => Promise<void>,
		public readonly queueJob: (queueName: string, jobName: string, jobData: unknown) => Promise<void>,
		private readonly interruptJobStream: (queueName: string) => Promise<void>,
		private readonly getNextJob: (queueName: string) => Promise<JobSpec | null>
	) {}

	public subscribeToQueue(queueName: string, _workerId: WorkerId): JobStream {
		return {
			next: async () => this.getNextJob(queueName),
			interrupt: () => {
				this.interruptJobStream(queueName).catch((e) =>
					logger.error(`Failed to interupt job queue ${queueName}: ${e}`)
				)
			},
			close: async () => Promise.resolve(),
		}
	}
}

/**
 * Entrypoint for threadedClass
 */
export class IpcJobWorker extends JobWorkerBase {
	constructor(
		workerId: WorkerId,
		jobFinished: (id: string, startedTime: number, finishedTime: number, error: any, result: any) => Promise<void>,
		interruptJobStream: (queueName: string) => Promise<void>,
		getNextJob: (queueName: string) => Promise<JobSpec | null>,
		queueJob: (queueName: string, jobName: string, jobData: unknown) => Promise<void>,
		logLine: (msg: LogEntry) => Promise<void>,
		fastTrackTimeline: FastTrackTimelineFunc
	) {
		// Intercept logging to pipe back over ipc
		interceptLogging('worker-parent', async (msg) => logLine(msg))

		const jobManager = new IpcJobManager(jobFinished, queueJob, interruptJobStream, getNextJob)
		super(workerId, jobManager, logLine, fastTrackTimeline)
	}
}
