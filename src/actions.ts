/* eslint-disable @typescript-eslint/camelcase */
import { CompanionActionEvent, CompanionActions, DropdownChoice } from '../../../instance_skel_types';
import { BroadcastID, BroadcastLifecycle, BroadcastMap, StateMemory } from './cache';
import { Core } from './core';
import YoutubeInstance = require('./index');

/**
 * Interface for implementing module actions
 */
export interface ActionHandler {
	/** Transition broadcast to the "testing" state (from "ready") */
	startBroadcastTest(id: BroadcastID): Promise<void>;

	/** Transition broadcast to the "live" state (from "testing" or "ready") */
	makeBroadcastLive(id: BroadcastID): Promise<void>;

	/** Transition broadcast to the "complete" state (from "live") */
	finishBroadcast(id: BroadcastID): Promise<void>;

	/** Transition broadcast to next state (ready -> testing -> live -> complete) */
	toggleBroadcast(id: BroadcastID): Promise<void>;

	/** Reload broadcast list */
	reloadEverything(): Promise<void>;

	/** Refresh broadcast status + stream health */
	refreshFeedbacks(): Promise<void>;
}

/**
 * Generate list of Companion actions for this module
 * @param broadcasts Known broadcasts
 */
export function listActions(broadcasts: BroadcastMap): CompanionActions {
	const broadcastEntries: DropdownChoice[] = Object.values(broadcasts).map(
		(item): DropdownChoice => {
			return { id: item.Id, label: item.Name };
		}
	);

	return {
		init_broadcast: {
			label: 'Start broadcast test',
			options: [
				{
					type: 'dropdown',
					label: 'Broadcast:',
					id: 'broadcast_id',
					choices: [{id: 'current', 'label': 'Next Scheduled'}, ...broadcastEntries],
					default: 'current',
				},
			],
		},
		start_broadcast: {
			label: 'Go live',
			options: [
				{
					type: 'dropdown',
					label: 'Broadcast:',
					id: 'broadcast_id',
					choices: [{id: 'current', 'label': 'Oldest in Test or Next Scheduled'}, ...broadcastEntries],
					default: 'current',
				},
			],
		},
		stop_broadcast: {
			label: 'Finish broadcast',
			options: [
				{
					type: 'dropdown',
					label: 'Broadcast:',
					id: 'broadcast_id',
					choices: [{id: 'current', 'label': 'Current Live (Oldest if multiple live)'}, ...broadcastEntries],
					default: 'current',
				},
			],
		},
		toggle_broadcast: {
			label: 'Advance broadcast to next phase',
			options: [
				{
					type: 'dropdown',
					label: 'Broadcast:',
					id: 'broadcast_id',
					choices: [{id: 'current', 'label': 'Current Stream (see docs for details)'}, ...broadcastEntries],
					default: 'current',
				},
			],
		},
		refresh_feedbacks: {
			label: 'Refresh broadcast/stream feedbacks',
			options: [],
		},
		refresh_status: {
			label: 'Reload everything from YouTube',
			options: [],
		},
	};
}

/**
 * Redirect Companion action event to the appropriate implementation
 * @param event Companion event metadata
 * @param memory Known broadcasts and streams
 * @param handler Implementation of actions
 * @param instance
 */
export async function handleAction(
	event: CompanionActionEvent,
	memory: StateMemory,
	handler: Core,
	instance: YoutubeInstance
): Promise<void> {
	let broadcast_id = event.options && event.options.broadcast_id ? event.options.broadcast_id as BroadcastID : null;
	if (broadcast_id) {
		if (event.options.broadcast_id == 'current') {
			switch (event.action) {
				case 'init_broadcast':
					broadcast_id = handler.filterBroadcasts(BroadcastLifecycle.Ready, 'ScheduledStartTime');
					break;
				case 'start_broadcast':
					broadcast_id = handler.filterBroadcasts(BroadcastLifecycle.Testing, 'ActualStartTime');
					if (!broadcast_id) {
						broadcast_id = handler.filterBroadcasts(BroadcastLifecycle.Ready, 'ScheduledStartTime');
					}
					break;
				case 'stop_broadcast':
					broadcast_id = handler.filterBroadcasts(BroadcastLifecycle.Live, 'ActualStartTime');
					break;
				case 'toggle_broadcast':
					broadcast_id = handler.filterBroadcasts(BroadcastLifecycle.Live, 'ActualStartTime');
					if (!broadcast_id) {
						broadcast_id = handler.filterBroadcasts(BroadcastLifecycle.Testing, 'ActualStartTime');
						if (!broadcast_id) {
							broadcast_id = handler.filterBroadcasts(BroadcastLifecycle.Ready, 'ScheduledStartTime');
						}
					}
			}
			instance.log('debug', 'Using broadcast_id ' + broadcast_id + 'for ' + event.action);
		}

		if (broadcast_id === null || !(broadcast_id in memory.Broadcasts)) {
			throw new Error('Action has unknown broadcast ID');
		}
	} else {
		if (event.action != 'refresh_status' && event.action != 'refresh_feedbacks') {
			throw new Error('Action has undefined broadcast ID');
		}
	}

	if (event.action == 'init_broadcast') {
		return handler.startBroadcastTest(broadcast_id as BroadcastID);
	} else if (event.action == 'start_broadcast') {
		return handler.makeBroadcastLive(broadcast_id as BroadcastID);
	} else if (event.action == 'stop_broadcast') {
		return handler.finishBroadcast(broadcast_id as BroadcastID);
	} else if (event.action == 'toggle_broadcast') {
		return handler.toggleBroadcast(broadcast_id as BroadcastID);
	} else if (event.action == 'refresh_status') {
		return handler.reloadEverything();
	} else if (event.action == 'refresh_feedbacks') {
		return handler.refreshFeedbacks();
	} else {
		throw new Error(`unknown action called: ${event.action}`);
	}
}
