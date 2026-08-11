/**
 * @vestara/tools-browser — governed browser / computer-use tools for the Agent
 * Harness Tool Runtime.
 */

export {
  abortError,
  type BrowserDriver,
  type BrowserNavigationResult,
  type BrowserPoint,
  type BrowserReplayDescriptor,
  type BrowserReplayStep,
  type BrowserScreenshotResult,
  BrowserSession,
  type BrowserSessionOptions,
  type BrowserSnapshotResult,
  type EvidenceGovernance,
  type InformationClassification,
  type InformationRiskLevel,
  informationRiskFor,
  isAbortError,
  isInformationClassification,
  isRedactionMode,
  normalizeOrigin,
  type OriginPolicy,
  originMatches,
  PlaywrightBrowserDriver,
  type RedactionMode,
  type RedactionStatus,
  type ResolvedPolicy,
  redactText,
  resolveBrowserUrl,
  sessionKey,
} from './session';
export {
  BrowserClickTool,
  BrowserCloseTool,
  BrowserNavigateTool,
  type BrowserScreenshotOutput,
  BrowserScreenshotTool,
  BrowserSnapshotTool,
  BrowserTypeTool,
} from './tools';
