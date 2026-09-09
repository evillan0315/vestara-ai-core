---
title: OVR-000 — VidUK OpenVidu Deployment Audit
version: 1.0.0
status: frozen
owner: vestara
last-reviewed: 2026-09-05
next-review: 2026-10-05
---

# OVR-000 — VidUK OpenVidu Deployment Audit

> **Status: FROZEN.** This audit is the deployment-contract baseline for CSP-020.
> Control plane authority is the native OpenVidu 2.25 REST API (`/openvidu/api/...`).
> The `/api/sessions` application-server endpoint is documented but not the foundation of `openvidu-runtime`.

## Server Identity

```
Base URL:        https://viduk.swinglifestyle.com
OpenVidu Version: 2.25.0
Domain:          viduk.swinglifestyle.com
Public URL:      https://viduk.swinglifestyle.com
TLS:             ✓ (HTTPS returns 200)
```

## Authentication

```
Method:    Basic Auth
Username:  <OpenVidu application username>
Password:  <from .env OPENVIDU_SECRET — do not persist>
```

All endpoints require Basic Auth. Unauthenticated requests return `401 Unauthorized`.

## API Surface

The deployment exposes **two parallel API layers**:

### Application-Server API (`/api/...`)

| Method | Path | Status | Notes |
|--------|------|--------|-------|
| `GET` | `/api/sessions` | 200 | Lists all sessions |
| `POST` | `/api/sessions` | 200 | Creates session (accepts `customSessionId`, `mediaMode`) |
| `GET` | `/api/sessions/{id}` | 200 | Gets session details |
| `POST` | `/api/sessions/{id}/connections` | **404** | **Does not exist on this deployment** |

### Native OpenVidu REST API (`/openvidu/api/...`)

| Method | Path | Status | Notes |
|--------|------|--------|-------|
| `GET` | `/openvidu/api/sessions` | 200 | Lists all sessions |
| `POST` | `/openvidu/api/sessions` | 200 | Creates session |
| `GET` | `/openvidu/api/sessions/{id}` | 200 | Gets session details |
| `DELETE` | `/openvidu/api/sessions/{id}` | 204 | Deletes session |
| `POST` | `/openvidu/api/sessions/{id}/connection` | 200 | Creates connection (**singular**, not plural) |
| `GET` | `/openvidu/api/config` | 200 | Server configuration |
| `GET` | `/openvidu/api/recordings` | 501 | Not implemented (recording disabled) |

### Key Finding

The connection endpoint uses **singular** `/connection`, not plural `/connections`:

```
✓ POST /openvidu/api/sessions/{id}/connection
✗ POST /api/sessions/{id}/connections        (404)
✗ POST /openvidu/api/sessions/{id}/connections (likely 404)
```

## Session Creation

### Request

```http
POST /api/sessions
Content-Type: application/json
Authorization: Basic <base64(OPENVIDUAPP:SECRET)>

{
  "customSessionId": "vestara-room-001",
  "mediaMode": "ROUTED"
}
```

### Response

```json
{
  "id": "vestara-room-001",
  "object": "session",
  "sessionId": "vestara-room-001",
  "createdAt": 1788627968607,
  "recording": false,
  "mediaMode": "ROUTED",
  "recordingMode": "MANUAL",
  "defaultRecordingProperties": {
    "name": "",
    "hasAudio": true,
    "hasVideo": true,
    "outputMode": "COMPOSED",
    "recordingLayout": "BEST_FIT",
    "resolution": "1280x720",
    "frameRate": 25,
    "shmSize": 536870912
  },
  "customSessionId": "vestara-room-001",
  "forcedVideoCodec": "MEDIA_SERVER_PREFERRED",
  "allowTranscoding": false,
  "connections": {
    "numberOfElements": 0,
    "content": []
  }
}
```

## Connection Creation

### Request

```http
POST /openvidu/api/sessions/{sessionId}/connection
Content-Type: application/json
Authorization: Basic <base64(OPENVIDUAPP:SECRET)>

{
  "role": "SUBSCRIBER",
  "data": "participant=eddie"
}
```

### Response

```json
{
  "id": "con_J8yQrHR2qT",
  "object": "connection",
  "status": "pending",
  "connectionId": "con_J8yQrHR2qT",
  "sessionId": "vestara-room-001",
  "createdAt": 1788627970015,
  "type": "WEBRTC",
  "record": true,
  "role": "PUBLISHER",
  "kurentoOptions": null,
  "customIceServers": [],
  "rtspUri": null,
  "adaptativeBitrate": null,
  "onlyPlayWithSubscribers": null,
  "networkCache": null,
  "serverData": "participant=eddie",
  "token": "wss://viduk.swinglifestyle.com?sessionId=vestara-test&token=tok_EXAMPLE_REDACTED",
  "activeAt": null,
  "location": null,
  "ip": null,
  "platform": null,
  "clientData": null,
  "publishers": null,
  "subscribers": null
}
```

### Token Format

```
wss://viduk.swinglifestyle.com?sessionId={sessionId}&token={token}
```

The token is a WebSocket URL with session ID and token query parameters. The `openvidu-browser` SDK consumes this directly.

## Connection Roles

All three roles are supported:

| Role | Tested | Notes |
|------|--------|-------|
| `SUBSCRIBER` | ✓ | Read-only (subscribe to streams) |
| `PUBLISHER` | ✓ | Subscribe + publish (camera/mic) |
| `MODERATOR` | ✓ | Subscribe + publish + force-unpublish/disconnect |

## Server Configuration

