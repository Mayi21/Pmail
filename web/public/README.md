# PMail Favicon & Icons

## Design Philosophy

The PMail icons follow the **Neobrutalism** design style, featuring:

- **Bold black borders** (2.5-8px stroke width)
- **High-saturation colors** from the brand palette
- **Flat design** with no gradients or shadows
- **Simple, geometric shapes** for clarity at small sizes

## Color Palette

- **Cyan** `#4ECDC4` - Primary background color (matches theme)
- **Yellow** `#FFD670` - Accent color for envelope flaps
- **Magenta** `#FF6B9D` - Accent color for top flap
- **White** `#FFFFFF` - Envelope body
- **Black** `#000000` - Bold borders and outlines
- **Green** `#5FD068` - Decorative accent
- **Blue** `#6BB6FF` - Decorative accent

## Files

### favicon-simple.svg (32x32)
- Primary favicon for browser tabs
- Simplified envelope icon optimized for small sizes
- Features rounded corners and a notification dot

### favicon.svg (32x32)
- Alternative detailed favicon
- Full envelope with colorful flaps
- Used as fallback

### apple-touch-icon.svg (180x180)
- High-resolution icon for iOS devices
- Includes decorative elements (small squares)
- Used when users add the site to their home screen

### manifest.json
- Progressive Web App manifest
- Defines app metadata and icon references
- Enables installation as a standalone app

## Usage

All icons are automatically referenced in `index.html`:

```html
<!-- Favicon for modern browsers -->
<link rel="icon" type="image/svg+xml" href="/favicon-simple.svg" />
<!-- Fallback favicon -->
<link rel="alternate icon" type="image/svg+xml" href="/favicon.svg" />
<!-- Apple Touch Icon for iOS -->
<link rel="apple-touch-icon" href="/apple-touch-icon.svg" />
```

## Design Notes

The envelope icon represents:
- ✉️ **Email service** - Core functionality
- 🎨 **Neobrutalism style** - Matches UI design
- 🎯 **Brand identity** - Uses official color palette
- 📱 **Cross-platform** - SVG works on all devices

All icons use SVG format for:
- Sharp rendering at any size
- Small file size
- Easy maintenance and updates
