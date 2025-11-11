# UI Mockup - Camera Model Display

## Camera Table View

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│ Status  │ Camera Name    │ Model              │ IP Address    │ Location │ ...    │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 🟢      │ Front Entrance │ P3255-LVE [P]      │ 192.168.1.10 │ Floor 1  │ ...    │
│         │                │ [🎤]               │              │          │        │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 🟢      │ Parking Lot    │ Q6155-E [Q]        │ 192.168.1.11 │ Outside  │ ...    │
│         │                │ [⟲][🎤]            │              │          │        │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 🟢      │ Lobby 360      │ M3068-P [M]        │ 192.168.1.12 │ Lobby    │ ...    │
│         │                │ [🎤][📷×4]          │              │          │        │
├────────────────────────────────────────────────────────────────────────────────────┤
│ 🟢      │ New Camera     │ ⏳ Detecting...     │ 192.168.1.13 │ Floor 2  │ ...    │
└────────────────────────────────────────────────────────────────────────────────────┘

Legend:
[P] = P-Series (blue badge)
[Q] = Q-Series (green badge)
[M] = M-Series (purple badge)
[F] = F-Series (orange badge)
⟲  = PTZ support
🎤 = Audio support
📷×4 = Multi-sensor (4 views)
⏳ = Detecting model...
```

## Camera Detail View - Model Information Card

```
┌─────────────────────────────────────────────────────────────────┐
│  Model Information                                  [↻ Detect]  │
│  Camera model and capabilities                                  │
├─────────────────────────────────────────────────────────────────┤
│  Model           P3255-LVE [P Series]                          │
│  Full Name       AXIS P3255-LVE Network Camera                 │
│  Firmware        9.80.1                                        │
│  Detected        Nov 11, 02:30 PM                              │
└─────────────────────────────────────────────────────────────────┘
```

## Camera Detail View - Capabilities Card

```
┌─────────────────────────────────────────────────────────────────┐
│  Capabilities                                                   │
│  Camera features and specifications                            │
├─────────────────────────────────────────────────────────────────┤
│  PTZ Support     ⟲ Yes                                         │
│  Audio Support   🎤 Yes                                         │
│  Resolution      1920x1080                                     │
│  Max Framerate   60 fps                                        │
│  Views/Sensors   📷 4                                           │
└─────────────────────────────────────────────────────────────────┘
```

## Camera Detail View - No Model Detected

```
┌─────────────────────────────────────────────────────────────────┐
│  Model Information                                  [↻ Detect]  │
│  Camera model and capabilities                                  │
├─────────────────────────────────────────────────────────────────┤
│  Model           Unknown                                        │
│  Full Name       —                                             │
│  Firmware        —                                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│  Capabilities                                                   │
│  Camera features and specifications                            │
├─────────────────────────────────────────────────────────────────┤
│  PTZ Support     No                                            │
│  Audio Support   No                                            │
│  ───────────────────────────────────────────────────────────── │
│  ℹ️  Click the refresh button above to detect model            │
│     information                                                │
└─────────────────────────────────────────────────────────────────┘
```

## Add Camera Modal - Auto-Detect Message

```
┌─────────────────────────────────────────────────────────────────┐
│  Add New Camera                                          [×]    │
│  Enter the camera details and credentials for monitoring       │
├─────────────────────────────────────────────────────────────────┤
│  Camera Name *        [Main Entrance........................]  │
│  IP Address *         [192.168.1.100........................]  │
│  Username *           [admin................................]  │
│  Password *           [••••••..............................] │
│  Location             [Building A - Floor 1.................]  │
│  Notes                [....................................] │
│                       [....................................] │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │ ℹ️  Camera model and capabilities will be             │   │
│  │    automatically detected on the first successful      │   │
│  │    connection.                                         │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                 │
│           [Test Connection]  [Cancel]  [Save Camera]          │
└─────────────────────────────────────────────────────────────────┘
```

## Color Scheme

### Series Badges
```
┌─────────┬──────────────────────────────────────────────┐
│ Series  │ Badge Colors                                 │
├─────────┼──────────────────────────────────────────────┤
│ P       │ 🔵 Blue border, blue text, light blue bg    │
│ Q       │ 🟢 Green border, green text, light green bg  │
│ M       │ 🟣 Purple border, purple text, light purple  │
│ F       │ 🟠 Orange border, orange text, light orange  │
└─────────┴──────────────────────────────────────────────┘
```

### Capability Icons
```
┌──────────────┬──────────────────────────────────────────┐
│ Capability   │ Icon & Color                             │
├──────────────┼──────────────────────────────────────────┤
│ PTZ          │ ⟲ Move icon (gray, green if enabled)    │
│ Audio        │ 🎤 Mic icon (gray, green if enabled)     │
│ Multi-sensor │ 📷×N Camera icon with count (gray)       │
│ Detecting    │ ⏳ Loader spinning (gray)                │
└──────────────┴──────────────────────────────────────────┘
```

## Responsive Behavior

### Desktop (≥768px)
- Table: All columns visible
- Detail View: 2-column grid for cards
- Icons: Full size with labels

### Mobile (<768px)
- Table: Scrollable horizontally
- Detail View: Single column stack
- Icons: Compact with tooltips only

## Interaction States

### Detect Model Button
```
Normal:    [↻]  (clickable)
Loading:   [⟳]  (spinning, disabled)
Success:   [↻]  (clickable again)
Error:     [↻]  (clickable, toast shown)
```

### Loading States
```
Initial:     "Detecting..." with spinner
In Progress: Button spinning
Complete:    Model name displayed
Failed:      "Unknown" displayed
```

## Accessibility

- ✅ Tooltips for icon meanings
- ✅ ARIA labels on buttons
- ✅ Keyboard navigation support
- ✅ Screen reader friendly text
- ✅ Color contrast meets WCAG AA

## Animation

- 🔄 Spinner: Continuous rotation during detection
- 🔄 Button: Spin icon during API call
- ✨ Toast: Slide in from top-right
- 🎯 Hover: Subtle elevation on table rows

---

**Note**: This is a text-based mockup. Actual implementation uses React components with shadcn/ui styling.