```json
{
  "VERSION": "2.25.0",
  "DOMAIN_OR_PUBLIC_IP": "viduk.swinglifestyle.com",
  "HTTPS_PORT": 443,
  "OPENVIDU_PUBLICURL": "https://viduk.swinglifestyle.com",
  "OPENVIDU_CDR": false,
  "OPENVIDU_STREAMS_VIDEO_MAX_RECV_BANDWIDTH": 1000,
  "OPENVIDU_STREAMS_VIDEO_MIN_RECV_BANDWIDTH": 300,
  "OPENVIDU_STREAMS_VIDEO_MAX_SEND_BANDWIDTH": 1000,
  "OPENVIDU_STREAMS_VIDEO_MIN_SEND_BANDWIDTH": 300,
  "OPENVIDU_STREAMS_FORCED_VIDEO_CODEC": "MEDIA_SERVER_PREFERRED",
  "OPENVIDU_STREAMS_ALLOW_TRANSCODING": false,
  "OPENVIDU_WEBRTC_SIMULCAST": false,
  "OPENVIDU_SESSIONS_GARBAGE_INTERVAL": 1800,
  "OPENVIDU_SESSIONS_GARBAGE_THRESHOLD": 900,
  "OPENVIDU_RECORDING": false,
  "OPENVIDU_WEBHOOK": true,
  "OPENVIDU_WEBHOOK_ENDPOINT": "https://chatv.swinglifestyle.com/activities?token=<SECRET>",
  "OPENVIDU_WEBHOOK_EVENTS": ["recordingStatusChanged"]
}
```

### Key Observations

| Setting | Value | Implication |
|---------|-------|-------------|
| Video codec | `MEDIA_SERVER_PREFERRED` | Server chooses (likely VP8 or H264) |
| Transcoding | disabled | Clients must support the negotiated codec |
| Simulcast | disabled | Single quality layer per publisher |
| Recording | disabled | No server-side recording |
| Webhook | enabled | Events sent to `chatv.swinglifestyle.com` |
| Session GC | 1800s interval, 900s threshold | Empty sessions live ~15-30 min |
| Bandwidth | 300-1000 kbps | Reasonable for video conferencing |

### Webhook

```
Endpoint: https://chatv.swinglifestyle.com/activities?token=<SECRET>
Events:   ["recordingStatusChanged"]
```

⚠️ **Security note**: The webhook URL in the config response contains the `OPENVIDU_SECRET` as a query parameter. This is server-side only and never exposed to browsers.

## WebRTC Connectivity

### Token → Browser Flow

```
1. Vestara API creates session
   POST /api/sessions → sessionId

2. Vestara API creates connection
   POST /openvidu/api/sessions/{sessionId}/connection
   → token: "wss://viduk.swinglifestyle.com?sessionId=...&token=..."

3. Browser receives token
   → openvidu-browser: session.connect(token)

4. WebRTC negotiation
   → ICE/STUN/TURN via viduk.swinglifestyle.com

5. Media flows
   → Audio/video via WebRTC
```

### ICE/TURN

The server configuration does not explicitly list ICE servers. OpenVidu 2.25.0 uses its own built-in Coturn for TURN. The `customIceServers` field in connections is empty by default.

## Acceptance Summary

| Check | Status |
|-------|--------|
| TLS | ✓ |
| Basic Auth | ✓ |
| Session creation | ✓ |
| Session listing | ✓ |
| Session deletion | ✓ |
| Connection creation (SUBSCRIBER) | ✓ |
| Connection creation (PUBLISHER) | ✓ |
| Connection creation (MODERATOR) | ✓ |
| Token format | ✓ (`wss://...?sessionId=...&token=...`) |
| Custom session IDs | ✓ |
| Server config endpoint | ✓ |
| Recording | ✗ (disabled, 501) |
| Webhook | ✓ (enabled, `recordingStatusChanged`) |

## Vestara API Proxy Design

```text
Browser (Workspace)
    │
    │ POST /api/media/openvidu/sessions
    ▼
Vestara API
    │
    │ Basic Auth (server-side only)
    ▼
POST https://viduk.swinglifestyle.com/api/sessions
    │
    ▼
sessionId
    │
    │ POST /api/media/openvidu/sessions/{id}/connections
    ▼
Vestara API
    │
    │ Basic Auth (server-side only)
    ▼
POST https://viduk.swinglifestyle.com/openvidu/api/sessions/{id}/connection
    │
    ▼
token
    │
    ◄──────────────────────┘
    │
    ▼
Browser: session.connect(token)
    │
    ▼
WebRTC media (direct, not through Vestara)
```

### Vestara Endpoints

```text
POST   /api/media/openvidu/sessions
GET    /api/media/openvidu/sessions/:id
DELETE /api/media/openvidu/sessions/:id
POST   /api/media/openvidu/sessions/:id/connections
POST   /api/media/openvidu/sessions/:id/leave
```

Each endpoint proxies to the corresponding OpenVidu endpoint with server-side Basic Auth.

## ⚠️ Security Findings

1. **Webhook leaks secret in config response**: `OPENVIDU_WEBHOOK_ENDPOINT` contains the secret as a query parameter. This is visible via `GET /openvidu/api/config`. Ensure this endpoint is never exposed to the browser.

2. **Session garbage collection**: Empty sessions are cleaned up after ~15-30 minutes. The Vestara API should handle session expiry gracefully.

3. **No recording**: Server-side recording is disabled. If recording is needed later, it must be enabled in the OpenVidu server configuration.

4. **Token is a WebSocket URL**: The token is not a JWT or opaque string — it's a full `wss://` URL. The `openvidu-browser` SDK handles this, but custom clients must parse it correctly.
