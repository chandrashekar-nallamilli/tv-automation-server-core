import { TFunction } from 'i18next'
import { Meteor } from 'meteor/meteor'
import { ClientAPI } from '../client'
import { doUserAction as clientDoUserAction } from '../../../client/lib/userAction'
import { UserAction } from '../../userAction'

export function doUserAction<Result>(
	t: TFunction,
	userEvent: any,
	action: UserAction,
	fcn: (event: any) => Promise<ClientAPI.ClientResponse<Result>>,
	callback?: (err: any, res?: Result) => void | boolean,
	okMessage?: string
) {
	if (Meteor.isClient) {
		clientDoUserAction(t, userEvent, action, fcn, callback, okMessage)
	} else {
		fcn(userEvent).then(
			(value) =>
				typeof callback === 'function' &&
				(ClientAPI.isClientResponseSuccess(value) ? callback(undefined, value.result) : callback(value)),
			(reason) => typeof callback === 'function' && callback(reason)
		)
	}
}
