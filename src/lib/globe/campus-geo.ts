// CAMPUS GEOGRAPHY — static, verifiable placement data for the campus globe.
//
// The campuses table has city/state but no coordinates, so placement comes from here:
//   1. SCHOOL_COORDS — city-level lat/lng for every seeded campus (schools.generated slugs).
//      These are public facts (the university's town), accurate to ~0.1°, plenty for a globe.
//   2. STATE_CENTROIDS — the fallback for every other campus: its state's centroid, plus a small
//      DETERMINISTIC spread (hash of the slug, ≤ ±0.8°) so co-state dots stay individually
//      visible instead of stacking into one false-bright point. The spread is presentational —
//      the globe's legend says "positions approximate" — and deterministic so the same campus
//      always sits in the same spot.
//
// HONESTY RULE: a campus with no state match is NOT plotted (it is counted in the "+N more"
// line instead). Never invent a position that isn't at least state-true.

export const STATE_CENTROIDS: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64.2, -149.5], AZ: [34.3, -111.7], AR: [34.9, -92.4], CA: [37.2, -119.3],
  CO: [39.0, -105.5], CT: [41.6, -72.7], DE: [39.0, -75.5], DC: [38.9, -77.0], FL: [28.6, -82.4],
  GA: [32.6, -83.4], HI: [20.3, -156.4], ID: [44.4, -114.6], IL: [40.0, -89.2], IN: [39.9, -86.3],
  IA: [42.1, -93.5], KS: [38.5, -98.4], KY: [37.5, -85.3], LA: [31.0, -92.0], ME: [45.4, -69.2],
  MD: [39.0, -76.8], MA: [42.3, -71.8], MI: [44.3, -85.4], MN: [46.3, -94.3], MS: [32.7, -89.7],
  MO: [38.4, -92.5], MT: [47.0, -109.6], NE: [41.5, -99.8], NV: [39.3, -116.6], NH: [43.7, -71.6],
  NJ: [40.2, -74.7], NM: [34.4, -106.1], NY: [42.9, -75.5], NC: [35.5, -79.4], ND: [47.4, -100.5],
  OH: [40.3, -82.8], OK: [35.6, -97.5], OR: [43.9, -120.6], PA: [40.9, -77.8], RI: [41.7, -71.6],
  SC: [33.9, -80.9], SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7],
  VT: [44.1, -72.7], VA: [37.5, -78.9], WA: [47.4, -120.4], WV: [38.6, -80.6], WI: [44.6, -89.7],
  WY: [43.0, -107.6],
};

// Full state names → codes, because campuses.state stores either form depending on the import.
const STATE_NAMES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA", colorado: "CO",
  connecticut: "CT", delaware: "DE", "district of columbia": "DC", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA", kansas: "KS",
  kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD", massachusetts: "MA",
  michigan: "MI", minnesota: "MN", mississippi: "MS", missouri: "MO", montana: "MT",
  nebraska: "NE", nevada: "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH", oklahoma: "OK",
  oregon: "OR", pennsylvania: "PA", "rhode island": "RI", "south carolina": "SC",
  "south dakota": "SD", tennessee: "TN", texas: "TX", utah: "UT", vermont: "VT", virginia: "VA",
  washington: "WA", "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
};

