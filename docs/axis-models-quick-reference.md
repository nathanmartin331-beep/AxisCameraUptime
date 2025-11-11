# Axis Camera Models - Quick Reference

**Last Updated**: 2025-11-11

---

## 🎯 Top 15 Recommended Models

### P Series (Fixed Cameras) - 5 Models
| Model | Resolution | FPS | Audio | IR | Use Case |
|-------|------------|-----|-------|----|----|
| **AXIS P1455-LE** | 2MP (1080p) | 60 | ✅ | ✅ | Outdoor, wide temp range |
| **AXIS P3255-LVE** | 2MP (1080p) | 60 | ✅ | ✅ | Dome, vandal-resistant |
| **AXIS P3265-LVE** | 2MP (1080p) | 60 | ✅ | ✅ | Varifocal dome, remote zoom |
| **AXIS P3375-V** | 2MP (1080p) | 60 | ✅ | ❌ | Indoor dome, compact |
| **AXIS P5655-E** | 2MP (1080p) | 60 | ✅ | ✅ | Outdoor PTZ-ready housing |

### Q Series (PTZ Cameras) - 4 Models
| Model | Resolution | FPS | PTZ | Zoom | Use Case |
|-------|------------|-----|-----|------|----------|
| **AXIS Q6155-E** | 2MP (1080p) | 60 | ✅ | 32x | Outdoor PTZ |
| **AXIS Q6215-LE** | 2MP (1080p) | 60 | ✅ | 30x | PTZ with built-in IR |
| **AXIS Q6128-E** | 4K (2160p) | 30 | ✅ | 40x | High-res PTZ |
| **AXIS Q3538-LVE** | 4K (2160p) | 30 | ❌ | N/A | Fixed 4K dome |

### M Series (Multi-Sensor) - 3 Models
| Model | Resolution | FPS | Sensors | Coverage | Use Case |
|-------|------------|-----|---------|----------|----------|
| **AXIS M3067-P** | 6MP | 30 | 1 | 180° | Panoramic |
| **AXIS M3068-P** | 12MP | 20 | 4×3MP | 360° | Multi-sensor, 360° |
| **AXIS M3205-LVE** | 2MP (1080p) | 60 | 1 | Standard | Mini dome |

### F Series (Modular) - 3 Models
| Model | Resolution | FPS | Audio | Use Case |
|-------|------------|-----|-------|----------|
| **AXIS F41** | 2MP (1080p) | 30 | ❌ | Modular main unit |
| **AXIS F44** | 5MP | 30 | ❌ | High-res modular |
| **AXIS F1035-E** | 2MP (1080p) | 60 | ✅ | Sensor unit |

---

## 🔌 VAPIX API Endpoints

### Universal (All Models)
```bash
# Health check (no auth)
http://{ip}/axis-cgi/systemready.cgi

# Device info (auth required)
http://{ip}/axis-cgi/param.cgi?action=list&group=Brand

# Capabilities (auth required)
http://{ip}/axis-cgi/param.cgi?action=list&group=Properties

# Image snapshot (auth required)
http://{ip}/axis-cgi/jpg/image.cgi
```

### PTZ Only (Q Series)
```bash
# Continuous PTZ
http://{ip}/axis-cgi/com/ptz.cgi?continuouspantiltmove=10,10

# Goto preset
http://{ip}/axis-cgi/com/ptz.cgi?gotoserverpresetno=1

# Query capabilities
http://{ip}/axis-cgi/com/ptz.cgi?query=position
```

### Multi-Sensor (M Series)
```bash
# Get sensor 1 image
http://{ip}/axis-cgi/jpg/image.cgi?camera=1

# Get panoramic (stitched)
http://{ip}/axis-cgi/jpg/image.cgi?camera=0
```

---

## 🔍 Detection Strategy

### Step 1: Health Check (No Auth)
```bash
curl http://{ip}/axis-cgi/systemready.cgi
# Returns: systemready=yes\nuptime=123456\nbootid=abc123
```

### Step 2: Get Model (With Auth)
```bash
curl -u username:password \
  "http://{ip}/axis-cgi/param.cgi?action=list&group=Brand"
# Returns: root.Brand.ProdNbr=P3255-LVE
```

