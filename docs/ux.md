# UX and MVP Screens

## Pages
- Home (public map)
- Login and signup (Cognito Hosted UI or custom)
- Employee dashboard (resident list, create/edit, assign points)
- Point detail (public)
- Admin (staff management, audit view)

## Map behavior
- Public map uses cluster markers at low zoom
- Bbox query on pan/zoom to load visible points
- Click map to create point (employee only)
- Drag marker to adjust location (optional, employee only)
- Geocoding used to store approximate address and accuracy

## Filters (public)
- Status (active/inactive)
- Precision (approx/exact)
- Updated since
- Region/zone code

## Data visibility
- Public details show only public fields
- Private fields never visible without employee/admin role
