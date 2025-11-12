# TODO: Convert Land Cover to km² Units

## Tasks
- [ ] Update backend to convert pixel counts to km²
- [ ] Modify frontend display to show km² instead of pixel counts
- [ ] Add unit labels (km²) to land cover values
- [ ] Include tooltips explaining area calculation
- [ ] Round values to 2 decimal places
- [ ] Add percentage of total polygon area
- [ ] Validate total area matches polygon size

## Details
- Formula: Area (km²) = Pixel Count × (Resolution² / 1,000,000)
- Resolution: 10m → 0.0001 km² per pixel
- Display format: "Forest: 12.50 km² (25.3%)"
- Target section: Statistics tab land cover summary
