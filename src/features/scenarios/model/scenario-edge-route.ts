export interface ScenarioEdgeRouteInput {
  sourceX: number
  sourceY: number
  targetX: number
  targetY: number
  routeIndex: number
  routeCount: number
  laneGap: number
}

export interface ScenarioEdgeRoute {
  path: string
  labelX: number
  labelY: number
}

export function buildScenarioEdgeRoute(input: ScenarioEdgeRouteInput): ScenarioEdgeRoute {
  const labelX = input.sourceX
  const labelY = input.sourceY + 16 + input.routeIndex * input.laneGap
  const laneOffset = (input.routeIndex - (input.routeCount - 1) / 2) * input.laneGap
  const channelX = input.targetX + laneOffset
  const firstTurnY = labelY + 12
  const targetTurnY = Math.max(firstTurnY + 12, input.targetY - 24)
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
  }
}
