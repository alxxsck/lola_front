import {
  conservativeScenarioGraphLabelSize,
  type ScenarioGraphLabelMeasurer,
} from './model/scenario-graph-auto-layout';

const ICONS = {
  timeout: 'pi pi-clock',
  'goal-timeout': 'pi pi-clock',
  fallback: 'pi pi-ellipsis-h',
  goal: 'pi pi-check',
} as const;

export const measureScenarioGraphEdgeLabel: ScenarioGraphLabelMeasurer = (input) => {
  if (typeof document === 'undefined' || !document.body) {
    return conservativeScenarioGraphLabelSize(input);
  }
  const probe = document.createElement('span');
  const iconClass = ICONS[input.kind as keyof typeof ICONS];
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, {
    position: 'fixed',
    top: '-10000px',
    left: '-10000px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    minHeight: '22px',
    padding: `${input.metrics.paddingY}px ${input.metrics.paddingX}px`,
    border: '1px solid transparent',
    boxSizing: 'border-box',
    fontFamily:
      getComputedStyle(document.documentElement).getPropertyValue('--font-display') || 'sans-serif',
    fontSize: `${input.metrics.fontSize}px`,
    fontWeight: '700',
    lineHeight: '1',
    visibility: 'hidden',
    whiteSpace: 'nowrap',
  });
  if (iconClass) {
    const icon = document.createElement('i');
    icon.className = iconClass;
    probe.append(icon);
  }
  const label = document.createElement('span');
  label.textContent = input.label;
  probe.append(label);
  document.body.append(probe);
  const bounds = probe.getBoundingClientRect();
  probe.remove();
  const measured = {
    width: Math.ceil(bounds.width),
    height: Math.ceil(bounds.height),
  };
  const conservative = conservativeScenarioGraphLabelSize(input);
  return measured.width > 0 && measured.height > 0
    ? {
        width: Math.max(measured.width, conservative.width),
        height: Math.max(measured.height, conservative.height),
      }
    : conservative;
};
