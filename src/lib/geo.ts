/** Simple equirectangular projection for the Kazakhstan view box. */
export const MAP_BBOX = { west: 44, east: 89, south: 37, north: 56.5 };

export function project(lngLat: [number, number], width: number, height: number) {
  const [lng, lat] = lngLat;
  const x = ((lng - MAP_BBOX.west) / (MAP_BBOX.east - MAP_BBOX.west)) * width;
  const y = ((MAP_BBOX.north - lat) / (MAP_BBOX.north - MAP_BBOX.south)) * height;
  return [x, y] as const;
}

export function polygonPath(points: [number, number][], width: number, height: number) {
  return (
    points
      .map((p, i) => {
        const [x, y] = project(p, width, height);
        return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ') + ' Z'
  );
}

export function linePath(points: [number, number][], width: number, height: number) {
  return points
    .map((p, i) => {
      const [x, y] = project(p, width, height);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

/** Approximate outline of Kazakhstan, used as map backdrop. */
export const KZ_OUTLINE: [number, number][] = [
  [46.5, 47.1], [47.9, 49.0], [50.3, 50.6], [53.9, 52.2], [57.3, 53.6], [61.4, 55.1],
  [65.8, 55.6], [70.3, 55.6], [74.0, 54.1], [77.6, 54.1], [80.6, 52.6], [84.0, 52.2],
  [86.4, 50.4], [87.2, 49.1], [86.6, 47.2], [84.0, 45.0], [80.4, 44.0], [78.0, 42.6],
  [74.0, 42.6], [71.0, 42.1], [68.3, 41.0], [66.4, 41.6], [64.0, 43.0], [61.0, 43.6],
  [58.3, 45.1], [55.3, 45.1], [52.3, 45.0], [49.4, 46.3],
];
