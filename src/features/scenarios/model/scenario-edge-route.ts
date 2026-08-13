export interface ScenarioEdgeRouteInput {
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  routeIndex: number;
  routeCount: number;
  laneGap: number;
  layoutPoints?: Array<{ x: number; y: number }>;
  labelPosition?: { x: number; y: number };
}

export interface ScenarioEdgeRoute {
  path: string;
  labelX: number;
  labelY: number;
}

export function buildScenarioEdgeRoute(input: ScenarioEdgeRouteInput): ScenarioEdgeRoute {
  const labelX = input.labelPosition?.x ?? input.sourceX;
  const labelY = input.labelPosition?.y ?? input.sourceY + 16 + input.routeIndex * input.laneGap;
  if (input.layoutPoints && input.layoutPoints.length >= 2) {
    const points = [{ x: input.sourceX, y: input.sourceY }];
    for (const desired of [
      ...input.layoutPoints.slice(1, -1),
      { x: input.targetX, y: input.targetY },
    ]) {
      const current = points.at(-1)!;
      if (current.x !== desired.x && current.y !== desired.y) {
        points.push({ x: current.x, y: desired.y });
      }
      if (points.at(-1)!.x !== desired.x || points.at(-1)!.y !== desired.y) {
        points.push(desired);
      }
    }
    return {
      labelX,
      labelY,
      path: points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' '),
    };
  }
  const laneOffset = (input.routeIndex - (input.routeCount - 1) / 2) * input.laneGap;
  const channelX = input.targetX + laneOffset;
  const firstTurnY = labelY + 12;
  const targetTurnY = Math.max(firstTurnY + 12, input.targetY - 24);
  return {
    labelX,
    labelY,
    path: [
      `M ${input.sourceX} ${input.sourceY}`,
      `L ${input.sourceX} ${firstTurnY}`,
      `L ${channelX} ${firstTurnY}`,
      `L ${channelX} ${targetTurnY}`,
      `L ${input.targetX} ${targetTurnY}`,
      `L ${input.targetX} ${input.targetY}`,
    ].join(' '),
  };
}
