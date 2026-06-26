/** Órbita ISS projetada (~1 volta / 92.68 min, inclinação 51.6°). */

export interface OrbitCoord {
  lat: number;
  lng: number;
}

const ORBITAL_PERIOD_MIN = 92.68;
const INCLINATION_RAD = (51.6 * Math.PI) / 180;
const DEG_PER_MIN = 360 / ORBITAL_PERIOD_MIN;

/** ~90 min de trail: ±46 min em torno da posição atual. */
export function projectIssOrbit(
  currentLat: number,
  currentLng: number,
): OrbitCoord[] {
  const points: OrbitCoord[] = [];

  for (let min = -46; min <= 46; min += 2) {
    const angle = ((min * DEG_PER_MIN) * Math.PI) / 180;
    const lat =
      (Math.asin(Math.sin(INCLINATION_RAD) * Math.sin(angle)) * 180) /
      Math.PI;
    let lng = currentLng + min * DEG_PER_MIN;
    lng = ((lng + 540) % 360) - 180;
    points.push({ lat, lng });
  }

  return points;
}
