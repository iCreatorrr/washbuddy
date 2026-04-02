export interface RegionDefinition {
  code: string;
  name: string;
  timezone: string;
  countryCode: string;
  currencyCode: string;
  center: { lat: number; lng: number };
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  cities: CityDefinition[];
}

export interface CityDefinition {
  name: string;
  regionCode: string;
  postalCodePrefix: string;
  center: { lat: number; lng: number };
  weight: number;
}

export const REGIONS: RegionDefinition[] = [
  {
    code: "NYC",
    name: "New York Metro",
    timezone: "America/New_York",
    countryCode: "US",
    currencyCode: "USD",
    center: { lat: 40.7128, lng: -74.006 },
    bbox: { minLat: 40.49, maxLat: 41.0, minLng: -74.26, maxLng: -73.7 },
    cities: [
      { name: "Bronx", regionCode: "NY", postalCodePrefix: "104", center: { lat: 40.8448, lng: -73.8648 }, weight: 0.2 },
      { name: "Brooklyn", regionCode: "NY", postalCodePrefix: "112", center: { lat: 40.6782, lng: -73.9442 }, weight: 0.15 },
      { name: "Queens", regionCode: "NY", postalCodePrefix: "113", center: { lat: 40.7282, lng: -73.7949 }, weight: 0.15 },
      { name: "Newark", regionCode: "NJ", postalCodePrefix: "071", center: { lat: 40.7357, lng: -74.1724 }, weight: 0.12 },
      { name: "Jersey City", regionCode: "NJ", postalCodePrefix: "073", center: { lat: 40.7178, lng: -74.0431 }, weight: 0.08 },
      { name: "Yonkers", regionCode: "NY", postalCodePrefix: "107", center: { lat: 40.9312, lng: -73.8987 }, weight: 0.08 },
      { name: "White Plains", regionCode: "NY", postalCodePrefix: "106", center: { lat: 41.034, lng: -73.7629 }, weight: 0.06 },
      { name: "Paterson", regionCode: "NJ", postalCodePrefix: "075", center: { lat: 40.9168, lng: -74.1718 }, weight: 0.06 },
      { name: "Stamford", regionCode: "CT", postalCodePrefix: "069", center: { lat: 41.0534, lng: -73.5387 }, weight: 0.05 },
      { name: "New Rochelle", regionCode: "NY", postalCodePrefix: "108", center: { lat: 40.9115, lng: -73.7824 }, weight: 0.05 },
    ],
  },
  {
    code: "DET",
    name: "Detroit Metro",
    timezone: "America/Detroit",
    countryCode: "US",
    currencyCode: "USD",
    center: { lat: 42.3314, lng: -83.0458 },
    bbox: { minLat: 42.0, maxLat: 42.7, minLng: -83.6, maxLng: -82.7 },
    cities: [
      { name: "Detroit", regionCode: "MI", postalCodePrefix: "482", center: { lat: 42.3314, lng: -83.0458 }, weight: 0.25 },
      { name: "Dearborn", regionCode: "MI", postalCodePrefix: "481", center: { lat: 42.3222, lng: -83.1763 }, weight: 0.12 },
      { name: "Warren", regionCode: "MI", postalCodePrefix: "480", center: { lat: 42.4773, lng: -83.0277 }, weight: 0.1 },
      { name: "Sterling Heights", regionCode: "MI", postalCodePrefix: "483", center: { lat: 42.5803, lng: -83.0302 }, weight: 0.08 },
      { name: "Livonia", regionCode: "MI", postalCodePrefix: "481", center: { lat: 42.3684, lng: -83.3527 }, weight: 0.08 },
      { name: "Ann Arbor", regionCode: "MI", postalCodePrefix: "481", center: { lat: 42.2808, lng: -83.743 }, weight: 0.1 },
      { name: "Southfield", regionCode: "MI", postalCodePrefix: "480", center: { lat: 42.4734, lng: -83.2219 }, weight: 0.07 },
      { name: "Pontiac", regionCode: "MI", postalCodePrefix: "483", center: { lat: 42.6389, lng: -83.2911 }, weight: 0.07 },
      { name: "Taylor", regionCode: "MI", postalCodePrefix: "481", center: { lat: 42.2398, lng: -83.2697 }, weight: 0.07 },
      { name: "Troy", regionCode: "MI", postalCodePrefix: "480", center: { lat: 42.6056, lng: -83.1499 }, weight: 0.06 },
    ],
  },
  {
    code: "TOR",
    name: "Toronto Metro",
    timezone: "America/Toronto",
    countryCode: "CA",
    currencyCode: "CAD",
    center: { lat: 43.6532, lng: -79.3832 },
    bbox: { minLat: 43.4, maxLat: 44.0, minLng: -79.8, maxLng: -79.0 },
    cities: [
      { name: "Toronto", regionCode: "ON", postalCodePrefix: "M5", center: { lat: 43.6532, lng: -79.3832 }, weight: 0.25 },
      { name: "Scarborough", regionCode: "ON", postalCodePrefix: "M1", center: { lat: 43.7731, lng: -79.2577 }, weight: 0.12 },
      { name: "Etobicoke", regionCode: "ON", postalCodePrefix: "M9", center: { lat: 43.6205, lng: -79.5132 }, weight: 0.1 },
      { name: "North York", regionCode: "ON", postalCodePrefix: "M2", center: { lat: 43.7615, lng: -79.4111 }, weight: 0.1 },
      { name: "Mississauga", regionCode: "ON", postalCodePrefix: "L5", center: { lat: 43.589, lng: -79.6441 }, weight: 0.1 },
      { name: "Brampton", regionCode: "ON", postalCodePrefix: "L6", center: { lat: 43.7315, lng: -79.7624 }, weight: 0.08 },
      { name: "Markham", regionCode: "ON", postalCodePrefix: "L3", center: { lat: 43.8561, lng: -79.337 }, weight: 0.07 },
      { name: "Vaughan", regionCode: "ON", postalCodePrefix: "L4", center: { lat: 43.8361, lng: -79.4983 }, weight: 0.06 },
      { name: "Oakville", regionCode: "ON", postalCodePrefix: "L6H", center: { lat: 43.4675, lng: -79.6877 }, weight: 0.06 },
      { name: "Burlington", regionCode: "ON", postalCodePrefix: "L7L", center: { lat: 43.3255, lng: -79.799 }, weight: 0.06 },
    ],
  },
  {
    code: "MTL",
    name: "Montreal Metro",
    timezone: "America/Montreal",
    countryCode: "CA",
    currencyCode: "CAD",
    center: { lat: 45.5017, lng: -73.5673 },
    bbox: { minLat: 45.3, maxLat: 45.7, minLng: -73.9, maxLng: -73.3 },
    cities: [
      { name: "Montreal", regionCode: "QC", postalCodePrefix: "H2", center: { lat: 45.5017, lng: -73.5673 }, weight: 0.25 },
      { name: "Laval", regionCode: "QC", postalCodePrefix: "H7", center: { lat: 45.5833, lng: -73.75 }, weight: 0.15 },
      { name: "Longueuil", regionCode: "QC", postalCodePrefix: "J4", center: { lat: 45.5312, lng: -73.5185 }, weight: 0.1 },
      { name: "Brossard", regionCode: "QC", postalCodePrefix: "J4W", center: { lat: 45.4584, lng: -73.4551 }, weight: 0.08 },
      { name: "Saint-Laurent", regionCode: "QC", postalCodePrefix: "H4", center: { lat: 45.5, lng: -73.6667 }, weight: 0.08 },
      { name: "Dorval", regionCode: "QC", postalCodePrefix: "H9S", center: { lat: 45.4473, lng: -73.7421 }, weight: 0.07 },
      { name: "Pointe-Claire", regionCode: "QC", postalCodePrefix: "H9R", center: { lat: 45.449, lng: -73.8167 }, weight: 0.07 },
      { name: "Terrebonne", regionCode: "QC", postalCodePrefix: "J6W", center: { lat: 45.6961, lng: -73.6474 }, weight: 0.07 },
      { name: "Saint-Hubert", regionCode: "QC", postalCodePrefix: "J3Y", center: { lat: 45.4895, lng: -73.4159 }, weight: 0.07 },
      { name: "Repentigny", regionCode: "QC", postalCodePrefix: "J6A", center: { lat: 45.7422, lng: -73.4668 }, weight: 0.06 },
    ],
  },
  {
    code: "BUF",
    name: "Buffalo Metro",
    timezone: "America/New_York",
    countryCode: "US",
    currencyCode: "USD",
    center: { lat: 42.8864, lng: -78.8784 },
    bbox: { minLat: 42.7, maxLat: 43.1, minLng: -79.1, maxLng: -78.6 },
    cities: [
      { name: "Buffalo", regionCode: "NY", postalCodePrefix: "142", center: { lat: 42.8864, lng: -78.8784 }, weight: 0.25 },
      { name: "Cheektowaga", regionCode: "NY", postalCodePrefix: "142", center: { lat: 42.8934, lng: -78.7543 }, weight: 0.12 },
      { name: "Tonawanda", regionCode: "NY", postalCodePrefix: "141", center: { lat: 42.9826, lng: -78.8803 }, weight: 0.1 },
      { name: "Amherst", regionCode: "NY", postalCodePrefix: "142", center: { lat: 42.9784, lng: -78.7979 }, weight: 0.1 },
      { name: "West Seneca", regionCode: "NY", postalCodePrefix: "142", center: { lat: 42.8398, lng: -78.7692 }, weight: 0.08 },
      { name: "Lackawanna", regionCode: "NY", postalCodePrefix: "142", center: { lat: 42.8256, lng: -78.8237 }, weight: 0.07 },
      { name: "Hamburg", regionCode: "NY", postalCodePrefix: "140", center: { lat: 42.7157, lng: -78.8295 }, weight: 0.07 },
      { name: "Niagara Falls", regionCode: "NY", postalCodePrefix: "143", center: { lat: 43.0962, lng: -79.0377 }, weight: 0.08 },
      { name: "Kenmore", regionCode: "NY", postalCodePrefix: "142", center: { lat: 42.9651, lng: -78.8698 }, weight: 0.07 },
      { name: "Depew", regionCode: "NY", postalCodePrefix: "140", center: { lat: 42.9068, lng: -78.6926 }, weight: 0.06 },
    ],
  },
  {
    code: "WDC",
    name: "Washington DC Metro",
    timezone: "America/New_York",
    countryCode: "US",
    currencyCode: "USD",
    center: { lat: 38.9072, lng: -77.0369 },
    bbox: { minLat: 38.6, maxLat: 39.2, minLng: -77.5, maxLng: -76.8 },
    cities: [
      { name: "Washington", regionCode: "DC", postalCodePrefix: "200", center: { lat: 38.9072, lng: -77.0369 }, weight: 0.22 },
      { name: "Arlington", regionCode: "VA", postalCodePrefix: "222", center: { lat: 38.8816, lng: -77.0910 }, weight: 0.12 },
      { name: "Alexandria", regionCode: "VA", postalCodePrefix: "223", center: { lat: 38.8048, lng: -77.0469 }, weight: 0.1 },
      { name: "Silver Spring", regionCode: "MD", postalCodePrefix: "209", center: { lat: 38.9907, lng: -77.0261 }, weight: 0.1 },
      { name: "Bethesda", regionCode: "MD", postalCodePrefix: "208", center: { lat: 38.9807, lng: -77.1003 }, weight: 0.08 },
      { name: "College Park", regionCode: "MD", postalCodePrefix: "207", center: { lat: 38.9807, lng: -76.9369 }, weight: 0.07 },
      { name: "Fairfax", regionCode: "VA", postalCodePrefix: "220", center: { lat: 38.8462, lng: -77.3064 }, weight: 0.08 },
      { name: "Rockville", regionCode: "MD", postalCodePrefix: "208", center: { lat: 39.0840, lng: -77.1528 }, weight: 0.08 },
      { name: "Tysons", regionCode: "VA", postalCodePrefix: "221", center: { lat: 38.9187, lng: -77.2311 }, weight: 0.08 },
      { name: "Bowie", regionCode: "MD", postalCodePrefix: "207", center: { lat: 38.9428, lng: -76.7302 }, weight: 0.07 },
    ],
  },
];

export function getRegion(code: string): RegionDefinition {
  const r = REGIONS.find((r) => r.code === code);
  if (!r) throw new Error(`Unknown region: ${code}`);
  return r;
}
