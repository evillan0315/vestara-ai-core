/**
 * VESTARA Extractor — governed types (Phase 1 MVP).
 *
 * Client-side only. No server, no new dependencies.
 * Fixtures live in `extractor.fixtures.js` — never inline arrays in JSX.
 */

export type ExtractorCategory = 'code' | 'docs' | 'ui';

export interface ExtractedProp {
  readonly name: string;
  readonly type: string;
  readonly defaultValue: string;
  readonly description: string;
}

export interface ExtractedSource {
  /** Minified bundle snippet as found in artifact.html. */
  readonly original: string;
  /** Readable reconstruction (Phase 2 uses a real AST; Phase 1 is a stub). */
  readonly clean: string;
}

export interface ExtractedComponent {
  readonly id: string;
  /** Original minified var name (e.g. `qe`). */
  readonly varName: string;
  readonly name: string;
  readonly description: string;
  readonly file: string;
  readonly category: ExtractorCategory;
  readonly sizeKb: number;
  readonly source: ExtractedSource;
  readonly props: readonly ExtractedProp[];
  readonly dependencies: readonly string[];
}

export interface ExtractorFileNode {
  readonly path: string;
  readonly name: string;
  readonly kind: 'dir' | 'file';
  readonly children?: readonly ExtractorFileNode[];
}

export interface ExtractionFrameworks {
  /** e.g. `18.3.1` from the vendored React version assignment. */
  readonly react: string | null;
  /** e.g. `3.4.18` from the Tailwind license banner. */
  readonly tailwind: string | null;
}

export interface ExtractionResult {
  readonly bundleKb: number;
  readonly cssKb: number;
  readonly componentCount: number;
  readonly varNames: readonly string[];
  /** Bundle vars with no registry entry — counted, never guessed. */
  readonly unmappedVarCount: number;
  readonly frameworks: ExtractionFrameworks;
  readonly tokensCss: string;
  readonly manifestJson: string;
  readonly fileTree: readonly ExtractorFileNode[];
  readonly components: readonly ExtractedComponent[];
}
