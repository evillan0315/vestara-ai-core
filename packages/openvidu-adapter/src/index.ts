/**
 * @vestara/openvidu-adapter
 *
 * OpenVidu 2.25 adapter behind the MediaServer port.
 *
 * Architecture Traceability:
 *   CSP-020 → OVR-002 Native OpenVidu Adapter
 */

export type { OpenViduErrorCategory } from './openvidu-errors';
export { classifyOpenViduError, isOpenViduError, normalizeToMediaError, OpenViduError } from './openvidu-errors';
export { OpenViduMediaServer } from './openvidu-media-server';
export type { OpenViduTransport } from './openvidu-transport';
export { createMockTransport, createOpenViduTransport } from './openvidu-transport';
export type { OpenViduConfig, OpenViduRole } from './openvidu-types';
export { OPENVIDU_PATHS } from './openvidu-types';
export { capabilitiesToOpenViduRole, openViduRoleToCapabilities } from './role-mapping';
