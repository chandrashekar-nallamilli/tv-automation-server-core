import * as React from 'react'
import * as CoreIcons from '@nrk/core-icons/jsx'
import * as Escape from 'react-escape'
import * as ClassNames from 'classnames'
import * as VelocityReact from 'velocity-react'

interface IModalDialogAttributes {
	show?: boolean
	title: string
	secondaryText?: string
	acceptText: string
	onAccept?: (e) => void
	onSecondary?: (e) => void
	onDiscard?: (e) => void
}
export class ModalDialog extends React.Component<IModalDialogAttributes> {
	constructor (args) {
		super(args)

		this.componentDidMount = () => {
			document.addEventListener('keydown', this.handleConfirmKey)
		}
		this.componentWillUnmount = () => {
			document.removeEventListener('keydown', this.handleConfirmKey)
		}
	}
	handleConfirmKey = (e) => {
		if (this.props.show) {
			if (e.keyCode === 13) { // Enter
				this.handleAccept(e)
			} else if (e.keyCode === 27) { // Escape
				this.handleSecondary(e)
			}
		}
	}
	handleAccept = (e) => {
		if (this.props.onAccept && typeof this.props.onAccept === 'function') {
			this.props.onAccept(e)
		}
	}

	handleSecondary = (e) => {
		if (this.props.onSecondary && typeof this.props.onSecondary === 'function') {
			this.props.onSecondary(e)
		}
	}

	handleDiscard = (e) => {
		if (this.props.onDiscard && typeof this.props.onDiscard === 'function') {
			this.props.onDiscard(e)
		} else {
			this.handleSecondary(e)
		}
	}

	render () {
		return this.props.show ?
					<Escape to='viewport'>
						<VelocityReact.VelocityTransitionGroup enter={{ animation: 'fadeIn', easing: 'ease-out', duration: 250 }} runOnMount={true}>
							<div className='glass-pane'>
								<div className='glass-pane-content'>
									<VelocityReact.VelocityTransitionGroup enter={{ animation: {
										translateY: [0, 100],
										opacity: [1, 0]
									}, easing: 'spring', duration: 250 }} runOnMount={true}>
										<div className='border-box overlay-m'>
											<div className='flex-row info vertical-align-stretch tight-s'>
												<div className='flex-col c12'>
													<h2>
														{this.props.title}
													</h2>
												</div>
												<div className='flex-col horizontal-align-right vertical-align-middle'>
													<p>
														<button className='action-btn' onClick={this.handleDiscard}>
															<CoreIcons id='nrk-close' />
														</button>
													</p>
												</div>
											</div>
											<div className='title-box-content'>
												{this.props.children}
											</div>
											<div className={ClassNames('mod', {
												'alright': !this.props.secondaryText
											})}>
												{
													this.props.secondaryText &&
													<button className='btn btn-secondary' onClick={this.handleSecondary}>{this.props.secondaryText}</button>
												}
												<button className={ClassNames('btn btn-primary', {
													'right': this.props.secondaryText !== undefined
												})} onClick={this.handleAccept}>{this.props.acceptText}</button>
											</div>
										</div>
									</VelocityReact.VelocityTransitionGroup>
								</div>
							</div>
						</VelocityReact.VelocityTransitionGroup>
					</Escape>
				: null
	}
}
