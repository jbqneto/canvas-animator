/**
 * World map for route animations. Data: world-atlas (Natural Earth, public domain), loaded on demand
 * so the editor bundle stays small. Country names in the interface language via i18n-iso-countries.
 */
import type { Feature, FeatureCollection, Geometry, MultiPolygon, Polygon } from 'geojson';
import { geoArea, geoCentroid, geoNaturalEarth1, geoPath, GeoProjection } from 'd3-geo';
import { getLocale, Locale } from '../i18n';

export interface Country {
  /** ISO 3166-1 numeric id used by world-atlas. */
  id: string;
  name: string;
  feature: Feature<Geometry>;
}

export interface World {
  countries: Country[];
}

// Geometry is shared; only the names depend on the language
const worldPromises: Partial<Record<Locale, Promise<World>>> = {};

export function loadWorld(locale: Locale = getLocale()): Promise<World> {
  worldPromises[locale] ??= (async () => {
    const lang = locale === 'pt-BR' ? 'pt' : 'en';
    const [topoModule, topojson, isoModule, langModule] = await Promise.all([
      import('world-atlas/countries-50m.json'),
      import('topojson-client'),
      import('i18n-iso-countries'),
      lang === 'pt' ? import('i18n-iso-countries/langs/pt.json') : import('i18n-iso-countries/langs/en.json'),
    ]);
    const topo = (topoModule as any).default ?? topoModule;
    const iso = (isoModule as any).default ?? isoModule;
    iso.registerLocale((langModule as any).default ?? langModule);

    const collection = topojson.feature(topo, topo.objects.countries) as unknown as FeatureCollection;
    const countries = collection.features
      .filter((f) => f.id !== undefined && f.geometry)
      .map((f) => {
        const id = String(f.id);
        const alpha2 = iso.numericToAlpha2(id);
        const name = (alpha2 && iso.getName(alpha2, lang)) || (f.properties as any)?.name || id;
        return { id, name, feature: f };
      })
      .sort((a, b) => a.name.localeCompare(b.name, locale));
    return { countries };
  })();
  return worldPromises[locale]!;
}

/**
 * Where a pin/plane should land for a country: centroid of its largest polygon, so overseas
 * territories (French Guiana, Alaska…) don't drag the point into the ocean.
 */
export function countryAnchor(country: Country): [number, number] {
  return geoCentroid(mainTerritory(country));
}

/** The country's largest polygon (its mainland). */
function mainTerritory(country: Country): Geometry {
  const geom = country.feature.geometry;
  if (geom.type !== 'MultiPolygon') return geom;
  const polys = (geom as MultiPolygon).coordinates.map((coordinates) => ({ type: 'Polygon', coordinates }) as Polygon);
  return polys.reduce((best, p) => (geoArea(p) > geoArea(best) ? p : best));
}

export type MapFraming = 'world' | 'route';

export function makeProjection(
  world: World,
  width: number,
  height: number,
  framing: MapFraming,
  routeIds: string[]
): GeoProjection {
  const projection = geoNaturalEarth1();
  // Route framing leaves more room so neighbouring countries give context
  const margin = Math.round(Math.min(width, height) * (framing === 'route' ? 0.2 : 0.06));
  const extent: [[number, number], [number, number]] = [
    [margin, margin],
    [width - margin, height - margin],
  ];
  if (framing === 'route' && routeIds.length > 0) {
    // Frame the countries' main territories (same rule as the anchors)
    const features = world.countries
      .filter((c) => routeIds.includes(c.id))
      .map((c) => ({ type: 'Feature', properties: {}, geometry: mainTerritory(c) }) as Feature<Geometry>);
    projection.fitExtent(extent, { type: 'FeatureCollection', features } as FeatureCollection);
  } else {
    projection.fitExtent(extent, { type: 'Sphere' });
  }
  return projection;
}

export interface MapStyle {
  ocean: string;
  land: string;
  border: string;
  highlight: string;
}

export const DEFAULT_MAP_STYLE: MapStyle = {
  ocean: '#0b1220',
  land: '#1e293b',
  border: '#334155',
  highlight: '#0ea5e9',
};

/** Draws the map once into an image (WebP data URL) at the stage size. */
export function renderMapImage(
  world: World,
  projection: GeoProjection,
  width: number,
  height: number,
  style: MapStyle,
  highlightIds: string[]
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const path = geoPath(projection, ctx);

  ctx.fillStyle = style.ocean;
  ctx.fillRect(0, 0, width, height);

  ctx.lineWidth = Math.max(0.5, width / 2400);
  ctx.strokeStyle = style.border;
  world.countries.forEach((c) => {
    ctx.beginPath();
    path(c.feature);
    ctx.fillStyle = highlightIds.includes(c.id) ? style.highlight : style.land;
    ctx.globalAlpha = highlightIds.includes(c.id) ? 0.55 : 1;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.stroke();
  });
  return canvas.toDataURL('image/webp', 0.95);
}