/** City-level coordinates for the seeded campuses, keyed by campuses.slug. */
export const SCHOOL_COORDS: Record<string, [number, number]> = {
  "university-of-alabama": [33.21, -87.55],                    // Tuscaloosa, AL
  "albany-state-university": [31.56, -84.14],                  // Albany, GA
  "american-university": [38.94, -77.09],                      // Washington, DC
  "university-of-arizona": [32.23, -110.95],                   // Tucson, AZ
  "arizona-state-university": [33.42, -111.93],                // Tempe, AZ
  "university-of-arkansas": [36.07, -94.17],                   // Fayetteville, AR
  "arkansas-state-university": [35.84, -90.67],                // Jonesboro, AR
  "auburn-university": [32.60, -85.49],                        // Auburn, AL
  "ball-state-university": [40.20, -85.41],                    // Muncie, IN
  "baylor-university": [31.55, -97.11],                        // Waco, TX
  "binghamton-university": [42.09, -75.97],                    // Binghamton, NY
  "brandeis-university": [42.37, -71.26],                      // Waltham, MA
  "california-polytechnic-state-university": [35.30, -120.66], // San Luis Obispo, CA
  "campbell-university": [35.41, -78.74],                      // Buies Creek, NC
  "university-of-cincinnati": [39.13, -84.52],                 // Cincinnati, OH
  "clemson-university": [34.68, -82.84],                       // Clemson, SC
  "cleveland-state-university": [41.50, -81.68],               // Cleveland, OH
  "university-of-colorado-boulder": [40.01, -105.27],          // Boulder, CO
  "colorado-state-university": [40.57, -105.09],               // Fort Collins, CO
  "university-of-delaware": [39.68, -75.75],                   // Newark, DE
  "drexel-university": [39.96, -75.19],                        // Philadelphia, PA
  "eastern-michigan-university": [42.25, -83.62],              // Ypsilanti, MI
  "university-of-florida": [29.65, -82.34],                    // Gainesville, FL
  "florida-atlantic-university": [26.37, -80.10],              // Boca Raton, FL
  "florida-international-university": [25.76, -80.37],         // Miami, FL
  "florida-state-university": [30.44, -84.30],                 // Tallahassee, FL
  "furman-university": [34.92, -82.44],                        // Greenville, SC
  "george-mason-university": [38.83, -77.31],                  // Fairfax, VA
  "george-washington-university": [38.90, -77.05],             // Washington, DC
  "university-of-georgia": [33.95, -83.37],                    // Athens, GA
  "georgia-state-university": [33.75, -84.39],                 // Atlanta, GA
  "georgia-institute-of-technology": [33.78, -84.40],          // Atlanta, GA
  "university-of-houston": [29.72, -95.34],                    // Houston, TX
  "howard-university": [38.92, -77.02],                        // Washington, DC
  "university-of-illinois-urbana-champaign": [40.10, -88.23],  // Urbana-Champaign, IL
  "indiana-university-bloomington": [39.17, -86.52],           // Bloomington, IN
  "university-of-iowa": [41.66, -91.54],                       // Iowa City, IA
  "iowa-state-university": [42.03, -93.65],                    // Ames, IA
  "jacksonville-state-university": [33.82, -85.76],            // Jacksonville, AL
  "james-madison-university": [38.44, -78.87],                 // Harrisonburg, VA
  "university-of-kansas": [38.96, -95.25],                     // Lawrence, KS
  "kansas-state-university": [39.19, -96.58],                  // Manhattan, KS
  "university-of-kentucky": [38.03, -84.50],                   // Lexington, KY
  "lamar-university": [30.04, -94.07],                         // Beaumont, TX
  "university-of-louisville": [38.21, -85.76],                 // Louisville, KY
  "loyola-university-chicago": [41.99, -87.66],                // Chicago, IL
  "louisiana-state-university": [30.41, -91.18],               // Baton Rouge, LA
  "university-of-maryland": [38.99, -76.94],                   // College Park, MD
  "university-of-miami": [25.72, -80.28],                      // Coral Gables, FL
  "miami-university-ohio": [39.51, -84.73],                    // Oxford, OH
  "michigan-state-university": [42.70, -84.48],                // East Lansing, MI
  "university-of-minnesota": [44.97, -93.24],                  // Minneapolis, MN
  "mississippi-state-university": [33.45, -88.79],             // Starkville, MS
  "university-of-missouri": [38.94, -92.33],                   // Columbia, MO
  "morehouse-college": [33.75, -84.41],                        // Atlanta, GA
  "north-carolina-state-university": [35.79, -78.67],          // Raleigh, NC
  "university-of-nebraska-lincoln": [40.82, -96.70],           // Lincoln, NE
  "new-york-university": [40.73, -73.99],                      // New York, NY
  "university-of-north-carolina-at-chapel-hill": [35.90, -79.05], // Chapel Hill, NC
  "north-dakota-state-university": [46.90, -96.80],            // Fargo, ND
  "northeastern-university": [42.34, -71.09],                  // Boston, MA
  "northwestern-university": [42.06, -87.68],                  // Evanston, IL
  "ohio-state-university": [40.00, -83.01],                    // Columbus, OH
  "university-of-oklahoma": [35.21, -97.44],                   // Norman, OK
  "oklahoma-state-university": [36.13, -97.07],                // Stillwater, OK
  "old-dominion-university": [36.89, -76.31],                  // Norfolk, VA
  "university-of-mississippi": [34.36, -89.54],                // Oxford, MS
  "university-of-oregon": [44.04, -123.07],                    // Eugene, OR
  "oregon-state-university": [44.56, -123.28],                 // Corvallis, OR
  "pennsylvania-state-university": [40.80, -77.86],            // State College, PA
  "university-of-pittsburgh": [40.44, -79.96],                 // Pittsburgh, PA
  "purdue-university": [40.42, -86.92],                        // West Lafayette, IN
  "rochester-institute-of-technology": [43.08, -77.67],        // Rochester, NY
  "rutgers-university": [40.50, -74.45],                       // New Brunswick, NJ
  "sam-houston-state-university": [30.71, -95.55],             // Huntsville, TX
  "san-diego-state-university": [32.78, -117.07],              // San Diego, CA
  "san-francisco-state-university": [37.72, -122.48],          // San Francisco, CA
  "savannah-state-university": [32.03, -81.07],                // Savannah, GA
  "southern-methodist-university": [32.84, -96.78],            // Dallas, TX
  "university-of-south-carolina": [33.99, -81.03],             // Columbia, SC
  "stephen-f-austin-state-university": [31.62, -94.65],        // Nacogdoches, TX
  "suffolk-university": [42.36, -71.06],                       // Boston, MA
  "syracuse-university": [43.04, -76.14],                      // Syracuse, NY
  "texas-christian-university": [32.71, -97.36],               // Fort Worth, TX
  "university-of-tennessee-knoxville": [35.95, -83.93],        // Knoxville, TN
  "university-of-texas-at-austin": [30.28, -97.73],            // Austin, TX
  "texas-aandm-university": [30.61, -96.34],                   // College Station, TX
  "texas-state-university": [29.89, -97.94],                   // San Marcos, TX
  "texas-tech-university": [33.58, -101.87],                   // Lubbock, TX
  "the-university-of-texas-at-arlington": [32.73, -97.11],     // Arlington, TX
  "the-university-of-texas-at-dallas": [32.99, -96.75],        // Richardson, TX
  "the-university-of-texas-at-san-antonio": [29.58, -98.62],   // San Antonio, TX
  "troy-university": [31.80, -85.95],                          // Troy, AL
  "university-of-central-florida": [28.60, -81.20],            // Orlando, FL
  "university-of-colorado-colorado-springs": [38.89, -104.80], // Colorado Springs, CO
  "university-of-idaho": [46.73, -117.01],                     // Moscow, ID
  "university-of-illinois-chicago": [41.87, -87.65],           // Chicago, IL
  "university-of-massachusetts-dartmouth": [41.63, -71.00],    // Dartmouth, MA
  "university-of-massachusetts-lowell": [42.65, -71.32],       // Lowell, MA
  "university-of-north-carolina-at-charlotte": [35.31, -80.73], // Charlotte, NC
  "university-of-north-carolina-at-greensboro": [36.07, -79.81], // Greensboro, NC
  "university-of-north-texas": [33.21, -97.15],                // Denton, TX
  "university-of-pennsylvania": [39.95, -75.19],               // Philadelphia, PA
  "university-of-south-florida": [28.06, -82.41],              // Tampa, FL
  "university-of-southern-mississippi": [31.33, -89.33],       // Hattiesburg, MS
  "university-of-texas-at-el-paso": [31.77, -106.50],          // El Paso, TX
  "university-of-toledo": [41.66, -83.61],                     // Toledo, OH
  "university-of-vermont": [44.48, -73.20],                    // Burlington, VT
  "university-of-wisconsinmilwaukee": [43.08, -87.88],         // Milwaukee, WI
  "university-of-southern-california": [34.02, -118.29],       // Los Angeles, CA
  "university-of-utah": [40.76, -111.85],                      // Salt Lake City, UT
  "vanderbilt-university": [36.14, -86.80],                    // Nashville, TN
  "university-of-virginia": [38.04, -78.51],                   // Charlottesville, VA
  "virginia-tech": [37.23, -80.42],                            // Blacksburg, VA
  "university-of-washington": [47.66, -122.30],                // Seattle, WA
  "west-virginia-university": [39.65, -79.97],                 // Morgantown, WV
  "western-kentucky-university": [36.99, -86.46],              // Bowling Green, KY
  "winston-salem-state-university": [36.09, -80.22],           // Winston-Salem, NC
  "university-of-wisconsin-madison": [43.08, -89.42],          // Madison, WI
};

/** Deterministic per-slug spread in [-1, 1] — same campus, same spot, every render. */
function slugSpread(slug: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < slug.length; i++) { h ^= slug.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 2000) / 1000 - 1;
}

/** Resolve a campus to [lat, lng], or null when it cannot be honestly placed. */
export function campusLatLng(slug: string | null, state: string | null): [number, number] | null {
  if (slug && SCHOOL_COORDS[slug]) return SCHOOL_COORDS[slug];
  const raw = (state ?? "").trim();
  if (!raw) return null;
  const code = raw.length === 2 ? raw.toUpperCase() : STATE_NAMES[raw.toLowerCase()] ?? "";
  const c = STATE_CENTROIDS[code];
  if (!c) return null;
  const key = slug ?? raw;
  return [c[0] + slugSpread(key, 7) * 0.8, c[1] + slugSpread(key, 13) * 0.8];
}
