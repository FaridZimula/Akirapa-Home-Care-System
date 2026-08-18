import { NextResponse } from 'next/server';

const US_STATES_MAP: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR', 'california': 'CA',
  'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE', 'florida': 'FL', 'georgia': 'GA',
  'hawaii': 'HI', 'idaho': 'ID', 'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA',
  'kansas': 'KS', 'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS', 'missouri': 'MO',
  'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV', 'new hampshire': 'NH', 'new jersey': 'NJ',
  'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH',
  'oklahoma': 'OK', 'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT', 'vermont': 'VT',
  'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV', 'wisconsin': 'WI', 'wyoming': 'WY',
  'district of columbia': 'DC', 'puerto rico': 'PR', 'guam': 'GU', 'virgin islands': 'VI'
};

function getStateAbbr(stateName?: string): string {
  if (!stateName) return '';
  const cleaned = stateName.trim().toLowerCase();
  if (cleaned.length === 2) return cleaned.toUpperCase();
  return US_STATES_MAP[cleaned] || stateName;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q')?.trim() || '';

    if (!query || query.length < 2) {
      return NextResponse.json({ suggestions: [] });
    }

    // Query Nominatim restricted to US locations
    const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=us&limit=6&q=${encodeURIComponent(query)}`;
    
    const res = await fetch(nominatimUrl, {
      headers: {
        'User-Agent': 'AkirapaHomeCareSystem/1.0 (US Location Service)'
      },
      next: { revalidate: 3600 }
    });

    if (!res.ok) {
      return NextResponse.json({ suggestions: [] });
    }

    const data = await res.json();

    const suggestions = (data || []).map((item: any) => {
      const addr = item.address || {};
      const houseNumber = addr.house_number || '';
      const road = addr.road || addr.pedestrian || addr.street || addr.suburb || '';
      let street = [houseNumber, road].filter(Boolean).join(' ');
      
      if (!street && item.display_name) {
        street = item.display_name.split(',')[0] || query;
      }

      const city = addr.city || addr.town || addr.village || addr.municipality || addr.county || '';
      const state = getStateAbbr(addr.state);
      const zip = addr.postcode ? addr.postcode.split('-')[0] : '';

      // Format standard US single-line address
      let full = street;
      if (city) full += `, ${city}`;
      if (state) full += `, ${state}`;
      if (zip) full += ` ${zip}`;

      return {
        id: item.place_id || Math.random().toString(),
        street,
        city,
        state,
        zip,
        full: full || item.display_name,
        lat: item.lat,
        lon: item.lon
      };
    });

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('US Location Autocomplete API Error:', err);
    return NextResponse.json({ suggestions: [] });
  }
}