### Step 3: Get Capabilities (With Auth)
```bash
curl -u username:password \
  "http://{ip}/axis-cgi/param.cgi?action=list&group=Properties"
# Returns:
#   root.Properties.PTZ.PTZ=yes/no
#   root.Properties.Audio.Audio=yes/no
#   root.Properties.Image.NbrOfViews=1/4
```

---

## 📊 Series Comparison

| Feature | P Series | Q Series | M Series | F Series |
|---------|----------|----------|----------|----------|
| **Type** | Fixed | PTZ | Multi-Sensor | Modular |
| **PTZ** | ❌ | ✅ | ❌ | ❌ |
| **Audio** | ⚠️ Most | ✅ All | ✅ Most | ⚠️ Some |
| **Resolution** | 2MP-8MP | 2MP-4K | 2MP-12MP | 2MP-5MP |
| **FPS** | 30-60 | 30-60 | 20-60 | 30-60 |
| **Price** | $$-$$$$ | $$$$-$$$$$ | $$$$$+ | $$-$$$$$ |
| **Use Case** | General | Large areas | Panoramic | Custom |

---

## 🛠️ Implementation Checklist

### Phase 1: Detection
- [ ] Implement param.cgi parser
- [ ] Create detection service
- [ ] Add model database fields
- [ ] Test with 3+ models

### Phase 2: Model-Aware Monitoring
- [ ] Adjust polling based on capabilities
- [ ] Add PTZ status checks (Q series)
- [ ] Multi-sensor support (M series)
- [ ] Model-specific error handling

### Phase 3: UI Enhancements
- [ ] Show model name and series
- [ ] Display capabilities badges
- [ ] Add PTZ controls (Q series)
- [ ] Multi-view selector (M series)

### Phase 4: Advanced Features
- [ ] Firmware version tracking
- [ ] Update notifications
- [ ] Model-specific presets
- [ ] Analytics integration

---

## 🔐 Security Notes

### Authentication
- systemready.cgi: **No auth required** (by design)
- param.cgi: **Auth required** (HTTP Basic)
- jpg/image.cgi: **Auth required** (HTTP Basic)
- com/ptz.cgi: **Auth required** (HTTP Basic)

### Credentials
- ✅ Store encrypted (bcryptjs)
- ✅ Never log in plaintext
- ⚠️ Use HTTPS for param.cgi (future)
- ⚠️ Implement OAuth support (future)

---

## 📈 VAPIX Version Support

| Version | Year | Features | Support Status |
|---------|------|----------|----------------|
| **VAPIX 3.x** | 2018+ | REST, JSON, OAuth | ✅ All 2020+ models |
| **VAPIX 2.x** | 2010-2018 | Enhanced CGI | ✅ 2015-2020 models |
| **VAPIX 1.x** | 2005-2010 | Basic CGI | ⚠️ Legacy only |

**Current System**: VAPIX 2.x and 3.x compatible

---

## 🎓 Key Learnings

### What We Know Works
1. ✅ systemready.cgi is universal across all Axis cameras
2. ✅ param.cgi provides comprehensive model detection
3. ✅ jpg/image.cgi requires auth and supports multi-channel
4. ✅ PTZ cameras require separate API endpoints
5. ✅ Multi-sensor cameras use camera=N parameter

### What's Model-Specific
1. ⚠️ PTZ controls (only Q series)
2. ⚠️ Audio availability (model-dependent)
3. ⚠️ Multi-sensor support (M series only)
4. ⚠️ Analytics capabilities (higher-end models)
5. ⚠️ Edge storage (model-dependent)

### What to Implement First
1. 🎯 Model detection via param.cgi
2. 🎯 Store model info in database
3. 🎯 Show capabilities in UI
4. 🎯 Adjust monitoring by model
5. 🎯 Add PTZ controls (phase 2)

---

## 📚 Resources

- **Full Research**: `/workspaces/AxisCameraUptime/docs/axis-camera-models-research.md`
- **VAPIX Docs**: https://www.axis.com/vapix-library/
- **Product Selector**: https://www.axis.com/products/network-cameras
- **VAPIX Validation**: `/workspaces/AxisCameraUptime/VAPIX_VALIDATION_GUIDE.md`

---

**Status**: ✅ Research Complete | 15+ Models Identified | Ready for Implementation
