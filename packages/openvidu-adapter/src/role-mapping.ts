/**
 * @vestara/openvidu-adapter — Role/Capability Mapping
 *
 * Maps between Vestara provider-neutral capabilities and OpenVidu roles.
 * Mapping occurs at the adapter boundary — OpenVidu role enums never
 * leak beyond this package.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-002 Native OpenVidu Adapter
 */

import type { MediaParticipantCapabilities } from '@vestara/media-runtime';
import type { OpenViduRole } from './openvidu-types';

/**
 * Maps Vestara capabilities → OpenVidu role.
 *
 * If the capabilities cannot be exactly represented by an OpenVidu role,
 * this returns undefined (caller must reject).
 */
export function capabilitiesToOpenViduRole(capabilities: MediaParticipantCapabilities): OpenViduRole | undefined {
  const { publishAudio, publishVideo, subscribe, moderate } = capabilities;

  // MODERATOR: must have all capabilities
  if (moderate && subscribe && (publishAudio || publishVideo)) {
    return 'MODERATOR';
  }

  // PUBLISHER: publish + subscribe, no moderate
  if (!moderate && subscribe && (publishAudio || publishVideo)) {
    return 'PUBLISHER';
  }

  // SUBSCRIBER: subscribe only, no publish, no moderate
  if (!moderate && subscribe && !publishAudio && !publishVideo) {
    return 'SUBSCRIBER';
  }

  // Cannot represent: no subscribe, or other combinations
  return undefined;
}

/**
 * Maps OpenVidu role → Vestara capabilities.
 */
export function openViduRoleToCapabilities(role: OpenViduRole): MediaParticipantCapabilities {
  switch (role) {
    case 'MODERATOR':
      return {
        publishAudio: true,
        publishVideo: true,
        subscribe: true,
        moderate: true,
      };
    case 'PUBLISHER':
      return {
        publishAudio: true,
        publishVideo: true,
        subscribe: true,
        moderate: false,
      };
    case 'SUBSCRIBER':
      return {
        publishAudio: false,
        publishVideo: false,
        subscribe: true,
        moderate: false,
      };
  }
}
