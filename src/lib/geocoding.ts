// Google Geocoding (REST) + free Nominatim fallback for turning a typed
// address into lat/lng + canonical city/state/pincode. Ported from
// apps/admin/src/lib/geocoding.js — same provider logic and state-alias
// table, adapted to forward geocoding (address text -> coordinates) since
// mobile has no interactive map/pin-drop UI. Pure fetch, no native module.

const GOOGLE_MAPS_KEY = process.env.EXPO_PUBLIC_GOOGLE_MAPS_KEY;

// Google / OSM sometimes use alternate spellings that don't match our select values
const STATE_ALIASES: Record<string, string> = {
  "Jammu & Kashmir":                     "Jammu and Kashmir",
  "Andaman & Nicobar Islands":           "Andaman and Nicobar Islands",
  "Dadra & Nagar Haveli":                "Dadra and Nagar Haveli and Daman and Diu",
  "Dadra and Nagar Haveli":              "Dadra and Nagar Haveli and Daman and Diu",
  "Daman & Diu":                         "Dadra and Nagar Haveli and Daman and Diu",
  "Daman and Diu":                       "Dadra and Nagar Haveli and Daman and Diu",
  "Pondicherry":                         "Puducherry",
  "Orissa":                              "Odisha",
  "Uttaranchal":                         "Uttarakhand",
  "NCT of Delhi":                        "Delhi",
  "National Capital Territory of Delhi": "Delhi",
};

export function normaliseState(raw: string | undefined | null, indianStates: string[]): string {
  if (!raw) return "";
  if (indianStates.includes(raw)) return raw;
  if (STATE_ALIASES[raw]) return STATE_ALIASES[raw];
  const lower = raw.toLowerCase();
  return indianStates.find(s => s.toLowerCase() === lower) || "";
}

export interface GeocodeResult {
  formattedAddress: string;
  streetLocality: string;
  city: string;
  state: string;
  pincode: string;
  lat: string;
  lng: string;
}

async function forwardGeocodeGoogle(query: string, indianStates: string[]): Promise<GeocodeResult> {
  const res = await fetch(
    `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${GOOGLE_MAPS_KEY}&language=en&region=IN`
  );
  if (!res.ok) throw new Error("Google geocoding request failed");
  const data = await res.json();
  if (data.status !== "OK" || !data.results?.length) throw new Error(`No location found for that address`);

  const best = data.results[0];
  const comps: any[] = best.address_components;
  const get = (...types: string[]) => {
    for (const type of types) {
      const c = comps.find(c => c.types.includes(type));
      if (c) return c.long_name as string;
    }
    return "";
  };

  const sub2 = get("sublocality_level_2");
  const sub1 = get("sublocality_level_1", "sublocality");

  return {
    formattedAddress: best.formatted_address || query,
    streetLocality:   sub1 || sub2 || "",
    city:             get("locality", "administrative_area_level_3", "administrative_area_level_2"),
    state:            normaliseState(get("administrative_area_level_1"), indianStates),
    pincode:          get("postal_code").replace(/\D/g, "").slice(0, 6),
    lat:              String(parseFloat(best.geometry.location.lat.toFixed(6))),
    lng:              String(parseFloat(best.geometry.location.lng.toFixed(6))),
  };
}

async function forwardGeocodeNominatim(query: string, indianStates: string[]): Promise<GeocodeResult> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=1&countrycodes=in`,
    { headers: { "Accept-Language": "en-IN,en" } }
  );
  if (!res.ok) throw new Error("Location lookup failed");
  const data = await res.json();
  if (!data?.length) throw new Error("No location found for that address");

  const best = data[0];
  const addr = best.address || {};

  return {
    formattedAddress: best.display_name || query,
    streetLocality:    addr.residential || addr.suburb || addr.neighbourhood || addr.quarter || "",
    city:              addr.city || addr.town || addr.municipality || addr.village || addr.county || "",
    state:             normaliseState(addr.state, indianStates),
    pincode:           (addr.postcode || "").replace(/\D/g, "").slice(0, 6),
    lat:               String(parseFloat(parseFloat(best.lat).toFixed(6))),
    lng:               String(parseFloat(parseFloat(best.lon).toFixed(6))),
  };
}

/* Choose the best available geocoding provider */
export async function forwardGeocode(query: string, indianStates: string[]): Promise<GeocodeResult> {
  if (GOOGLE_MAPS_KEY) return forwardGeocodeGoogle(query, indianStates);
  return forwardGeocodeNominatim(query, indianStates);
}
