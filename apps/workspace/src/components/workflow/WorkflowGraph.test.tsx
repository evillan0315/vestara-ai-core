/** @vitest-environment jsdom */

import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { WorkflowGraph } from './WorkflowGraph';

// Cytoscape mounts only for non-empty graphs (needs a real canvas), so
// these cases cover states, chrome, and toolbar composition — all of which
// must render without touching the renderer.

describe('WorkflowGraph', () => {
  it('shows the error state over everything else', () => {
    render(<WorkflowGraph graph={null} error="Graph unavailable until a plan exists." />);
    expect(screen.getByText('Graph unavailable until a plan exists.')).toBeInTheDocument();
  });

  it('shows the default empty state when no graph is provided', () => {
    render(<WorkflowGraph graph={null} />);
    expect(screen.getByText('Select a workflow project to view its graph.')).toBeInTheDocument();
  });

  it('honors a custom empty message', () => {
    render(<WorkflowGraph graph={null} emptyMessage="Pick a workflow to preview." />);
    expect(screen.getByText('Pick a workflow to preview.')).toBeInTheDocument();
  });

  it('shows a loading skeleton while the graph resolves', () => {
    render(<WorkflowGraph graph={null} isLoading />);
    expect(screen.getByRole('status', { name: 'Loading workflow graph' })).toBeInTheDocument();
  });

  it('renders panel chrome with title, legend, and view controls by default', () => {
    render(<WorkflowGraph graph={null} />);
    expect(screen.getByText('Workflow graph')).toBeInTheDocument();
    expect(screen.getByLabelText('Workflow graph legend')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Graph view controls' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Fit view' })).toBeDisabled();
  });

  it('renders bare chrome without panel furniture for embedding', () => {
    render(<WorkflowGraph chrome="bare" graph={null} showLegend={false} showControls={false} />);
    expect(screen.queryByText('Workflow graph')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Workflow graph legend')).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Graph view controls' })).not.toBeInTheDocument();
    expect(screen.getByText('Select a workflow project to view its graph.')).toBeInTheDocument();
  });

  it('hides the legend on request while keeping controls', () => {
    render(<WorkflowGraph graph={null} showLegend={false} />);
    expect(screen.queryByLabelText('Workflow graph legend')).not.toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Graph view controls' })).toBeInTheDocument();
  });
});
